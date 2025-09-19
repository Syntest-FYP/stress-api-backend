const express = require("express");
const AuthController = require("../controllers/auth.controller");
const { verifyAuth } = require("../middleware/auth");
const { validate, schemas } = require("../middleware/validation");

const router = express.Router();

router.post("/login", validate(schemas.login), AuthController.login);

router.post(
  "/verify-otp",
  validate(schemas.verifyEmailOTP),
  AuthController.verifyEmailOTP
);

router.post(
  "/login-totp",
  validate(schemas.loginWithTOTP),
  AuthController.loginWithTOTP
);

router.post("/register", AuthController.register);
router.get("/me", verifyAuth, AuthController.getMe);
router.post("/refresh-token", AuthController.refreshToken);

router.get("/totp/status", verifyAuth, AuthController.getTOTPStatus);
router.post("/totp/setup", verifyAuth, AuthController.setupTOTP);
router.post(
  "/totp/confirm",
  verifyAuth,
  validate(schemas.setupTOTP),
  AuthController.confirmTOTP
);
router.delete("/totp/disable", verifyAuth, AuthController.disableTOTP);

router.post("/logout", verifyAuth, AuthController.logout);

module.exports = router;
