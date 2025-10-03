const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    const DB = process.env.MONGODB.replace(
      "<PASSWORD>",
      process.env.MONGODB_PASSWORD
    );

    await mongoose.connect(DB, {});
    console.log("Mongo DB connection Success!!");
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

module.exports = { connectDB };
