const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const { APP_NAME } = require("../config/environment");

class TOTPService {
  static generateSecret(userEmail) {
    return speakeasy.generateSecret({
      name: userEmail,
      issuer: APP_NAME,
      length: 32,
    });
  }

  static async generateQRCode(secret) {
    try {
      const qrCodeDataURL = await QRCode.toDataURL(secret.otpauth_url);
      return qrCodeDataURL;
    } catch (error) {
      throw new Error("Failed to generate QR code");
    }
  }

  // Verify TOTP token
  static verifyToken(token, secret) {
    return speakeasy.totp.verify({
      secret: secret,
      encoding: "base32",
      token: token,
      window: 2, // Allow 2 time steps (60 seconds) of tolerance
    });
  }

  static generateBackupCodes(count = 8) {
    const codes = [];
    for (let i = 0; i < count; i++) {
      const code = Math.random().toString().slice(2, 10);
      codes.push(code);
    }
    return codes;
  }
}

module.exports = TOTPService;
