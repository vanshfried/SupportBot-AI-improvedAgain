import { pool } from "../db.js";

export async function runChatExpiry() {
  try {
    console.log("⏱️ Checking chat expiry...");

    // ===============================
    // 1️⃣ NOT ASSIGNED → 15 MIN
    // ===============================
    await pool.query(`
      UPDATE conversations
      SET status = 'ended',
          ended_at = NOW(),
          assigned_to = NULL,
          assigned_role = NULL
      WHERE status = 'active'
      AND assigned_to IS NULL
      AND started_at < NOW() - INTERVAL '1 minutes'
    `);

    // ===============================
    // 2️⃣ ASSIGNED → 30 MIN
    // ===============================
    await pool.query(`
      UPDATE conversations
      SET status = 'ended',
          ended_at = NOW(),
          assigned_to = NULL,
          assigned_role = NULL
      WHERE status = 'active'
      AND assigned_to IS NOT NULL
      AND assigned_at < NOW() - INTERVAL '1 minutes'
    `);

  } catch (err) {
    console.error("❌ Expiry job failed:", err.message);
  }
}