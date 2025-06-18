const express = require("express");
const router = express.Router();
const testController = require("../controllers/testController");

router.post("/run", testController.run);

module.exports = router;
