// backend/routes/agent.js
import express from "express";
import { sendMessage, uploadMedia } from "../services/whatsapp.js";
import { addMessage } from "../store/conversations.js";
import { pool } from "../db.js";
import multer from "multer";
import fs from "fs";
import path from "path";

const router = express.Router();

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    const safeName = Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
});
/**
 * 📤 REPLY TO USER
 */
router.post("/reply", upload.array("files", 5), async (req, res) => {
  const { to, message } = req.body;
  const files = req.files || [];

  // =========================
  // ✅ VALIDATION
  // =========================
  if (!to || typeof to !== "string") {
    return res.status(400).json({ error: "Invalid recipient" });
  }

  if ((!message || !message.trim()) && files.length === 0) {
    return res.status(400).json({
      error: "Message or file is required",
    });
  }

  const user = req.session.user;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // =========================
    // 📥 GET ACTIVE CONVERSATION
    // =========================
    const convoRes = await pool.query(
      `SELECT c.*, u.role AS assigned_role
       FROM conversations c
       LEFT JOIN users u ON c.assigned_to = u.id
       WHERE c.sender_id = $1
       AND c.status = 'active'
       LIMIT 1`,
      [ to ],
    );

    const conversation = convoRes.rows[ 0 ];

    if (!conversation) {
      return res.status(404).json({
        error: "No active conversation found",
      });
    }

    // =========================
    // 🔒 DEPARTMENT REQUIRED
    // =========================
    if (!conversation.department_id) {
      return res.status(403).json({
        error: "Department not assigned yet",
      });
    }

    // =========================
    // 👨‍💻 SUPPORT RULES
    // =========================
    if (user.role === "support") {
      if (
        user.department_id !== conversation.department_id ||
        user.country_id !== conversation.country_id
      ) {
        return res.status(403).json({
          error: "Unauthorized for this chat",
        });
      }

      if (
        conversation.assigned_role === "admin" ||
        conversation.assigned_role === "superadmin"
      ) {
        return res.status(403).json({
          error: `Chat handled by ${conversation.assigned_role}`,
        });
      }

      // assign if unassigned
      if (!conversation.assigned_to) {
        await pool.query(
          `UPDATE conversations
           SET assigned_to = $1,
               assigned_role = $2
           WHERE id = $3 AND assigned_to IS NULL`,
          [ user.id, user.role, conversation.id ],
        );
      }

      // takeover after 20 min
      if (conversation.assigned_to && conversation.assigned_to !== user.id) {
        const result = await pool.query(
          `UPDATE conversations
           SET assigned_to = $1,
               assigned_role = $2
           WHERE id = $3
           AND last_agent_reply_at < NOW() - INTERVAL '20 minutes'
           RETURNING id`,
          [ user.id, user.role, conversation.id ],
        );

        if (result.rowCount === 0) {
          return res.status(403).json({
            error: "Another support agent is active",
          });
        }
      }
    }

    // =========================
    // 🧑‍💼 ADMIN RULES
    // =========================
    if (user.role === "admin") {
      if (user.department_id !== conversation.department_id) {
        return res.status(403).json({
          error: "Wrong department",
        });
      }

      if (conversation.assigned_role === "superadmin") {
        return res.status(403).json({
          error: "Handled by superadmin",
        });
      }

      await pool.query(
        `UPDATE conversations
         SET assigned_to = $1,
             assigned_role = $2
         WHERE id = $3`,
        [ user.id, user.role, conversation.id ],
      );
    }

    // =========================
    // 👑 SUPERADMIN RULES
    // =========================
    if (user.role === "superadmin") {
      await pool.query(
        `UPDATE conversations
         SET assigned_to = $1,
             assigned_role = $2
         WHERE id = $3`,
        [ user.id, user.role, conversation.id ],
      );
    }

    // =========================
    // 📤 HANDLE MEDIA
    // =========================
    let mediaList = [];

    if (files.length > 0) {
      for (const file of files) {
        try {
          const uploadRes = await uploadMedia(file.path);

          mediaList.push({
            id: uploadRes.id,
            mimeType: uploadRes.mimeType,
            filename: uploadRes.filename,
          });

          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        } catch (err) {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

          return res.status(500).json({
            error: err.message,
          });
        }
      }
    }

    // =========================
    // 📤 SEND MESSAGE
    // =========================
    const cleanMessage = message?.trim() || null;

    // ✅ 1. Send text
    if (cleanMessage) {
      const textId = await sendMessage(to, cleanMessage, null);

      if (!textId) {
        return res.status(500).json({
          error: "Failed to send text message",
        });
      }

      await addMessage(
        to,
        "outgoing",
        cleanMessage,
        textId,
        "sent",
        null,
        "agent",
        user.id,
      );
    }

    // ✅ 2. Send media (1 by 1)
    for (const media of mediaList) {
      const msgId = await sendMessage(to, null, media);

      if (!msgId) {
        return res.status(500).json({
          error: "Failed to send media",
        });
      }

      await addMessage(
        to,
        "outgoing",
        "[media]",
        msgId,
        "sent",
        null,
        "agent",
        user.id,
      );
    }

    // =========================
    // ⏱️ TRACK ACTIVITY
    // =========================
    await pool.query(
      `UPDATE conversations
       SET last_agent_reply_at = NOW(),
           last_agent_id = $1
       WHERE id = $2`,
      [ user.id, conversation.id ],
    );

    return res.json({
      success: true,
      conversationId: conversation.id,
    });
  } catch (err) {
    console.error("Agent reply error:", err.message);

    return res.status(500).json({
      error: "Failed to send message",
    });
  }
});
/**
 * 🔁 REOPEN CHAT
 */
router.post("/reopen", async (req, res) => {
  const user = req.session.user;
  const { conversation_id } = req.body;

  // =========================
  // ✅ VALIDATION
  // =========================
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!conversation_id) {
    return res.status(400).json({
      error: "conversation_id required",
    });
  }

  try {
    // =========================
    // 📥 GET CONVERSATION
    // =========================
    const convRes = await pool.query(
      `SELECT * FROM conversations WHERE id = $1`,
      [ conversation_id ],
    );

    const convo = convRes.rows[ 0 ];

    if (!convo) {
      return res.status(404).json({ error: "Not found" });
    }

    // 🔒 already active
    if (convo.status === "active") {
      return res.status(400).json({
        error: "Chat already active",
      });
    }

    // =========================
    // 🔥 GLOBAL RULE: ONLY ONE ACTIVE CHAT
    // =========================
    const active = await pool.query(
      `SELECT id FROM conversations
       WHERE sender_id = $1
       AND status = 'active'
       LIMIT 1`,
      [ convo.sender_id ],
    );

    if (active.rows.length > 0) {
      return res.status(403).json({
        error: "User already has an active chat",
      });
    }

    // =========================
    // 👨‍💻 SUPPORT RULES
    // =========================
    if (user.role === "support") {
      // ⏱️ within 48h
      const isWithin48h =
        convo.ended_at &&
        new Date(convo.ended_at) > new Date(Date.now() - 48 * 60 * 60 * 1000);

      const allowed =
        user.department_id === convo.department_id &&
        user.country_id === convo.country_id &&
        isWithin48h;

      if (!allowed) {
        return res.status(403).json({
          error: "Cannot reopen this chat",
        });
      }
    }

    // =========================
    // 🧑‍💼 ADMIN RULES
    // =========================
    if (user.role === "admin") {
      if (user.department_id !== convo.department_id) {
        return res.status(403).json({
          error: "Wrong department",
        });
      }
    }

    // 👑 SUPERADMIN → no restriction except global rule

    // =========================
    // 🔁 REOPEN (RACE SAFE)
    // =========================
    const result = await pool.query(
      `UPDATE conversations
       SET status = 'active',
           ended_at = NULL,
           assigned_to = NULL,
           assigned_role = NULL
       WHERE id = $1
       AND status = 'ended'
       RETURNING id`,
      [ conversation_id ],
    );

    if (result.rowCount === 0) {
      return res.status(409).json({
        error: "Chat already reopened",
      });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Reopen error:", err.message);

    return res.status(500).json({
      error: "Failed to reopen chat",
    });
  }
});
/**
 * 🟢 ASSIGN CHAT
 */
router.post("/assign", async (req, res) => {
  const user = req.session.user;
  const { conversation_id } = req.body;

  // =========================
  // ✅ VALIDATION
  // =========================
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!conversation_id) {
    return res.status(400).json({ error: "conversation_id required" });
  }

  try {
    // =========================
    // 📥 GET CONVERSATION
    // =========================
    const convo = await pool.query(
      `SELECT c.*, u.role AS assigned_role
       FROM conversations c
       LEFT JOIN users u ON c.assigned_to = u.id
       WHERE c.id = $1`,
      [ conversation_id ],
    );

    const c = convo.rows[ 0 ];

    if (!c) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    if (c.status !== "active") {
      return res.status(403).json({
        error: "Cannot assign ended chat",
      });
    }

    // =========================
    // 👨‍💻 SUPPORT RULES
    // =========================
    if (user.role === "support") {
      // dept + country restriction
      if (
        user.department_id !== c.department_id ||
        user.country_id !== c.country_id
      ) {
        return res.status(403).json({
          error: "Cannot assign this chat",
        });
      }

      // cannot override admin/superadmin
      if (c.assigned_role === "admin" || c.assigned_role === "superadmin") {
        return res.status(403).json({
          error: `Chat handled by ${c.assigned_role}`,
        });
      }

      // 🟢 assign if unassigned (race-safe)
      if (!c.assigned_to) {
        const result = await pool.query(
          `UPDATE conversations
           SET assigned_to = $1,
               assigned_role = $2
           WHERE id = $3 AND assigned_to IS NULL
           RETURNING id, assigned_to, assigned_role`,
          [ user.id, user.role, conversation_id ],
        );

        if (result.rowCount === 0) {
          return res.status(409).json({
            error: "Chat already taken",
          });
        }

        return res.json({
          success: true,
          conversation: result.rows[ 0 ],
        });
      }

      // 🔁 takeover support chat (ONLY DB CHECK — race safe)
      const result = await pool.query(
        `UPDATE conversations
         SET assigned_to = $1,
             assigned_role = $2
         WHERE id = $3
         AND last_agent_reply_at < NOW() - INTERVAL '20 minutes'
         RETURNING id, assigned_to, assigned_role`,
        [ user.id, user.role, conversation_id ],
      );

      if (result.rowCount === 0) {
        return res.status(403).json({
          error: "Another support agent is active",
        });
      }

      return res.json({
        success: true,
        conversation: result.rows[ 0 ],
      });
    }

    // =========================
    // 🧑‍💼 ADMIN RULES
    // =========================
    if (user.role === "admin") {
      if (user.department_id !== c.department_id) {
        return res.status(403).json({
          error: "Wrong department",
        });
      }

      // cannot override superadmin
      if (c.assigned_role === "superadmin") {
        return res.status(403).json({
          error: "Handled by superadmin",
        });
      }

      // only update if needed
      if (c.assigned_to !== user.id) {
        const result = await pool.query(
          `UPDATE conversations
           SET assigned_to = $1,
               assigned_role = $2
           WHERE id = $3
           RETURNING id, assigned_to, assigned_role`,
          [ user.id, user.role, conversation_id ],
        );

        return res.json({
          success: true,
          conversation: result.rows[ 0 ],
        });
      }

      return res.json({ success: true, conversation: c });
    }

    // =========================
    // 👑 SUPERADMIN RULES
    // =========================
    if (user.role === "superadmin") {
      if (c.assigned_to !== user.id) {
        const result = await pool.query(
          `UPDATE conversations
           SET assigned_to = $1,
               assigned_role = $2
           WHERE id = $3
           RETURNING id, assigned_to, assigned_role`,
          [ user.id, user.role, conversation_id ],
        );

        return res.json({
          success: true,
          conversation: result.rows[ 0 ],
        });
      }

      return res.json({ success: true, conversation: c });
    }

    return res.status(403).json({
      error: "Invalid role",
    });
  } catch (err) {
    console.error("Assign error:", err.message);

    return res.status(500).json({
      error: "Failed to assign conversation",
    });
  }
});

router.post("/assign/request", async (req, res) => {
  const user = req.session.user;
  const { conversation_id, to_user_id } = req.body;

  if (!user) return res.status(401).json({ error: "Unauthorized" });

  try {
    // 🔍 get conversation
    const convo = await pool.query(
      `SELECT * FROM conversations WHERE id = $1`,
      [ conversation_id ],
    );

    const c = convo.rows[ 0 ];
    if (!c) return res.status(404).json({ error: "Conversation not found" });

    // ❌ must be assigned to YOU
    if (String(c.assigned_to) !== String(user.id)) {
      return res.status(403).json({
        error: "You can only transfer your own chat",
      });
    }

    // ❌ must be active
    if (c.status !== "active") {
      return res.status(403).json({
        error: "Chat is no longer active",
      });
    }

    // 🔍 get target user
    const target = await pool.query(
      `SELECT id, role, department_id, country_id FROM users WHERE id = $1`,
      [ to_user_id ],
    );

    const t = target.rows[ 0 ];
    if (!t) return res.status(404).json({ error: "User not found" });

    // ❌ no requests to superadmin
    if (t.role === "superadmin") {
      return res.status(403).json({
        error: "Cannot send request to superadmin",
      });
    }

    // ✅ eligibility (same dept + country)
    // ✅ department must match
    if (t.department_id !== c.department_id) {
      return res.status(403).json({ error: "Wrong department" });
    }

    // ❌ support must match country
    if (t.role === "support" && t.country_id !== c.country_id) {
      return res.status(403).json({
        error: "Support must match country",
      });
    }
    // ❌ check existing pending request
    const existing = await pool.query(
      `SELECT id FROM assignment_requests
   WHERE conversation_id = $1
   AND status = 'pending'
   FOR UPDATE`,
      [ conversation_id ],
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        error: "Request already pending for this chat",
      });
    }

    // 📝 create request
    await pool.query(
      `INSERT INTO assignment_requests
   (conversation_id, from_user_id, to_user_id)
   VALUES ($1, $2, $3)`,
      [ conversation_id, user.id, to_user_id ],
    );

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Request failed" });
  }
});
// =========================
// 📥 GET ASSIGN REQUESTS
// =========================
router.get("/assign/requests", async (req, res) => {
  const user = req.session.user;

  if (!user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const result = await pool.query(
      `SELECT ar.*, u.name AS from_name,
      u.email AS from_email,
      u.role AS from_role
       FROM assignment_requests ar
       JOIN users u ON ar.from_user_id = u.id
       WHERE ar.to_user_id = $1
       ORDER BY ar.created_at DESC`,
      [ user.id ],
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch requests" });
  }
});
router.post("/assign/accept", async (req, res) => {
  const user = req.session.user;
  const { request_id } = req.body;

  if (!user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const reqRes = await pool.query(
      `SELECT * FROM assignment_requests WHERE id = $1`,
      [ request_id ],
    );

    const r = reqRes.rows[ 0 ];
    if (!r) return res.status(404).json({ error: "Request not found" });

    // ❌ must be receiver
    if (String(r.to_user_id) !== String(user.id)) {
      return res.status(403).json({ error: "Not your request" });
    }

    if (r.status !== "pending") {
      return res.status(400).json({ error: "Already handled" });
    }

    // 🔍 get conversation
    const convo = await pool.query(
      `SELECT * FROM conversations WHERE id = $1`,
      [ r.conversation_id ],
    );

    const c = convo.rows[ 0 ];

    // ❌ chat expired / ended
    if (!c || c.status !== "active") {
      await pool.query(
        `UPDATE assignment_requests
         SET status = 'rejected', responded_at = NOW()
         WHERE id = $1`,
        [ request_id ],
      );

      return res.status(400).json({
        error: "Chat no longer active (expired)",
      });
    }

    // 🔁 TRANSFER OWNERSHIP (THIS IS THE KEY)
    await pool.query(
      `UPDATE conversations
       SET assigned_to = $1,
           assigned_role = $2,
           assigned_at = NOW()
       WHERE id = $3`,
      [ user.id, user.role, c.id ],
    );

    // ✅ mark accepted
    await pool.query(
      `UPDATE assignment_requests
       SET status = 'accepted',
           responded_at = NOW()
       WHERE id = $1`,
      [ request_id ],
    );
    // ❌ cancel all other pending requests for same chat
    await pool.query(
      `UPDATE assignment_requests
   SET status = 'rejected',
       responded_at = NOW()
   WHERE conversation_id = $1
   AND status = 'pending'
   AND id != $2`,
      [ c.id, request_id ],
    );

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Accept failed" });
  }
});
router.post("/assign/reject", async (req, res) => {
  const user = req.session.user;
  const { request_id } = req.body;

  if (!user) return res.status(401).json({ error: "Unauthorized" });

  try {
    await pool.query(
      `UPDATE assignment_requests
       SET status = 'rejected',
           responded_at = NOW()
       WHERE id = $1 AND to_user_id = $2`,
      [ request_id, user.id ],
    );

    return res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Reject failed" });
  }
});
// =========================
// 👥 GET ELIGIBLE USERS
// =========================
router.get("/assign/eligible/:conversation_id", async (req, res) => {
  const user = req.session.user;
  const { conversation_id } = req.params;

  if (!user) return res.status(401).json({ error: "Unauthorized" });

  try {
    // 🔍 get conversation
    const convo = await pool.query(
      `SELECT department_id, country_id FROM conversations WHERE id = $1`,
      [ conversation_id ],
    );

    const c = convo.rows[ 0 ];
    if (!c) return res.status(404).json({ error: "Conversation not found" });

    // ✅ get valid users
    const users = await pool.query(
      `SELECT id, name, role
FROM users
WHERE department_id = $1
AND role != 'superadmin'
AND id != $3   -- 🔥 exclude self
AND (
  role = 'admin'
  OR country_id = $2
)`,
      [ c.department_id, c.country_id, user.id ],
    );

    return res.json(users.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});
/**
 * 🔚 END CHAT
 */
router.post("/end", async (req, res) => {
  const user = req.session.user;
  const { conversation_id } = req.body;

  // =========================
  // ✅ VALIDATION
  // =========================
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!conversation_id) {
    return res.status(400).json({
      error: "conversation_id required",
    });
  }

  try {
    // =========================
    // 📥 GET CONVERSATION
    // =========================
    const convo = await pool.query(
      `SELECT * FROM conversations WHERE id = $1`,
      [ conversation_id ],
    );

    const c = convo.rows[ 0 ];

    if (!c) {
      return res.status(404).json({ error: "Not found" });
    }

    if (c.status === "ended") {
      return res.status(400).json({
        error: "Chat already ended",
      });
    }

    // =========================
    // 👨‍💻 SUPPORT RULES
    // =========================
    if (user.role === "support") {
      if (
        c.assigned_to !== user.id ||
        user.department_id !== c.department_id ||
        user.country_id !== c.country_id
      ) {
        return res.status(403).json({
          error: "Not allowed to end this chat",
        });
      }
    }

    // =========================
    // 🧑‍💼 ADMIN RULES
    // =========================
    if (user.role === "admin") {
      if (user.department_id !== c.department_id) {
        return res.status(403).json({
          error: "Wrong department",
        });
      }

      // 🚫 cannot override superadmin
      if (c.assigned_role === "superadmin") {
        return res.status(403).json({
          error: "Handled by superadmin",
        });
      }

      // 🔒 optional: only allow ending if assigned to self
      if (c.assigned_to && c.assigned_to !== user.id) {
        return res.status(403).json({
          error: "Not your assigned chat",
        });
      }
    }

    // 👑 SUPERADMIN → allowed

    // =========================
    // 🔚 END CHAT (RACE SAFE)
    // =========================
    const result = await pool.query(
      `UPDATE conversations
       SET status = 'ended',
           ended_at = NOW(),
           last_agent_id = $2,   -- 🔥 who ended it
           assigned_to = NULL,
           assigned_role = NULL,
           last_agent_reply_at = NULL -- 🔥 reset timer
       WHERE id = $1
       AND status = 'active'
       RETURNING id`,
      [ conversation_id, user.id ],
    );

    if (result.rowCount === 0) {
      return res.status(409).json({
        error: "Chat already ended",
      });
      // 📤 Notify user
      await sendMessage(
        c.sender_id,
        "🛑 This chat has been ended by the agent.",
        null,
      );
    }

    // 🔁 RESET AI STATE HERE (ONLY HERE)
    import("../services/ai.js").then((mod) => {
      if (mod.resetUserState) {
        mod.resetUserState(c.sender_id);
      }

      // ✅ ALSO reset greeting
      if (mod.greetedUsers) {
        mod.greetedUsers[ c.sender_id ] = false;
      }
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("End chat error:", err.message);

    return res.status(500).json({
      error: "Failed to end chat",
    });
  }
});

export default router;
