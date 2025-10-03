const { supabaseAdmin, supabaseUser } = require("../config/database");
const TOTPService = require("./totpservice");

class AuthService {
  // Sign in with email & password
  static async loginWithPassword(email, password) {
    const { data, error } = await supabaseUser.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new Error("Invalid credentials");
    }

    return data;
  }

  // Send OTP to email
  static async sendEmailOTP(email) {
    const { error } = await supabaseUser.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    if (error) {
      throw new Error("Failed to send OTP");
    }
  }

  // Verify OTP
  static async verifyEmailOTP(email, otp) {
    const { data, error } = await supabaseUser.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });

    if (error) {
      throw new Error("Invalid or expired OTP");
    }

    return data;
  }

  // Register new user
  static async register(email, password) {
    // Default signUp flow (email confirmation link)
    const { data, error } = await supabaseUser.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: "https://nexdash.cyber1337x.dev/auth/callback",
      },
    });

    if (error) {
      throw new Error(error.message || "Registration failed");
    }

    return data;
  }

  // Register via Email OTP (passwordless sign up)
  static async registerWithEmailOTP(email) {
    const { error } = await supabaseUser.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: "http://localhost:3001/auth/verify-otp",
      },
    });

    if (error) {
      throw new Error(error.message || "Failed to send signup OTP");
    }

    return { success: true };
  }

  // Get user from access token
  static async getUserByToken(accessToken) {
    const {
      data: { user },
      error,
    } = await supabaseUser.auth.getUser(accessToken);

    if (error || !user) {
      throw new Error("Invalid session");
    }

    return user;
  }

  // Refresh session manually
  static async refreshSession(refreshToken) {
    try {
      console.log("---> refreshing: ", refreshToken);
      const { data, error } = await supabaseUser.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (error || !data.session) {
        throw new Error("Invalid refresh token");
      }

      return data.session;
    } catch (error) {
      console.error("refreshSession error:", error);
      throw error;
    }
  }

  // TOTP Setup
  static async setupTOTP(userId, email) {
    try {
      const secret = TOTPService.generateSecret(email);
      const qrCode = await TOTPService.generateQRCode(secret);
      const backupCodes = TOTPService.generateBackupCodes();

      return {
        secret: secret.base32,
        qrCode,
        backupCodes,
        manualEntryKey: secret.base32,
      };
    } catch (error) {
      throw new Error(`Failed to setup TOTP: ${error.message}`);
    }
  }

  // Enable TOTP
  static async enableTOTP(userId, secret, token) {
    const isValid = TOTPService.verifyToken(token, secret);

    if (!isValid) {
      throw new Error("Invalid TOTP token");
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: {
        totp_secret: secret,
        totp_enabled: true,
      },
    });

    if (error) {
      throw new Error(`Failed to enable TOTP: ${error.message}`);
    }

    return true;
  }

  // Disable TOTP
  static async disableTOTP(userId) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: {
        totp_secret: null,
        totp_enabled: false,
      },
    });

    if (error) {
      throw new Error(`Failed to disable TOTP: ${error.message}`);
    }

    return true;
  }

  // Login with TOTP (password + code)
  static async loginWithTOTP(email, password, totpToken) {
    const loginResponse = await this.loginWithPassword(email, password);

    // List users to fetch metadata
    const { data: users, error: listError } =
      await supabaseAdmin.auth.admin.listUsers();

    if (listError) {
      throw new Error("Failed to verify TOTP");
    }

    const user = users.users.find((u) => u.email === email);

    if (!user || !user.user_metadata?.totp_secret) {
      throw new Error("TOTP not configured for this user");
    }

    const isValid = TOTPService.verifyToken(
      totpToken,
      user.user_metadata.totp_secret
    );

    if (!isValid) {
      throw new Error("Invalid TOTP token");
    }

    return loginResponse;
  }

  // Check if user has TOTP enabled (by email)
  static async isTOTPEnabled(email) {
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers();

    if (error) {
      return false;
    }

    const user = users.users.find((u) => u.email === email);
    return user?.user_metadata?.totp_enabled === true;
  }

  // Check if user has TOTP enabled (by ID)
  static async getUserTOTPStatus(userId) {
    const { data: user, error } = await supabaseAdmin.auth.admin.getUserById(
      userId
    );

    if (error || !user) {
      return false;
    }

    return user.user?.user_metadata?.totp_enabled === true;
  }

  // Set/Update user password (admin)
  static async setPassword(userId, newPassword) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (error) {
      throw new Error(`Failed to set password: ${error.message}`);
    }

    return true;
  }
}

module.exports = AuthService;
