const mongoose = require('mongoose');

// Individual endpoint schema (embedded)
const individualEndpointSchema = new mongoose.Schema({
  name: {
    type: String,
    required: false
  },
  method: {
    type: String,
    required: true,
    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']
  },
  path: {
    type: String,
    required: true
  },
  base_url: {
    type: String,
    required: false
  },
  headers: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  query_params: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  auth_type: {
    type: String,
    required: false
  },
  is_active: {
    type: Boolean,
    default: true
  },
  tags: {
    type: [String],
    default: []
  },
  last_used_at: {
    type: Date,
    default: null
  }
}, { _id: true });

// Main endpoint collection schema (groups endpoints by user_id + suite_id)
const endpointCollectionSchema = new mongoose.Schema({
  user_id: {
    type: String,
    required: true
  },
  suite_id: {
    type: String,
    required: true
  },
  endpoints: [individualEndpointSchema],
  total_endpoints: {
    type: Number,
    default: 0
  },
  last_updated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
endpointCollectionSchema.index({ user_id: 1, suite_id: 1 }, { unique: true });
endpointCollectionSchema.index({ user_id: 1 });

module.exports = mongoose.model('EndpointCollection', endpointCollectionSchema);
