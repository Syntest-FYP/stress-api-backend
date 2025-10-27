const express = require("express");
const router = express.Router();
const {
  getCategories,
} = require("../controllers/categories.controller");
const { verifyAuth } = require("../middleware/auth");

router.use(verifyAuth);

// Get categories from analyzed schema
router.get("/:suiteId", getCategories);

module.exports = router;