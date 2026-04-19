import express from "express";
import cors from "cors";
import webhookRoutes from "./routes/webhook.js";
import agentRoutes from "./routes/agent.js";
import dotenv from "dotenv";
import authRoutes from "./routes/loginroutes/auth.js";
import superadminRoutes from "./routes/loginroutes/superadmin.js";
import session from "express-session";
import { loadCountries } from "./services/country.js";
import metaroutes from "./routes/meta.js";
import { pool } from "./db.js";
import pgSession from "connect-pg-simple";
import composeRoutes from "./routes/compose/compose.js";
import analyticsRoutes from "./routes/analytics/analytics.js";
import ProfileRoutes from "./routes/analytics/profile.js";
import { runChatExpiry } from "./services/chatExpiry.js";
const PgSession = pgSession(session);
dotenv.config();

const app = express();
app.set("trust proxy", 1); // 🔥 ADD THIS LINE HERE
const PORT = process.env.PORT || 3000;

app.use(express.json());

// cors
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  }),
);
app.use(
  session({
    name: "supportbot.sid", // 🔥 custom cookie name
    store: new PgSession({
      pool,
      tableName: "user_sessions",
      pruneSessionInterval: 60 * 15, // 🔥 cleanup
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: true, // ✅ MUST be true on HTTPS (Render)
      sameSite: "none", // ✅ MUST be none for cross-origin
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Support Bot Backend is running 🚀",
  });
});

app.use("/webhook", webhookRoutes);
app.use("/agent", agentRoutes);
app.use("/auth", authRoutes);
app.use("/superadmin", superadminRoutes);
app.use("/meta", metaroutes);
app.use("/compose", composeRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/profile", ProfileRoutes);
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
  });
});

app.use((err, req, res, next) => {
  console.error("Server error:", err.stack);

  res.status(500).json({
    error: "Internal server error",
  });
});

async function startServer() {
  try {
    console.log("🚀 Starting server...");

    await loadCountries();
    console.log("🌍 Countries loaded");

    // 🔥 RUN EVERY 1 MINUTE
    setInterval(() => {
      runChatExpiry();
    }, 60 * 1000);
    app.listen(PORT, () => {
      console.log(
        `Backend running on http://localhost:${PORT} (Press CTRL+C to stop)`,
      );
    });
  } catch (err) {
    console.error("❌ Startup error:", err);
  }
}

startServer();
