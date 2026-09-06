import { Telegraf } from "telegraf";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

bot.start((ctx) => {
  ctx.reply(
    "👋 <b>Привет! Я на связи.</b>\n\nЯ готов делать крутые посты с форматированием (Rich Text). Напиши тему, и я оформлю текст красиво.",
    { parse_mode: "HTML" },
  );
});

bot.on("text", async (ctx) => {
  try {
    await ctx.sendChatAction("typing");

    const apiKey = process.env.GEMINI_API_KEY;
    const prompt = ctx.message.text;

    // Инструкция для генерации текста с использованием HTML-тегов Телеграма
    const systemInstruction =
      "Ты профессиональный контент-мейкер. Оформляй ответ красиво, используя HTML-теги Telegram: <b>жирный</b>, <i>курсив</i>, <code>моноширинный</code>, <s>зачеркнутый</s>, <tg-spoiler>спойлер</tg-spoiler>, а также блоки кода или цитаты. Пиши аккуратно и структурированно.";

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-3.7-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { parts: [{ text: `${systemInstruction}\n\nЗапрос: ${prompt}` }] },
          ],
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

    // Отправляем с поддержкой HTML-разметки
    await ctx.reply(replyText, { parse_mode: "HTML" });
  } catch (error) {
    console.error("API Error:", error);
    await ctx.reply(`❌ <b>Ошибка:</b> <code>${error.message}</code>`, {
      parse_mode: "HTML",
    });
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
