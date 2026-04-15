// Backend/routes/loginroutes/superadmin.js
import express from "express";
import { pool } from "../../db.js";
import bcrypt from "bcrypt";
import { requireAdmin, requireSuperadmin } from "../../middleware/auth.js";

const router = express.Router();

/**
 * 🔥 ONE TIME: Create superadmin
 */
router.post("/create", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    if (process.env.ALLOW_SUPERADMIN !== "true") {
      return res.status(403).json({
        error: "Superadmin creation disabled",
      });
    }

    const existing = await pool.query(
      `SELECT id FROM users WHERE role = 'superadmin'`,
    );

    if (existing.rows.length > 0) {
      return res.status(403).json({
        error: "Superadmin already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      INSERT INTO users (name, email, password, role)
      VALUES ($1, $2, $3, 'superadmin')
      RETURNING id, email, role
      `,
      [name, email, hashedPassword],
    );

    res.json({
      success: true,
      user: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create superadmin" });
  }
});

/**
 * ➕ Create admin (UPDATED)
 */

router.post("/create-admin", requireSuperadmin, async (req, res) => {
  const { name, email, password, country_id, department_id } = req.body;

  try {
    if (!department_id) {
      return res.status(400).json({ error: "Department required" });
    }

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

    // 🧑‍💼 Admin → force their department
    if (creator.role === "admin") {
      finalDept = creator.department_id;
    }

    if (!finalDept) {
      return res.status(400).json({ error: "Department required" });
    }

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