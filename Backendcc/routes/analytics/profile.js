import express from "express";
import { pool } from "../../db.js";
import bcrypt from "bcrypt"; // ✅ FIX
const router = express.Router();

/**
 * 👤 PROFILE (USER + COMPANY COMPARISON)
 */
router.get("/", async (req, res) => {
  const user = req.session.user;

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // =========================
    // 👤 USER STATS (EXACT SAME LOGIC)
    // =========================
    const userResult = await pool.query(
      `
      SELECT 
        u.id,
        u.name,

        COALESCE(msg.message_count, 0) AS message_count,
        COALESCE(recv.received_count, 0) AS messages_received,  -- ✅ ADD THIS
        COALESCE(conv.closed_count, 0) AS conversations_closed,
        COALESCE(ROUND(resp.avg_response_time), 0) AS avg_response_time,
        COALESCE(ROUND(frt.first_response_time), 0) AS first_response_time

      FROM users u

      -- 📩 messages
      LEFT JOIN (
        SELECT sender_id, COUNT(*) AS message_count
        FROM messages
        WHERE sender_type = 'agent'
        GROUP BY sender_id
      ) msg ON msg.sender_id = u.id

      -- 📥 messages received AFTER FIRST HUMAN agent reply
LEFT JOIN (
  SELECT 
    agent_id,
    COUNT(*) AS received_count
  FROM (
    SELECT 
      c.id,
      first_agent.agent_id,
      m.id

    FROM conversations c

    JOIN LATERAL (
      SELECT sender_id AS agent_id, created_at
      FROM messages
      WHERE conversation_id = c.id
        AND sender_type = 'agent'
        AND sender_id IS NOT NULL
      ORDER BY created_at ASC
      LIMIT 1
    ) first_agent ON TRUE

    JOIN messages m
      ON m.conversation_id = c.id
      AND m.direction = 'incoming'
      AND m.created_at > first_agent.created_at

  ) t
  GROUP BY agent_id
) recv ON recv.agent_id = u.id

      -- ✅ closed
      LEFT JOIN (
        SELECT last_agent_id, COUNT(*) AS closed_count
        FROM conversations
        WHERE status = 'ended'
        GROUP BY last_agent_id
      ) conv ON conv.last_agent_id = u.id

      -- ⏱️ AVG RESPONSE (CORRECT LOGIC)
      LEFT JOIN (
        SELECT 
          agent_id,
          AVG(response_time) AS avg_response_time
        FROM (
          SELECT 
            m1.conversation_id,
            m2.sender_id AS agent_id,
            EXTRACT(EPOCH FROM (m2.created_at - m1.created_at)) AS response_time

          FROM messages m1

          JOIN messages m2 
            ON m1.conversation_id = m2.conversation_id
            AND m2.direction = 'outgoing'
            AND m2.sender_id IS NOT NULL
            AND m2.created_at > m1.created_at

          WHERE m1.direction = 'incoming'

          -- 🔥 ONLY FIRST REPLY
          AND NOT EXISTS (
            SELECT 1 FROM messages m3
            WHERE m3.conversation_id = m1.conversation_id
            AND m3.direction = 'outgoing'
            AND m3.sender_id IS NOT NULL
            AND m3.created_at > m1.created_at
            AND m3.created_at < m2.created_at
          )
        ) t
        GROUP BY agent_id
      ) resp ON resp.agent_id = u.id

      -- ⚡ FIRST RESPONSE AFTER AI
      LEFT JOIN (
        SELECT 
          agent_id,
          AVG(first_response_time) AS first_response_time
        FROM (
          SELECT DISTINCT ON (c.id)
            c.id,
            m2.sender_id AS agent_id,
            EXTRACT(EPOCH FROM (m2.created_at - m1.created_at)) AS first_response_time

          FROM conversations c

          JOIN LATERAL (
            SELECT created_at
            FROM messages
            WHERE conversation_id = c.id
              AND sender_id IS NULL
              AND direction = 'outgoing'
            ORDER BY created_at DESC
            LIMIT 1
          ) m1 ON TRUE

          JOIN messages m2
            ON m2.conversation_id = c.id
            AND m2.direction = 'outgoing'
            AND m2.sender_id IS NOT NULL
            AND m2.created_at > m1.created_at

          ORDER BY c.id, m2.created_at ASC
        ) t
        GROUP BY agent_id
      ) frt ON frt.agent_id = u.id

      WHERE u.id = $1
      `,
      [user.id],
    );

    // =========================
    // 🏢 COMPANY AVG (🔥 FIXED)
    // =========================
    const companyResult = await pool.query(`
  SELECT 
    ROUND(AVG(message_count)) AS avg_messages,
    ROUND(AVG(conversations_closed)) AS avg_closed,

    -- ✅ FIXED (FILTER inside AVG)
    ROUND(AVG(avg_response_time) FILTER (WHERE avg_response_time > 0)) AS avg_response_time,

    ROUND(AVG(first_response_time) FILTER (WHERE first_response_time > 0)) AS avg_first_response

  FROM (
    SELECT 
      u.id,

      COALESCE(msg.message_count, 0) AS message_count,
      COALESCE(conv.closed_count, 0) AS conversations_closed,
      resp.avg_response_time,
      frt.first_response_time

    FROM users u

    -- ❗ include ALL users (including superadmin)

    LEFT JOIN (
      SELECT sender_id, COUNT(*) AS message_count
      FROM messages
      WHERE sender_type = 'agent'
      GROUP BY sender_id
    ) msg ON msg.sender_id = u.id

    LEFT JOIN (
      SELECT last_agent_id, COUNT(*) AS closed_count
      FROM conversations
      WHERE status = 'ended'
      GROUP BY last_agent_id
    ) conv ON conv.last_agent_id = u.id

    LEFT JOIN (
      SELECT 
        agent_id,
        AVG(response_time) AS avg_response_time
      FROM (
        SELECT 
          m1.conversation_id,
          m2.sender_id AS agent_id,
          EXTRACT(EPOCH FROM (m2.created_at - m1.created_at)) AS response_time
        FROM messages m1
        JOIN messages m2 
          ON m1.conversation_id = m2.conversation_id
          AND m2.direction = 'outgoing'
          AND m2.sender_id IS NOT NULL
          AND m2.created_at > m1.created_at
        WHERE m1.direction = 'incoming'
        AND NOT EXISTS (
          SELECT 1 FROM messages m3
          WHERE m3.conversation_id = m1.conversation_id
          AND m3.direction = 'outgoing'
          AND m3.sender_id IS NOT NULL
          AND m3.created_at > m1.created_at
          AND m3.created_at < m2.created_at
        )
      ) t
      GROUP BY agent_id
    ) resp ON resp.agent_id = u.id

    LEFT JOIN (
      SELECT 
        agent_id,
        AVG(first_response_time) AS first_response_time
      FROM (
        SELECT DISTINCT ON (c.id)
          c.id,
          m2.sender_id AS agent_id,
          EXTRACT(EPOCH FROM (m2.created_at - m1.created_at)) AS first_response_time
        FROM conversations c
        JOIN LATERAL (
          SELECT created_at
          FROM messages
          WHERE conversation_id = c.id
            AND sender_id IS NULL
            AND direction = 'outgoing'
          ORDER BY created_at DESC
          LIMIT 1
        ) m1 ON TRUE
        JOIN messages m2
          ON m2.conversation_id = c.id
          AND m2.direction = 'outgoing'
          AND m2.sender_id IS NOT NULL
          AND m2.created_at > m1.created_at
        ORDER BY c.id, m2.created_at ASC
      ) t
      GROUP BY agent_id
    ) frt ON frt.agent_id = u.id

  ) t
`);

    res.json({
      user: userResult.rows[0],
      company: companyResult.rows[0],
    });
  } catch (err) {
    console.error("Profile error:", err);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

/**
 * 🔑 CHANGE PASSWORD
 */
router.post("/change-password", async (req, res) => {
  const user = req.session.user;
  const { oldPassword, newPassword } = req.body;

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: "All fields required" });
  }

  try {
    const result = await pool.query(
      `SELECT password FROM users WHERE id = $1`,
      [user.id],
    );

    const isMatch = await bcrypt.compare(oldPassword, result.rows[0].password);

    if (!isMatch) {
      return res.status(400).json({ error: "Wrong old password" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [
      hashed,
      user.id,
    ]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to change password" });
  }
});

export default router;
