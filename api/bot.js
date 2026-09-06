import { Telegraf } from "telegraf";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

bot.start((ctx) => {
  ctx.reply("👋 Привет! Напиши тему, и я сгенерирую статью.");
});

bot.on("text", async (ctx) => {
  try {
    await ctx.sendChatAction("typing");

    const apiKey = process.env.GEMINI_API_KEY;
    const prompt = ctx.message.text;

    const systemInstruction = `Ты профессиональный редактор. Напиши структурированную статью с заголовками, списками и таблицами.`;

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

    if (!response.ok) {
      throw new Error(data.error?.message || `HTTP error: ${response.status}`);
    }

    let replyText =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "Пустой ответ.";

    // Обрезаем текст, если он больше лимита Telegram (4096 символов), чтобы не падало с ошибкой message is too long
    if (replyText.length > 4000) {
      replyText =
        replyText.substring(0, 3950) +
        "\n\n*(Текст обрезан из-за лимита длины)*";
    }

    // Отправляем обычным проверенным методом с поддержкой Markdown, без вылетов
    await ctx.reply(replyText, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("API Error:", error);
    // Если модель перегружена (high demand), говорим об этом по-человечески
    if (
      error.message.includes("high demand") ||
      error.message.includes("overloaded")
    ) {
      await ctx.reply(
        "⚠️ Модель временно перегружена. Попробуй отправить запрос еще раз через пару секунд.",
      );
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
