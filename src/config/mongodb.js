const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // fail fast instead of hanging
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`[MongoDB] Connection failed: ${error.message}`);
    console.warn('[MongoDB] Continuing without MongoDB. Features requiring MongoDB (endpoints, specs) will be unavailable.');
    // Do not exit — PostgreSQL-dependent features still work
  }
};

module.exports = { connectDB };
