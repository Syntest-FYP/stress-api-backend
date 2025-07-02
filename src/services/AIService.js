const { OpenAI } = require("openai");
const { OpenAIConfig } = require("../config/ai");

const openai = new OpenAI({ apiKey: OpenAIConfig.apiKey });

class AIService {
  static async chat(prompt) {
    const res = await openai.chat.completions.create({
      model: OpenAIConfig.model,
      messages: [{ role: "user", content: prompt }],
    });

    return res.choices[0].message.content || "";
  }
}

module.exports = { AIService };
