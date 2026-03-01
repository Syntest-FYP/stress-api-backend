const mongoose = require("mongoose");

const passiveLogSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    endpointPath: {
      type: String,
      required: true,
      index: true,
    },
    method: {
      type: String,
      required: true,
      uppercase: true,
    },
    statusCode: {
      type: Number,
      required: true,
      index: true,
    },
    responseTime: {
      type: Number, // In milliseconds
      required: true,
    },
    userId: {
      type: String,
      index: true,
    },
    ipAddress: {
      type: String,
    },
    errorMessage: {
      type: String,
    },
    rawLog: {
      type: mongoose.Schema.Types.Mixed,
    },
    source: {
      type: String,
      enum: ["file_upload", "webhook"],
      default: "file_upload",
    },
    metadata: {
      type: Map,
      of: String,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for performance on analytics queries
passiveLogSchema.index({ endpointPath: 1, timestamp: -1 });
passiveLogSchema.index({ statusCode: 1, timestamp: -1 });

const PassiveLog = mongoose.model("PassiveLog", passiveLogSchema);

module.exports = PassiveLog;
