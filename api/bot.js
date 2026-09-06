import { Telegraf } from "telegraf";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

bot.start((ctx) =>
  ctx.reply(
    "Привет! Отправь задачу или текст, и я оформлю его как Rich Message.",
  ),
);

bot.on("text", async (ctx) => {
  try {
    await ctx.sendChatAction("typing");

    const apiKey = process.env.GEMINI_API_KEY;
    const prompt = ctx.message.text;

    const systemInstruction = `Ты помощник, который формирует ответы в формате Rich Message для Telegram. 
Используй продвинутую разметку или структурируй текст с заголовками, таблицами и списками, поддерживаемыми в новых блок-структурах Telegram.`;

    // Запрос к Gemini
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
    if (!response.ok)
      throw new Error(
        data.error?.message || `HTTP error! status: ${response.status}`,
      );

    const replyText =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "Пустой ответ.";

    // Отправка через нативный метод sendRichMessage Bot API
    const telegramToken = process.env.TELEGRAM_TOKEN;
    const chatId = ctx.chat.id;

    const richRes = await fetch(
      `https://api.telegram.org/bot${telegramToken}/sendRichMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          // Передаем текст в формате Rich Markdown / HTML, который обрабатывается нативными блоками
          rich_markdown: replyText,
        }),
      },
    );

    const richData = await richRes.json();

    // Если метод вдруг не поддерживается старой версией библиотеки или провайдера, падаем на обычный send
    if (!richRes.ok) {
      console.warn("sendRichMessage fallback:", richData);
      await ctx.reply(replyText, { parse_mode: "HTML" });
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
