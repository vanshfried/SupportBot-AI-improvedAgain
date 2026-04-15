// Backend/middleware/Auth.js
export const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
};

export const requireSuperadmin = (req, res, next) => {
  console.log("🔥 middleware hit", req.session.user);

  if (!req.session.user || req.session.user.role !== "superadmin") {
    return res.status(403).json({ error: "Superadmin only" });
  }

  next();
};

export const requireAdmin = (req, res, next) => {
  if (
    !req.session.user ||
    !["admin", "superadmin"].includes(req.session.user.role)
  ) {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
};