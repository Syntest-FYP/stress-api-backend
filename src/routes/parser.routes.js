const express = require("express");
const router = express.Router();
const { verifyAuth } = require("../middleware/auth");
const {
  parseApiDocFromFile,
  uploadAndParseSpec,
  getUploadedSpec,
} = require("../controllers/parser.controller");
const { uploadSpec } = require("../middleware/upload");

// Error handler for multer upload errors
const handleUploadError = (err, req, res, next) => {
  if (err) {
    console.error("[UPLOAD] Multer error:", err);
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ 
        error: "File too large. Maximum size is 10MB." 
      });
    }
    if (err.message && err.message.includes("Only JSON and YAML")) {
      return res.status(400).json({ 
        error: "Invalid file type. Only JSON and YAML files are allowed." 
      });
    }
    return res.status(400).json({ 
      error: err.message || "File upload failed" 
    });
  }
  next();
};

router.get("/api-doc", verifyAuth, parseApiDocFromFile);
router.get("/api-doc-swagger", verifyAuth, parseApiDocFromFile);
router.post("/upload", verifyAuth, uploadSpec, handleUploadError, uploadAndParseSpec);
router.get("/spec", verifyAuth, getUploadedSpec);

module.exports = router;
