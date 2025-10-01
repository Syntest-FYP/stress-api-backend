const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const morgan = require("morgan");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const session = require("express-session");

const userRoutes = require("./routes/user.routes");
const testRoutes = require("./routes/test.routes");
const resultRoutes = require("./routes/result.routes");
const parserRoutes = require("./routes/parser.routes");
const authRoutes = require("./routes/auth.routes");
const suitesRoutes = require("./routes/suite.routes");
const environmentRoutes = require("./routes/environment.routes");

dotenv.config();

require("./config/postgres");

const app = express();

// -------> MIDDLEWARE <-------

app.use(express.json());
app.use(morgan("dev"));

const allowedOrigin =
  process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : "https://nexdash.cyber1337x.dev";

app.use(
  cors({
    credentials: true,
    origin: allowedOrigin,
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    exposedHeaders: ["set-cookie"],
  })
);

app.use(bodyParser.json());
app.use(cookieParser());

const NODE_ENV = process.env.NODE_ENV || "development";
const isProduction = NODE_ENV === "production";
const COOKIE_DOMAIN =
  process.env.NODE_ENV === "development" ? undefined : ".cyber1337x.dev";

if (isProduction) {
  app.set("trust proxy", 1);
}

app.use(
  session({
    secret: process.env.SESSION_SECRET || "fallback-secret-not-for-production",
    resave: false,
    saveUninitialized: false,
    name: "sessionId",
    cookie: {
      secure: NODE_ENV === "production",
      sameSite: NODE_ENV === "production" ? "none" : "lax",
      maxAge: 15 * 60 * 1000,
      domain: COOKIE_DOMAIN,
      path: "/",
    },
  })
);

//---------> ROUTES <-----------

app.get("/", (req, res) => {
  res.status(200).json({ message: "Stress API is running" });
});

app.use("/api/users", userRoutes);
app.use("/api/tests", testRoutes);
app.use("/api/results", resultRoutes);
app.use("/api/parser", parserRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/test-suites", suitesRoutes);
app.use("/api/environments", environmentRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal Server Error" });
});

module.exports = app;
