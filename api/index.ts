import { Telegraf } from "telegraf";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Инициализируем бота и нейросеть
const bot = new Telegraf(process.env.TELEGRAM_TOKEN!);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

bot.start((ctx) => ctx.reply("Привет! Я переехал на Vercel. Жду твоих идей!"));

bot.on("text", async (ctx) => {
  try {
    await ctx.sendChatAction("typing");
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(ctx.message.text);
    await ctx.reply(result.response.text());
  } catch (error) {
    console.error(error);
    await ctx.reply("Ошибка сервера или нейросети.");
  }
});

// Экспортируем функцию для Vercel
export default async function handle(req: any, res: any) {
  try {
    // Передаем данные от Telegram в Telegraf
    await bot.handleUpdate(req.body);
    return res.status(200).send("OK");
  } catch (e) {
    console.error(e);
    return res.status(500).send("Error");
  }
}
