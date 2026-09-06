import { Telegraf } from "telegraf";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

bot.start((ctx) => {
  ctx.reply(
    "👋 <b>Привет! Я на связи.</b>\n\nНапиши тему, и я составлю для тебя структурированный лонгрид с заголовками, списками и таблицами.",
    { parse_mode: "HTML" },
  );
});

bot.on("text", async (ctx) => {
  try {
    await ctx.sendChatAction("typing");

    const apiKey = process.env.GEMINI_API_KEY;
    const prompt = ctx.message.text;

    // Промпт, заставляющий модель выдавать полноценные структурированные статьи
    const systemInstruction = `Ты экспертный автор лонгридов. Пиши структурированные, глубокие и красивые ответы для Telegram.
Обязательно используй HTML-разметку для форматирования:
- Крупные заголовки оформляй жирным шрифтом через <b>Заголовок</b>.
- Используй маркированные списки с буллетами (•) для перечислений.
- Важные мысли или цитаты выделяй курсивом <i> или цитатными тегами.
- Если нужно сравнить или структурировать данные, оформляй их в виде таблицы или аккуратных блоков с моноширинным шрифтом (<code>).
Текст должен выглядеть чисто, профессионально и дорого, без лишней воды.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-3.7-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: `${systemInstruction}\n\nТема запроса: ${prompt}` },
              ],
            },
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

    // Отправляем с поддержкой HTML, чтобы все заголовки и списки отображались красиво
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
