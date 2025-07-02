const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin")
    return res.status(403).json({ error: "Admin only" });
  next();
}

router.post("/auth/register", userController.register);
router.post("/auth/login", userController.login);
router.post(
  "/:id/activate",
  authenticateToken,
  requireAdmin,
  userController.activate
);
router.post(
  "/:id/deactivate",
  authenticateToken,
  requireAdmin,
  userController.deactivate
);
router.post(
  "/:id/role",
  authenticateToken,
  requireAdmin,
  userController.setRole
);
router.post(
  "/:id/regenerate-api-key",
  authenticateToken,
  userController.regenerateApiKey
);
router.get("/", authenticateToken, requireAdmin, userController.list);

module.exports = router;
