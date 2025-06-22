const express = require("express");
const router = express.Router();
const { runLoadTest } = require("../controllers/testController");

router.post("/run-test", runLoadTest);

module.exports = router;
