// Backend/routes/loginroutes/superadmin.js
import express from "express";
import { pool } from "../../db.js";
import bcrypt from "bcrypt";
import { requireAdmin, requireSuperadmin } from "../../middleware/auth.js";

const router = express.Router();

const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const isStrongPassword = (password) => {
  // min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/.test(password);
};

router.post("/create-admin", requireSuperadmin, async (req, res) => {
  const { name, email, password, country_id, department_id } = req.body;

  try {
    if (!name || !email || !password || !department_id || !country_id) {
      return res.status(400).json({ error: "All fields required" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        error:
          "Password must be 8+ chars with uppercase, lowercase, number & special character",
      });
    }

    // ❗ Only ONE admin per department
    const adminExists = await pool.query(
      `SELECT id FROM users WHERE role = 'admin' AND department_id = $1`,
      [department_id],
    );

    if (adminExists.rows.length > 0) {
      return res.status(400).json({
        error: "This department already has an admin",
      });
    }

    // ❗ Email uniqueness check
    const exists = await pool.query(`SELECT id FROM users WHERE email = $1`, [
      email,
    ]);

    if (exists.rows.length > 0) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      INSERT INTO users (name, email, password, role, country_id, department_id)
      VALUES ($1, $2, $3, 'admin', $4, $5)
      RETURNING id, name, role
      `,
      [name, email, hashedPassword, country_id, department_id],
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create admin" });
  }
});

// ➕ Create support (UPDATED)

router.post("/create-support", requireAdmin, async (req, res) => {
  const creator = req.session.user;
  const { name, email, password, country_id, department_id } = req.body;

  try {
    let finalDept = department_id;

    if (creator.role === "admin") {
      finalDept = creator.department_id;
    }

    if (!name || !email || !password || !country_id || !finalDept) {
      return res.status(400).json({ error: "All fields required" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        error:
          "Password must be 8+ chars with uppercase, lowercase, number & special character",
      });
    }

    // ❗ Email uniqueness
    const exists = await pool.query(`SELECT id FROM users WHERE email = $1`, [
      email,
    ]);

    if (exists.rows.length > 0) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      INSERT INTO users (name, email, password, role, country_id, department_id)
      VALUES ($1, $2, $3, 'support', $4, $5)
      RETURNING id, name, role
      `,
      [name, email, hashedPassword, country_id, finalDept],
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create support user" });
  }
});

export default router;
