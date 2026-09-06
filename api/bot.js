import { Telegraf } from "telegraf";
import { GoogleGenerativeAI } from "@google/generative-ai";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

bot.start((ctx) => ctx.reply("Привет! Я на связи."));

bot.on("text", async (ctx) => {
  try {
    await ctx.sendChatAction("typing");
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(ctx.message.text);
    const responseText = result.response.text();
    await ctx.reply(responseText);
  } catch (error) {
    console.error("Gemini Error:", error);
    await ctx.reply("Ошибка нейросети.");
  }
});

export default async function handler(req, res) {
  try {
    await bot.handleUpdate(req.body);
    return res.status(200).send("OK");
  } catch (e) {
    console.error("Handler Error:", e);
    return res.status(500).send("Error");
  }
}
