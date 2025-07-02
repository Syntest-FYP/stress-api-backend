require("dotenv").config();

const OpenAIConfig = {
  apiKey: process.env.OPENAI_API_KEY_SECRET,
  model: "gpt-3.5-turbo",
  baseUrl: process.env.OPENAI_BASE_URL,
};

module.exports = { OpenAIConfig };
