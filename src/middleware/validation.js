const Joi = require("joi");
const { sendError } = require("../utils/response");

const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);

    if (error) {
      return sendError(res, 400, "Validation error", error.details[0].message);
    }

    next();
  };
};

// Validation schemas
const schemas = {
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
  }),

  verifyEmailOTP: Joi.object({
    otp: Joi.string()
      .length(6)
      .pattern(/^[0-9]+$/)
      .required(),
    email: Joi.string().email().optional(), 
  }),

  setupTOTP: Joi.object({
    token: Joi.string()
      .length(6)
      .pattern(/^[0-9]+$/)
      .required(),
  }),

  loginWithTOTP: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    totpToken: Joi.string()
      .length(6)
      .pattern(/^[0-9]+$/)
      .required(),
  }),

  verifyTOTP: Joi.object({
    token: Joi.string()
      .length(6)
      .pattern(/^[0-9]+$/)
      .required(),
  }),
  createTestSuite: Joi.object({
    name: Joi.string().max(100).required(),
    description: Joi.string().allow("").optional(),
    version: Joi.string().max(20).optional().default("1.0"),
    base_url: Joi.string().uri().required(),
    auth_type: Joi.string()
      .valid("none", "api_key", "oauth2", "jwt")
      .default("none"),
    tags: Joi.array().items(Joi.string()).default([]),
    visibility: Joi.string()
      .valid("private", "public", "team")
      .default("private"),
    category: Joi.string().max(50).optional(),
  }),

  updateTestSuite: Joi.object({
    name: Joi.string().max(100).optional(),
    description: Joi.string().allow("").optional(),
    version: Joi.string().max(20).optional(),
    base_url: Joi.string().uri().optional(),
    auth_type: Joi.string()
      .valid("none", "api_key", "oauth2", "jwt")
      .optional(),
    tags: Joi.array().items(Joi.string()).optional(),
    visibility: Joi.string().valid("private", "public", "team").optional(),
    status: Joi.string().valid("active", "deprecated", "archived").optional(),
    category: Joi.string().max(50).optional(),
  }),
};

module.exports = {
  validate,
  schemas,
};
