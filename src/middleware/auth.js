const AuthService = require("../services/authService");
const { sendError } = require("../utils/response");

const verifyAuth = async (req, res, next) => {
  try {
    const accessToken = req.cookies.access_token;

    if (!accessToken) {
      return sendError(res, 401, "Not authenticated");
    }

    const user = await AuthService.getUserByToken(accessToken);
    req.user = user;
    next();
  } catch (error) {
    return sendError(res, 401, "Authentication failed", error.message);
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const accessToken = req.cookies.access_token;

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
