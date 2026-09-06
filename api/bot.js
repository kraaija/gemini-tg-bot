import { Telegraf } from "telegraf";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

bot.start((ctx) => {
  ctx.reply(
    "👋 Привет! Отправь тему, и я сгенерирую статью в формате Rich Message.",
  );
});

bot.on("text", async (ctx) => {
  try {
    await ctx.sendChatAction("typing");

    const apiKey = process.env.GEMINI_API_KEY;
    const prompt = ctx.message.text;

    const systemInstruction = `Ты профессиональный AI-автор. Пиши структурированные статьи для Telegram, используя заголовки, списки, цитаты и таблицы (в формате Markdown, пригодном для конвертации в Rich Blocks).`;

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

    // Отправляем через официальный метод Bot API 10.1+ sendRichMessage
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

    const richData = await richRes.json();

    // Если сервер или библиотека еще не обновились до поддержки Rich Messages, делаем фолбек на обычный Markdown
    if (!richRes.ok) {
      console.warn("Rich Message fallback to Markdown:", richData);
      await ctx.reply(replyText, { parse_mode: "Markdown" });
    }
  } catch (error) {
    console.error("API Error:", error);
    if (error.message.includes("high demand")) {
      await ctx.reply("⚠️ Модель перегружена, попробуй еще раз через секунду.");
    } else {
      await ctx.reply(`❌ Ошибка: ${error.message}`);
    }
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
