import { Telegraf } from "telegraf";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

bot.start((ctx) => ctx.reply("Привет! Я на связи."));

bot.on("text", async (ctx) => {
  try {
    await ctx.sendChatAction("typing");

    const apiKey = process.env.GEMINI_API_KEY;
    const prompt = ctx.message.text;

    // Сначала получаем список доступных моделей для этого ключа
    const modelsRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`,
    );
    const modelsData = await modelsRes.json();

    if (!modelsRes.ok) {
      throw new Error(
        modelsData.error?.message || "Не удалось получить список моделей",
      );
    }

    // Ищем модель, которая поддерживает генерацию текста
    const validModel = modelsData.models?.find((m) =>
      m.supportedGenerationMethods?.includes("generateContent"),
    );

    if (!validModel) {
      throw new Error(
        "У твоего ключа нет доступных моделей для генерации текста.",
      );
    }

    // Используем найденное имя модели
    const modelName = validModel.name; // обычно возвращает что-то вроде "models/gemini-1.5-flash"

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/${modelName}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
