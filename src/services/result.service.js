const resultModel = require("../models/result.model");

async function createGeneratedTestResult(data) {
  return resultModel.createGeneratedTestResult(data);
}

async function getGeneratedTestResultsBySuite(suite_id, user_id) {
  return resultModel.getGeneratedTestResultsBySuite(suite_id, user_id);
}

async function getGeneratedTestResultsByConversationId(conversation_id, user_id) {
    return resultModel.getGeneratedTestResultsByConversationId(conversation_id, user_id);
}

module.exports = {
  createGeneratedTestResult,
  getGeneratedTestResultsBySuite,
  getGeneratedTestResultsByConversationId,
};
