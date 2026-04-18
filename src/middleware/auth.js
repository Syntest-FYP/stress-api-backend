const AuthService = require("../services/authService");
const { sendError } = require("../utils/response");

const verifyAuth = async (req, res, next) => {
  try {
    // ✅ Check both cookie and Authorization header
    let accessToken = req.cookies.access_token;

    // If no cookie, check Authorization header
    if (!accessToken) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        accessToken = authHeader.substring(7); // Remove "Bearer " prefix
      }
    }

    // console.log("=== Auth Middleware ===");
    // console.log("Cookie token:", !!req.cookies.access_token);
    // console.log("Header token:", !!req.headers.authorization);
    // console.log("Using token from:", accessToken === req.cookies.access_token ? "cookie" : "header");
    // console.log("=======================");

    if (!accessToken) {
      return sendError(res, 401, "Not authenticated");
    }

    const user = await AuthService.getUserByToken(accessToken);
    req.user = user;
    console.log("[AuthMiddleware] User from token:", req.user);
    next();
  } catch (error) {
    console.error("Auth middleware error:", error.message);
    return sendError(res, 401, "Authentication failed", error.message);
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    // ✅ Check both cookie and Authorization header
    let accessToken = req.cookies.access_token;

    // If no cookie, check Authorization header
    if (!accessToken) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        accessToken = authHeader.substring(7);
      }
    }

    if (accessToken) {
      const user = await AuthService.getUserByToken(accessToken);
      req.user = user;
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

module.exports = {
  verifyAuth,
  optionalAuth,
};
