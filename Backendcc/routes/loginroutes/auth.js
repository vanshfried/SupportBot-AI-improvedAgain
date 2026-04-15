// Backend/routes/loginroutes/auth.js
import express from "express";
import { pool } from "../../db.js";
import bcrypt from "bcrypt";

const router = express.Router();

/**
 * 🔐 LOGIN
 */
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // 🔒 Basic validation
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // 🔍 Fetch user with department
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.password, u.role, 
              u.department_id, u.country_id,
              d.name AS department_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.email = $1`,
      [email],
    );

    const user = result.rows[0];

    // 🔒 Avoid user enumeration
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // 🔐 Compare password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // 🧠 Build session payload (minimal & safe)
    const sessionUser = {
      id: user.id,
      name: user.name,
      role: user.role,
      department_id: user.department_id,
      department: user.department_name,
      country_id: user.country_id,
    };

    // 🔥 Assign session
    req.session.user = sessionUser;

    // 🔥 Explicitly save session (important for reliability)
    req.session.save((err) => {
      if (err) {
        console.error("❌ Session save error:", err);
        return res.status(500).json({ error: "Session creation failed" });
      }

      // ✅ Success response
      return res.status(200).json({
        success: true,
        user: sessionUser,
      });
    });
  } catch (err) {
    console.error("❌ Login error:", err);

    return res.status(500).json({
      error: "Internal server error",
    });
  }
});
/**
 * 👤 GET CURRENT USER
 */
router.get("/me", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.role, u.department_id, u.country_id,
              d.name AS department_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = $1`,
      [req.session.user.id],
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // 🔥 keep session fresh
    req.session.user.department = user.department_name;

    res.json({
      ...req.session.user,
      department: user.department_name,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

/**
 * 🚪 LOGOUT
 */
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

export default router;
