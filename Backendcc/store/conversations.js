// Backend/store/conversations.js

import { pool } from "../db.js";
import { randomUUID } from "crypto";

/* ==============================
   In-memory stores
============================== */

/* ==============================
   Departments
============================== */

export const departments = [
  "admin",
  "business development",
  "ceo office",
  "contact centre",
  "deployment department",
  "finance & accounts",
  "government relations department",
  "hr",
  "information technology",
  "learning & development",
  "marketing & training",
  "pm team",
  "project management",
  "pscm",
  "qhse",
  "relationship department",
  "research & characterization",
  "seo",
  "technical office",
  "technology",
];

/* ==============================
   Conversation Creation
============================== */

export async function createConversation(phone) {
  const id = randomUUID();

  try {
    await pool.query(
      `INSERT INTO conversations (id, sender_id, message)
       VALUES ($1, $2, $3)`,
      [id, phone, "New conversation"],
    );

    console.log("🆕 New conversation:", id);

    return id;
  } catch (err) {
    console.error("❌ Conversation create error:", err.message);
    throw err;
  }
}

/* ==============================
   Get or Create Conversation
============================== */
export async function getOrCreateConversation(phone) {
  try {
    // ✅ Get existing ACTIVE conversation (no department condition!)
    const existing = await pool.query(
      `SELECT id FROM conversations
       WHERE sender_id = $1
       AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [phone],
    );

    if (existing.rows.length > 0) {
      return existing.rows[0].id;
    }

    // 🆕 Create NEW conversation (only if none active)
    const id = randomUUID();

    await pool.query(
      `INSERT INTO conversations (id, sender_id, status, started_at)
       VALUES ($1, $2, 'active', NOW())`,
      [id, phone],
    );

    console.log("🆕 New conversation created:", id);

    return id;
  } catch (err) {
    console.error("❌ getOrCreateConversation error:", err.message);
    throw err;
  }
}

/* ==============================
   Add Message
============================== */

export async function addMessage(
  phone,
  direction,
  text,
  whatsappMessageId = null,
  status = null,
  media = null,
  senderType = null, // 🔥 NEW
  senderId = null, // 🔥 NEW
) {
  try {
    const conversationId = await getOrCreateConversation(phone);

    // 🧠 AUTO DETECT (BACKWARD COMPATIBLE)
    if (!senderType) {
      if (direction === "incoming") senderType = "user";
      else senderType = "agent"; // default fallback
    }

    await pool.query(
      `INSERT INTO messages 
(conversation_id, direction, text, whatsapp_message_id, status, media_id, media_type, sender_type, sender_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        conversationId,
        direction,
        text,
        whatsappMessageId,
        status,
        media?.mediaId || null,
        media?.mediaType || null,
        senderType,
        senderId,
      ],
    );

    console.log("✅ Saved:", phone, direction, senderType, "→", conversationId);
  } catch (err) {
    console.error("❌ DB insert error:", err.message);
  }
}

/* ==============================
   Get Messages (memory)
============================== */
export async function getMessagesByConversationId(conversationId) {
  try {
    const result = await pool.query(
      `
  SELECT direction, text, status, created_at, media_id, media_type
  FROM messages
  WHERE conversation_id = $1
  ORDER BY created_at ASC
  `,
      [conversationId],
    );

    return result.rows;
  } catch (err) {
    console.error(err);
    return [];
  }
}

/* ==============================
   Human Session
============================== */

export function startHumanSession(phone, department_id) {
  if (department_id) {
    assignDepartment(phone, department_id);
  }
}

/* ==============================
   Assign Department
============================== */
export async function assignDepartment(phone, department_id) {
  try {
    // 🔍 Get current active conversation
    const res = await pool.query(
      `SELECT id FROM conversations
       WHERE sender_id = $1
       AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [phone],
    );

    const conversationId = res.rows[0]?.id;

    if (!conversationId) return;

    // ✅ JUST UPDATE SAME CONVERSATION
    await pool.query(
      `UPDATE conversations
       SET department_id = $1,
           started_at = NOW()
       WHERE id = $2`,
      [department_id, conversationId],
    );

    console.log("✅ Conversation assigned to department:", conversationId);

    return conversationId;
  } catch (err) {
    console.error("❌ assignDepartment error:", err.message);
  }
}
/* ==============================
   Validate Department
============================== */

export function isValidDepartment(input) {
  if (!input) return false;
  return departments.includes(input.toLowerCase());
}

/* ==============================
   Get All Conversations (memory)
============================== */

export async function getMessages(phone) {
  try {
    const res = await pool.query(
      `SELECT id FROM conversations
   WHERE sender_id = $1
   ORDER BY created_at DESC
   LIMIT 1`,
      [phone],
    );

    if (res.rows.length === 0) return [];

    const conversationId = res.rows[0].id;

    return await getMessagesByConversationId(conversationId);
  } catch (err) {
    console.error(err);
    return [];
  }
}
