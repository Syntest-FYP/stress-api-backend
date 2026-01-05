const AuthService = require("../services/authService");
const { sendResponse, sendError } = require("../utils/response");
const { NODE_ENV } = require("../config/environment");

const COOKIE_DOMAIN =
  process.env.NODE_ENV === "development" ? undefined : ".cyber1337x.dev";

class AuthController {
  static async login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return sendError(res, 400, "Email and password are required");
      }

      // 1. Login with password (validates credentials)
      const data = await AuthService.loginWithPassword(email, password);

      console.log("skipping otp");
      // await AuthService.sendEmailOTP(email);

      // 3. Check for TOTP
      const hasTOTP = await AuthService.isTOTPEnabled(email);

      if (hasTOTP) {
        req.session.tempUserForTOTP = {
          email,
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          user: data.user,
        };

        // Clear any lingering verification cookie
        res.clearCookie(
          "verification_email",
          COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}
        );

        return sendResponse(res, 200, "TOTP required", { requiresTOTP: true });
      }

      // 4. No TOTP -> Finalize Login (Set cookies & return success)
      const cookieOptions = {
        httpOnly: true,
        secure: NODE_ENV === "production",
        sameSite: NODE_ENV === "production" ? "none" : "lax",
        maxAge: data.session.expires_in * 1000,
      };

      if (COOKIE_DOMAIN) {
        cookieOptions.domain = COOKIE_DOMAIN;
      }

      res.cookie("access_token", data.session.access_token, cookieOptions);

      res.cookie("refresh_token", data.session.refresh_token, {
        ...cookieOptions,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      // Clear verification cookie if it exists
      res.clearCookie(
        "verification_email",
        COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}
      );

      return sendResponse(res, 200, "Login successful", { user: data.user });

      /* Original OTP Flow (Commented out)
      const cookieOptions = {
        httpOnly: true,
        secure: NODE_ENV === "production",
        sameSite: NODE_ENV === "production" ? "none" : "lax",
        maxAge: 10 * 60 * 1000,
      };
      
      if (COOKIE_DOMAIN) {
        cookieOptions.domain = COOKIE_DOMAIN;
      }

      res.cookie("verification_email", email, cookieOptions);

      return sendResponse(res, 200, "OTP sent to email");
      */
    } catch (error) {
      console.error("Login error:", error);
      return sendError(res, 401, error.message || "Invalid credentials");
    }
  }

  static async register(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return sendError(res, 400, "Email and password are required");
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

      // Try to get email from cookie first, fallback to request body
      const email = req.cookies.verification_email || emailFromBody;

      //console.log("=== OTP Verification Attempt ===");
      //console.log("All cookies:", req.cookies);
      //console.log("Request body:", req.body);
      //console.log("Email from cookie:", req.cookies.verification_email);
      //console.log("Email from body:", emailFromBody);
      //console.log("Using email:", email);
      //console.log("OTP:", otp);
      //console.log("================================");

      if (!email) {
        console.error("❌ No email found in cookie or body");
        return sendError(res, 400, "Email is required. Please login again.");
      }

      if (!otp) {
        console.error("❌ No OTP provided");
        return sendError(res, 400, "OTP is required");
      }

      const data = await AuthService.verifyEmailOTP(email, otp);
      const hasTOTP = await AuthService.isTOTPEnabled(email);

      if (hasTOTP) {
        req.session.tempUserForTOTP = {
          email,
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          user: data.user,
        };

        res.clearCookie(
          "verification_email",
          COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}
        );

        return sendResponse(res, 200, "TOTP required", { requiresTOTP: true });
      }

      const cookieOptions = {
        httpOnly: true,
        secure: NODE_ENV === "production",
        sameSite: NODE_ENV === "production" ? "none" : "lax",
      };

      if (COOKIE_DOMAIN) {
        cookieOptions.domain = COOKIE_DOMAIN;
      }

      res.cookie("access_token", data.session.access_token, {
        ...cookieOptions,
        maxAge: data.session.expires_in * 1000,
      });

      res.cookie("refresh_token", data.session.refresh_token, {
        ...cookieOptions,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      res.clearCookie(
        "verification_email",
        COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}
      );

      return sendResponse(res, 200, "Login successful", { user: data.user });
    } catch (error) {
      console.error("OTP verification error:", error);
      return sendError(res, 401, error.message);
    }
  }
  static async loginWithTOTP(req, res) {
    try {
      const { email, password, totpToken } = req.body;
      const data = await AuthService.loginWithTOTP(email, password, totpToken);

      const cookieOptions = {
        httpOnly: true,
        secure: NODE_ENV === "production",
        sameSite: NODE_ENV === "production" ? "none" : "lax",
      };

      if (COOKIE_DOMAIN) {
        cookieOptions.domain = COOKIE_DOMAIN;
      }

      res.cookie("access_token", data.session.access_token, {
        ...cookieOptions,
        maxAge: data.session.expires_in * 1000,
      });

      res.cookie("refresh_token", data.session.refresh_token, {
        ...cookieOptions,
        maxAge: 30 * 24 * 60 * 60 * 1000,
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

      const clearCookieOptions = COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {};

      res.clearCookie("access_token", clearCookieOptions);
      res.clearCookie("refresh_token", clearCookieOptions);
      res.clearCookie("verification_email", clearCookieOptions);
      res.clearCookie("sessionId", clearCookieOptions);

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

      const cookieOptions = {
        httpOnly: true,
        secure: NODE_ENV === "production",
        sameSite: NODE_ENV === "production" ? "none" : "lax",
        path: "/",
      };

      if (COOKIE_DOMAIN) {
        cookieOptions.domain = COOKIE_DOMAIN;
      }

      res.cookie("access_token", session.access_token, {
        ...cookieOptions,
        maxAge: session.expires_in * 1000,
      });

      if (session.refresh_token) {
        res.cookie("refresh_token", session.refresh_token, {
          ...cookieOptions,
          maxAge: 30 * 24 * 60 * 60 * 1000,
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
      const clearCookieOptions = COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {};

      res.clearCookie("access_token", clearCookieOptions);
      res.clearCookie("refresh_token", clearCookieOptions);
      res.clearCookie("verification_email", clearCookieOptions);

      return sendError(res, 401, "Refresh failed: " + error.message);
    }
  }
}

module.exports = AuthController;
