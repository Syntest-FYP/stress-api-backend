const express = require("express");
const cors = require("cors");
const testRoutes = require("./routes/testRoutes");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/test", testRoutes);

app.get("/", (req, res) => {
  res.json({ message: "running" });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Load test server running on http://localhost:${PORT}`);
});
