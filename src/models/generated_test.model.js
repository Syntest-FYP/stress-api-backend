const mongoose = require("mongoose");

const GeneratedTestSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true },
    suite_id: { type: String, required: true },
    source: { type: String, enum: ["single", "module", "all"], required: true },
    category_name: { type: String, default: null },
    endpoint: {
      method: { type: String },
      path: { type: String },
      base_url: { type: String },
      headers: { type: mongoose.Schema.Types.Mixed, default: {} },
      query_params: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    request_options: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    tests: { type: mongoose.Schema.Types.Mixed, default: null },
    raw_response: { type: mongoose.Schema.Types.Mixed, default: null },
    generated_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

GeneratedTestSchema.index({ user_id: 1, suite_id: 1, createdAt: -1 });

module.exports = mongoose.model("GeneratedTest", GeneratedTestSchema);
