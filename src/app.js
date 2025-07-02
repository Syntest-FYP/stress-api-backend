const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const { pool } = require("./config");
const bcrypt = require("bcryptjs");
const morgan = require("morgan");

const userRoutes = require("./routes/user.routes");
const testRoutes = require("./routes/test.routes");
const executionRoutes = require("./routes/execution.routes");
const resultRoutes = require("./routes/result.routes");

dotenv.config();

const app = express();

// -------> MIDDLEWARE <-------
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/", (req, res) => {
  res.status(200).json({ message: "Stress API is running" });
});

app.use("/api/users", userRoutes);
app.use("/api/tests", testRoutes);
app.use("/api/executions", executionRoutes);
app.use("/api/results", resultRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal Server Error" });
});

module.exports = app;
