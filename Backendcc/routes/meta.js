import express from "express";
import { pool } from "../db.js";

const router = express.Router();

/**
 * 🌍 GET COUNTRIES
 */
router.get("/countries", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name FROM countries ORDER BY name`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch countries" });
  }
});

/**
 * 🏢 GET DEPARTMENTS
 */
router.get("/departments", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name FROM departments ORDER BY name`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch departments" });
  }
});

export default router;