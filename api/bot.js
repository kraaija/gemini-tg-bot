import { Telegraf } from "telegraf";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

bot.start((ctx) => {
  ctx.reply(
    "👋 Привет! Отправь тему, и я сгенерирую статью через нативные Rich Blocks.",
  );
});

bot.on("text", async (ctx) => {
  try {
    await ctx.sendChatAction("typing");

    const apiKey = process.env.GEMINI_API_KEY;
    const prompt = ctx.message.text;

    const currentDate = new Date().toLocaleDateString("ru-RU", {
      timeZone: "Europe/Moscow",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const systemInstruction = `Ты профессиональный AI-автор и преподаватель. Текущая дата: ${currentDate}. Пользователь находится в Казани. Никогда не путай месяцы и время. Пиши глубокие статьи, используя заголовки, списки и таблицы (Markdown), которые преобразуются в нативные блоки. Если нужно объяснить математику или точные науки, делай это понятно и пошагово.`;

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

    const richRes = await fetch(
      `https://api.telegram.org/bot${telegramToken}/sendRichMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          rich_message: {
            markdown: replyText,
          },
        }),
      },
    );

    const richData = await richRes.json();

    if (!richRes.ok) {
      console.warn("Rich Message API fallback:", richData);
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
