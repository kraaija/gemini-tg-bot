import { Telegraf } from "telegraf";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

bot.start((ctx) => ctx.reply("Привет! Я на связи."));

bot.on("text", async (ctx) => {
  try {
    await ctx.sendChatAction("typing");

    const apiKey = process.env.GEMINI_API_KEY;
    const prompt = ctx.message.text;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error?.message || `HTTP error! status: ${response.status}`,
      );
    }

    const replyText =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "Пустой ответ.";
    await ctx.reply(replyText);
  } catch (error) {
    console.error("API Error:", error);
    await ctx.reply(`Ошибка: ${error.message}`);
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
