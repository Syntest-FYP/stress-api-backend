const express = require("express");
const TestController = require("../controllers/suite.controller");
const { verifyAuth } = require("../middleware/auth");
const { validate, schemas } = require("../middleware/validation");

const router = express.Router();

router.post(
  "/",
  verifyAuth,
  validate(schemas.createTestSuite),
  TestController.createTestSuite
);

router.get("/", verifyAuth, TestController.getAllTestSuites);

router.get("/:id", verifyAuth, TestController.getTestSuiteById);

router.put(
  "/:id",
  verifyAuth,
  validate(schemas.updateTestSuite),
  TestController.updateTestSuite
);

router.delete("/:id", verifyAuth, TestController.deleteTestSuite);

module.exports = router;
