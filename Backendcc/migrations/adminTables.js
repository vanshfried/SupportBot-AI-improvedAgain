// backend/setup/adminTables.js
import { pool } from "../db.js";

export async function createAdminTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL, -- 'superadmin' | 'admin' | 'support'
        department TEXT, -- NULL for superadmin
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("✅ Users table ready");
  } catch (err) {
    console.error("❌ Table creation error:", err.message);
  }
}