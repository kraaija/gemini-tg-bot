import { Telegraf } from "telegraf";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

bot.start((ctx) => ctx.reply("Привет! Я на связи."));

bot.on("text", async (ctx) => {
  try {
    await ctx.sendChatAction("typing");

    const token = process.env.GEMINI_API_KEY;
    const prompt = ctx.message.text;

    // Запрос через Vertex AI REST API с Bearer-авторизацией для AQ-токенов
    const response = await fetch(
      `https://us-central1-aiplatform.googleapis.com/v1/projects/gemini-bot-project/locations/us-central1/publishers/google/models/gemini-1.5-flash:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Vertex API Error Details:", JSON.stringify(data));
      throw new Error(
        data.error?.message || `HTTP error! status: ${response.status}`,
      );
    }

    const replyText =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Пустой ответ от нейросети.";
    await ctx.reply(replyText);
  } catch (error) {
    console.error("Fetch Error:", error);
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
