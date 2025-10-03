const app = require("./app");
const { connectDB } = require("./config/mongodb");
require("dotenv").config();

const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

app.listen(PORT, () => {
  console.log(`--> Server is running on http://localhost:${PORT}`);
});
