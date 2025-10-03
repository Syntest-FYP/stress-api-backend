const AuthService = require("../services/authService");
const { sendResponse, sendError } = require("../utils/response");
const { NODE_ENV } = require("../config/environment");

const COOKIE_DOMAIN =
  process.env.NODE_ENV === "development" ? undefined : ".cyber1337x.dev";

class AuthController {
  static async login(req, res) {
    try {
      const { email, password } = req.body;

      await AuthService.loginWithPassword(email, password);
      await AuthService.sendEmailOTP(email);

      res.cookie("verification_email", email, {
        httpOnly: true,
        secure: NODE_ENV === "production",
        sameSite: NODE_ENV === "production" ? "none" : "lax",
        maxAge: 10 * 60 * 1000,
        domain: COOKIE_DOMAIN,
      });

      return sendResponse(res, 200, "OTP sent to email");
    } catch (error) {
      return sendError(res, 401, error.message);
    }
  }

  static async register(req, res) {
    try {
      const { email, password, via } = req.body;

      if (!email || !password) {
        return sendError(res, 400, "Email and password are required");
      }

      // If client requests OTP-based registration
      if (via === "otp") {
        await AuthService.registerWithEmailOTP(email);

        // set verification_email cookie like login flow so verify-otp works
        res.cookie("verification_email", email, {
          httpOnly: true,
          secure: NODE_ENV === "production",
          sameSite: NODE_ENV === "production" ? "none" : "lax",
          maxAge: 10 * 60 * 1000,
          domain: COOKIE_DOMAIN,
        });

        // Store the intended password in session until OTP verification
        if (!req.session) {
          return sendError(res, 500, "Session not configured properly");
        }
        req.session.pendingPasswordForOTP = password;

        return sendResponse(
          res,
          200,
          "Signup OTP sent to email. Verify to complete registration.",
          { requiresOTP: true }
        );
      }

      const data = await AuthService.register(email, password);

      return sendResponse(
        res,
        201,
        "Registration successful. Please verify your email.",
        {
          user: data.user,
        }
      );
    } catch (error) {
      return sendError(res, 400, error.message);
    }
  }

  static async verifyEmailOTP(req, res) {
    try {
      const { otp, email: emailFromBody } = req.body;
      console.log("[verifyEmailOTP] cookies:", req.cookies);
      let email = req.cookies.verification_email;
      if (!email && emailFromBody) {
        email = emailFromBody;
      }

      if (!email) {
        return sendError(
          res,
          400,
          "Verification session expired. Please login again."
        );
      }

      const data = await AuthService.verifyEmailOTP(email, otp);

      // If password was set during OTP registration, update it now
      if (req.session && req.session.pendingPasswordForOTP && data?.user?.id) {
        try {
          await AuthService.setPassword(data.user.id, req.session.pendingPasswordForOTP);
        } catch (e) {
          console.error("[verifyEmailOTP] setPassword error:", e.message);
        } finally {
          delete req.session.pendingPasswordForOTP;
        }
      }

      const hasTOTP = await AuthService.isTOTPEnabled(email);

      if (hasTOTP) {
        req.session.tempUserForTOTP = {
          email,
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          user: data.user,
        };

        res.clearCookie("verification_email", { domain: COOKIE_DOMAIN });

        return sendResponse(res, 200, "TOTP required", { requiresTOTP: true });
      }

      res.cookie("access_token", data.session.access_token, {
        httpOnly: true,
        secure: NODE_ENV === "production",
        sameSite: NODE_ENV === "production" ? "none" : "lax",
        maxAge: data.session.expires_in * 1000,
        domain: COOKIE_DOMAIN,
      });

      res.cookie("refresh_token", data.session.refresh_token, {
        httpOnly: true,
        secure: NODE_ENV === "production",
        sameSite: NODE_ENV === "production" ? "none" : "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
        domain: COOKIE_DOMAIN,
      });

      res.clearCookie("verification_email", { domain: COOKIE_DOMAIN });

      return sendResponse(res, 200, "Login successful", { user: data.user });
    } catch (error) {
      return sendError(res, 401, error.message);
    }
  }

  static async loginWithTOTP(req, res) {
    try {
      const { email, password, totpToken } = req.body;
      const data = await AuthService.loginWithTOTP(email, password, totpToken);

      res.cookie("access_token", data.session.access_token, {
        httpOnly: true,
        secure: NODE_ENV === "production",
        sameSite: NODE_ENV === "production" ? "none" : "lax",
        maxAge: data.session.expires_in * 1000,
        domain: COOKIE_DOMAIN,
      });

      res.cookie("refresh_token", data.session.refresh_token, {
        httpOnly: true,
        secure: NODE_ENV === "production",
        sameSite: NODE_ENV === "production" ? "none" : "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
        domain: COOKIE_DOMAIN,
      });

      return sendResponse(res, 200, "Login successful", { user: data.user });
    } catch (error) {
      return sendError(res, 401, error.message);
    }
  }

  static async setupTOTP(req, res) {
    try {
      const userId = req.user.id;
      const email = req.user.email;

      if (!req.session) {
        return sendError(res, 500, "Session not configured properly");
      }

      const totpData = await AuthService.setupTOTP(userId, email);

      req.session.tempTOTPSecret = totpData.secret;
      req.session.totpUserId = userId;

      return sendResponse(res, 200, "TOTP setup initiated", {
        qrCode: totpData.qrCode,
        manualEntryKey: totpData.manualEntryKey,
        backupCodes: totpData.backupCodes,
      });
    } catch (error) {
      console.error(`[setupTOTP] Error: ${error.message}`);
      return sendError(res, 500, error.message);
    }
  }

  static async confirmTOTP(req, res) {
    try {
      const { token } = req.body;
      const userId = req.user.id;

      if (!req.session) {
        return sendError(res, 500, "Session not configured properly");
      }

      const secret = req.session.tempTOTPSecret;
      const sessionUserId = req.session.totpUserId;

      if (!secret || sessionUserId !== userId) {
        return sendError(res, 400, "TOTP setup session expired or invalid");
      }

      await AuthService.enableTOTP(userId, secret, token);

      delete req.session.tempTOTPSecret;
      delete req.session.totpUserId;

      return sendResponse(res, 200, "TOTP enabled successfully");
    } catch (error) {
      console.error(`[confirmTOTP] Error: ${error.message}`);
      return sendError(res, 400, error.message);
    }
  }

  static async disableTOTP(req, res) {
    try {
      const userId = req.user.id;

      await AuthService.disableTOTP(userId);

      return sendResponse(res, 200, "TOTP disabled successfully");
    } catch (error) {
      console.error(`[disableTOTP] Error: ${error.message}`);
      return sendError(res, 500, error.message);
    }
  }

  static async getMe(req, res) {
    try {
      return sendResponse(res, 200, "User retrieved", { user: req.user });
    } catch (error) {
      console.error(`[getMe] Error: ${error.message}`);
      return sendError(res, 500, error.message);
    }
  }

  static async logout(req, res) {
    try {
      if (req.session) {
        req.session.destroy((err) => {
          if (err) console.error("Session destroy error:", err);
        });
      }

      res.clearCookie("access_token", { domain: COOKIE_DOMAIN });
      res.clearCookie("refresh_token", { domain: COOKIE_DOMAIN });
      res.clearCookie("verification_email", { domain: COOKIE_DOMAIN });
      res.clearCookie("sessionId", { domain: COOKIE_DOMAIN });

      return sendResponse(res, 200, "Logged out successfully");
    } catch (error) {
      return sendError(res, 500, error.message);
    }
  }

  static async getTOTPStatus(req, res) {
    try {
      const email = req.user.email;
      const isEnabled = await AuthService.isTOTPEnabled(email);

      return sendResponse(res, 200, "TOTP status retrieved", {
        totpEnabled: isEnabled,
      });
    } catch (error) {
      return sendError(res, 500, error.message);
    }
  }

  static async refreshToken(req, res) {
    try {
      const refreshToken = req.cookies.refresh_token;

      if (!refreshToken) {
        return sendError(res, 401, "Refresh token missing");
      }

      const session = await AuthService.refreshSession(refreshToken);

      res.cookie("access_token", session.access_token, {
        httpOnly: true,
        secure: NODE_ENV === "production",
        sameSite: NODE_ENV === "production" ? "none" : "lax",
        maxAge: session.expires_in * 1000,
        domain: COOKIE_DOMAIN,
        path: "/",
      });

      if (session.refresh_token) {
        res.cookie("refresh_token", session.refresh_token, {
          httpOnly: true,
          secure: NODE_ENV === "production",
          sameSite: NODE_ENV === "production" ? "none" : "lax",
          maxAge: 30 * 24 * 60 * 60 * 1000,
          domain: COOKIE_DOMAIN,
          path: "/",
        });
      }

      return sendResponse(res, 200, "Token refreshed successfully", {
        success: true,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
        expires_at: session.expires_at,
      });
    } catch (error) {
      res.clearCookie("access_token", { domain: COOKIE_DOMAIN });
      res.clearCookie("refresh_token", { domain: COOKIE_DOMAIN });
      res.clearCookie("verification_email", { domain: COOKIE_DOMAIN });

      return sendError(res, 401, "Refresh failed: " + error.message);
    }
  }
}

module.exports = AuthController;
