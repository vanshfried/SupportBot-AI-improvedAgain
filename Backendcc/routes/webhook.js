// Backend/routes/webhook.js
import express from "express";
import { pool } from "../db.js";

import { sendMessage, getMediaUrl } from "../services/whatsapp.js";
import { processMessage } from "../services/ai.js";

import {
  getMessagesByConversationId,
  addMessage,
  getOrCreateConversation,
} from "../store/conversations.js";
import { resolveCountry } from "../services/country.js";
import { pipeline } from "stream";
import { promisify } from "util";

const streamPipeline = promisify(pipeline);
const router = express.Router();

/**
 * ✅ VERIFY WEBHOOK
 */
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  res.sendStatus(403);
});

router.post("/", async (req, res) => {
  // ✅ respond immediately (Meta requires fast response)
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value) return;

    /* =========================
       ✅ STATUS UPDATES (SAFE)
    ========================= */
    if (Array.isArray(value.statuses)) {
      for (const status of value.statuses) {
        const messageId = status?.id;
        const state = status?.status;

        // ✅ strict validation
        if (!messageId || !["delivered", "read"].includes(state)) continue;

        if (state === "delivered") {
          await pool.query(
            `UPDATE messages
             SET status = 'delivered',
                 delivered_at = NOW()
             WHERE whatsapp_message_id = $1`,
            [messageId],
          );
        }

        if (state === "read") {
          await pool.query(
            `UPDATE messages
             SET status = 'read',
                 read_at = NOW()
             WHERE whatsapp_message_id = $1`,
            [messageId],
          );
        }
      }
      return;
    }

    /* =========================
       ✅ MESSAGE VALIDATION
    ========================= */
    const message = value.messages?.[0];

    if (!message) return;

    const from = message.from;
    const type = message.type;

    let text = null;
    let mediaId = null;
    let mediaType = null;

    if (type === "text") {
      text = message.text?.body;
    } else if (type === "image") {
      mediaId = message.image?.id;
      mediaType = "image";
    } else if (type === "video") {
      mediaId = message.video?.id;
      mediaType = "video";
    } else if (type === "document") {
      mediaId = message.document?.id;
      mediaType = "document";
    } else if (type === "audio") {
      mediaId = message.audio?.id;
      mediaType = "audio";
    }

    // ✅ reject invalid sender
    if (!from || typeof from !== "string") return;

    // ✅ optional: ignore non-text safely

    /* =========================
       🌍 COUNTRY (SAFE + ONCE)
    ========================= */
    const country = await resolveCountry(from);

    if (country?.id) {
      await pool.query(
        `UPDATE conversations
         SET country_id = $1
         WHERE sender_id = $2
         AND country_id IS NULL`,
        [country.id, from],
      );
    }

    /* =========================
       💾 SAVE INCOMING
    ========================= */
    await addMessage(from, "incoming", text, null, null, {
      mediaId,
      mediaType,
    });

    /* =========================
       🤖 ASYNC RESPONSE (NON-BLOCKING)
    ========================= */
    setImmediate(async () => {
      try {
        // ✅ CHECK IF HUMAN CHAT IS ACTIVE
        const convoCheck = await pool.query(
          `SELECT department_id, status 
   FROM conversations
   WHERE sender_id = $1
   AND status = 'active'
   ORDER BY created_at DESC
   LIMIT 1`,
          [from],
        );

        const convo = convoCheck.rows[0];

        // 🚫 If assigned to department → HUMAN MODE → STOP AI
        if (convo?.department_id) {
          const lower = (text || "").toLowerCase();

          // ✅ allow re-entry trigger
          const triggerWords = ["hr", "finance", "support", "department"];

          const wantsNewDept = triggerWords.some((word) =>
            lower.includes(word),
          );

          if (!wantsNewDept) {
            console.log("🤫 AI blocked (human active)");
            return;
          }

          // 🔁 user wants new dept → reset conversation
          await pool.query(
            `UPDATE conversations
     SET status = 'ended',
         ended_at = NOW()
     WHERE sender_id = $1
     AND status = 'active'`,
            [from],
          );

          console.log("🔁 Switching back to AI routing");
        }
        const reply = await processMessage(from, text);
        if (!reply) return;

        const messageId = await sendMessage(from, reply);

        await addMessage(from, "outgoing", reply, messageId, "sent");
      } catch (err) {
        console.error("Async reply error:", err);
      }
    });
  } catch (err) {
    console.error("Webhook error:", err);
  }
});

/**
 * ✅ GET CONVERSATIONS (HIERARCHY VERSION)
 */
router.get("/conversations", async (req, res) => {
  const user = req.session.user;

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    let query;
    let params = [];

    // 👑 SUPERADMIN → EVERYTHING
    if (user.role === "superadmin") {
      query = `
        SELECT 
          c.*,
          u.name AS assigned_name,
          u.role AS assigned_role,
          u.email AS assigned_email,
          d.name AS department_name
        FROM conversations c
        LEFT JOIN users u ON c.assigned_to = u.id
LEFT JOIN departments d ON c.department_id = d.id
        ORDER BY c.created_at DESC
      `;
    }

    // 🧑‍💼 ADMIN → ALL in department
    else if (user.role === "admin") {
      query = `
    SELECT 
      c.*,
      u.name AS assigned_name,
      u.role AS assigned_role,
      u.email AS assigned_email,
      d.name AS department_name
    FROM conversations c
    LEFT JOIN users u ON c.assigned_to = u.id
    LEFT JOIN departments d ON c.department_id = d.id
    WHERE c.department_id = $1
    ORDER BY c.created_at DESC
  `;
      params = [user.department_id];
    }

    // 👨‍💻 SUPPORT → hierarchy visibility
    else if (user.role === "support") {
      query = `
    SELECT 
      c.*,
      u.name AS assigned_name,
      u.role AS assigned_role,
      u.email AS assigned_email,
      d.name AS department_name
    FROM conversations c
    LEFT JOIN users u ON c.assigned_to = u.id
    LEFT JOIN departments d ON c.department_id = d.id
    WHERE c.department_id = $1
    AND c.country_id = $2
    AND (
      c.status = 'active'
      OR (
        c.status = 'ended'
        AND c.ended_at > NOW() - INTERVAL '48 hours'
      )
    )
    ORDER BY c.created_at DESC
  `;
      params = [user.department_id, user.country_id];
    }

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

/**
 * ✅ GET MESSAGES
 */
router.get("/conversations/:id/messages", async (req, res) => {
  const { id } = req.params;

  try {
    const messages = await pool.query(
      `
  SELECT direction, text, status, created_at, media_id, media_type
  FROM messages
  WHERE conversation_id = $1
  ORDER BY created_at ASC
  `,
      [id],
    );

    // 🔥 ADD THIS BLOCK
    const messagesWithMedia = await Promise.all(
      messages.rows.map(async (msg) => {
        if (msg.media_id) {
          try {
            const url = await getMediaUrl(msg.media_id);
            return { ...msg, media_url: url };
          } catch (err) {
            console.error("Media fetch failed:", err);
            return msg;
          }
        }
        return msg;
      }),
    );

    res.json(messagesWithMedia);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});
router.get("/media/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const metaRes = await fetch(`https://graph.facebook.com/v19.0/${id}`, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      },
    });

    const metaData = await metaRes.json();

    if (!metaData.url) {
      return res.status(400).json({ error: "Invalid media ID" });
    }

    const fileRes = await fetch(metaData.url, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      },
    });

    res.setHeader(
      "Content-Type",
      fileRes.headers.get("content-type") || "application/octet-stream",
    );

    // ✅ FIXED STREAMING
    await streamPipeline(fileRes.body, res);
  } catch (err) {
    console.error("Media proxy error:", err);
    res.status(500).json({ error: "Failed to fetch media" });
  }
});
export default router;
