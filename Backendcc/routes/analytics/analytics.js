import express from "express";
import { pool } from "../../db.js";

const router = express.Router();

router.get("/agent-performance", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id,
        u.name,
        u.role,

        COALESCE(d.name, 'No Department') AS department,
        COALESCE(ctry.name, 'No Country') AS country,

        -- 📩 messages
        COALESCE(msg.message_count, 0) AS message_count,
        COALESCE(recv.received_count, 0) AS messages_received,

        -- ✅ conversations closed
        COALESCE(conv.closed_count, 0) AS conversations_closed,

        -- ⏱️ avg response time (per agent reply)
        COALESCE(ROUND(resp.avg_response_time), 0) AS avg_response_time,

        -- ⚡ first response time (AFTER HANDOFF)
        COALESCE(ROUND(frt.first_response_time), 0) AS first_response_time

      FROM users u

      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN countries ctry ON u.country_id = ctry.id

      -- 📩 messages per agent
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
      c.id AS conversation_id,
      first_agent.agent_id,
      m.id

    FROM conversations c

    -- 🔥 FIRST HUMAN AGENT MESSAGE (handoff moment)
    JOIN LATERAL (
      SELECT sender_id AS agent_id, created_at
      FROM messages
      WHERE conversation_id = c.id
        AND sender_type = 'agent'
        AND sender_id IS NOT NULL
      ORDER BY created_at ASC   -- ✅ FIRST (not last)
      LIMIT 1
    ) first_agent ON TRUE

    -- 🔥 count USER messages AFTER THAT
    JOIN messages m
      ON m.conversation_id = c.id
      AND m.direction = 'incoming'
      AND m.created_at > first_agent.created_at

  ) t
  GROUP BY agent_id
) recv ON recv.agent_id = u.id

      -- ✅ closed conversations
      LEFT JOIN (
        SELECT last_agent_id, COUNT(*) AS closed_count
        FROM conversations
        WHERE status = 'ended'
        GROUP BY last_agent_id
      ) conv ON conv.last_agent_id = u.id

      -- ⏱️ AVG RESPONSE TIME (ONLY when user spoke last)
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

    -- 🔥 ensure this is the FIRST agent reply after user
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


      -- ⚡ FIRST RESPONSE TIME (AFTER AI HANDOFF)
      LEFT JOIN (
        SELECT 
          agent_id,
          AVG(first_response_time) AS first_response_time
        FROM (
          SELECT DISTINCT ON (c.id)
            c.id AS conversation_id,
            m2.sender_id AS agent_id,

            EXTRACT(EPOCH FROM (m2.created_at - m1.created_at)) AS first_response_time

          FROM conversations c

          -- 🔥 LAST AI MESSAGE (handoff point)
          JOIN LATERAL (
            SELECT created_at
            FROM messages
            WHERE conversation_id = c.id
              AND sender_id IS NULL
              AND direction = 'outgoing'
            ORDER BY created_at DESC
            LIMIT 1
          ) m1 ON TRUE

          -- 🔥 FIRST HUMAN REPLY AFTER HANDOFF
          JOIN messages m2
            ON m2.conversation_id = c.id
            AND m2.direction = 'outgoing'
            AND m2.sender_id IS NOT NULL
            AND m2.created_at > m1.created_at

          ORDER BY c.id, m2.created_at ASC
        ) t
        GROUP BY agent_id
      ) frt ON frt.agent_id = u.id

      ORDER BY d.name, u.role DESC;
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

export default router;
