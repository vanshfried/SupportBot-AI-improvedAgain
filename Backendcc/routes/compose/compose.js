import express from "express";
import multer from "multer";
import fs from "fs";

import { sendMessage, uploadMedia } from "../../services/whatsapp.js";
import { addMessage } from "../../store/conversations.js";
import { requireAdmin } from "../../middleware/auth.js";

const router = express.Router();

/**
 * 🔥 MULTER CONFIG (safe + production ready)
 */
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    const safeName = Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
  },
});

/**
 * 🔥 HELPER: safe delete
 */
const safeUnlink = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error("⚠️ File delete failed:", err.message);
  }
};

/**
 * 🔥 HELPER: normalize numbers
 */
const normalizeNumbers = (input) => {
  if (!input) return [];

  let numbers = [];

  if (Array.isArray(input)) {
    numbers = input;
  } else {
    try {
      const parsed = JSON.parse(input);
      numbers = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      numbers = input.split(/[\n, ]+/);
    }
  }

  return numbers
    .map((n) => String(n).replace(/\D/g, ""))
    .filter((n) => n.length >= 10);
};

/**
 * 🔥 SEND (multi-file supported)
 */
router.post(
  "/send",
  requireAdmin,
  upload.array("files", 5), // ✅ IMPORTANT CHANGE
  async (req, res) => {
    let { to, message } = req.body;

    console.log("📥 Incoming request:", {
      to,
      message,
      files: req.files?.map((f) => f.originalname),
    });

    // ✅ normalize numbers
    const numbers = normalizeNumbers(to);

    if (!numbers.length) {
      return res.status(400).json({ error: "No valid numbers provided" });
    }

    if (!message && (!req.files || req.files.length === 0)) {
      return res.status(400).json({ error: "Message or file is required" });
    }

    /**
     * 🔥 UPLOAD MULTIPLE MEDIA
     */
    let mediaList = [];

    if (req.files && req.files.length > 0) {
      try {
        for (const file of req.files) {
          const uploadRes = await uploadMedia(file.path);

          mediaList.push({
            id: uploadRes.id,
            mimeType: uploadRes.mimeType,
            filename: uploadRes.filename,
          });

          safeUnlink(file.path); // cleanup immediately
        }
      } catch (err) {
        req.files.forEach((f) => safeUnlink(f.path));
        return res.status(500).json({ error: err.message });
      }
    }

    /**
     * 🔥 SEND LOOP
     */
    const results = [];

    for (const number of numbers) {
      try {
        console.log(`📨 Sending to ${number}...`);

        // ✅ TEXT ONLY
        if (mediaList.length === 0) {
          const messageId = await sendMessage(number, message, null);

          if (!messageId) throw new Error("Send failed");

          await addMessage(number, "outgoing", message, messageId, "sent");
        } else {
          // ✅ MULTIPLE MEDIA (WhatsApp compliant)
          for (let i = 0; i < mediaList.length; i++) {
            const media = mediaList[i];

            const messageId = await sendMessage(
              number,
              i === 0 ? message : null, // caption only once
              media,
            );

            if (!messageId) throw new Error("Send failed");

            // 🔥 rate safety (IMPORTANT)
            await new Promise((r) => setTimeout(r, 150));
          }

          await addMessage(
            number,
            "outgoing",
            message || "[media]",
            "multi",
            "sent",
          );
        }

        results.push({ number, status: "sent" });
      } catch (err) {
        console.error(`❌ Failed for ${number}:`, err.message);

        results.push({
          number,
          status: "failed",
          error: err.message,
        });
      }

      // 🔥 per-user delay (prevents rate limit)
      await new Promise((r) => setTimeout(r, 120));
    }

    /**
     * 🔥 RESPONSE
     */
    return res.json({
      success: true,
      total: numbers.length,
      sent: results.filter((r) => r.status === "sent").length,
      failed: results.filter((r) => r.status === "failed").length,
      results,
    });
  },
);

export default router;
