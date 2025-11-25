const express = require("express");
const router = express.Router();

const { verifyAuth } = require("../middleware/auth");
const {
  getOwaspCatalog,
  scanEndpointAgainstOwasp,
} = require("../controllers/security.controller");

router.use((req, res, next) => {
  if (!req.body || typeof req.body !== "object") {
    req.body = {};
  }
  next();
});

router.use(verifyAuth);

router.get("/owasp", getOwaspCatalog);
router.post("/owasp/scan", scanEndpointAgainstOwasp);

module.exports = router;


