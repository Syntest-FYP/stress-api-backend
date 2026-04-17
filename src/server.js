const app = require("./app");
const { connectDB } = require("./config/mongodb");
require("dotenv").config();
require("./workers/monitoring.worker"); // Initialize monitoring worker

const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// Start Background Workers for Passive Monitoring
require("./workers/ingestionWorker");
require("./workers/analyticsWorker");
require("./workers/anomalyWorker");
console.log("✅ Passive Monitoring Workers started");

app.listen(PORT, () => {
  console.log(`--> Server is running on http://localhost:${PORT}`);
});
