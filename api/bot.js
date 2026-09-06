import { Telegraf } from "telegraf";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

bot.start((ctx) => {
  ctx.reply(
    "👋 Привет! Отправь тему, и я сгенерирую статью через структурированные блоки Rich Message.",
  );
});

bot.on("text", async (ctx) => {
  try {
    await ctx.sendChatAction("typing");

    const apiKey = process.env.GEMINI_API_KEY;
    const prompt = ctx.message.text;

    // Промпт для генерации текста, который идеально парсится в блоки
    const systemInstruction = `Ты профессиональный редактор. Напиши глубокую статью, используя структуру с заголовками, списками и таблицами для Rich Message.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-3.7-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { parts: [{ text: `${systemInstruction}\n\nТема: ${prompt}` }] },
          ],
        }),
      },
    );

    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error?.message || `HTTP error: ${response.status}`);

    const replyText =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "Пустой ответ.";

    const telegramToken = process.env.TELEGRAM_TOKEN;
    const chatId = ctx.chat.id;

    // Отправка через официальный метод sendRichMessage (Bot API 10.1+)
    const richRes = await fetch(
      `https://api.telegram.org/bot${telegramToken}/sendRichMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          rich_message: {
            rich_markdown: replyText,
          },
        }),
      },
    );

    if (!richRes.ok) {
      // Если клиент или версия апи старые — откатываемся на обычный текст
      await ctx.reply(replyText, { parse_mode: "Markdown" });
    }
  } catch (error) {
    console.error("API Error:", error);
    await ctx.reply(`❌ Ошибка: ${error.message}`);
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
