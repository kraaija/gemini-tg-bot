import { Telegraf } from "telegraf";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

bot.start((ctx) => {
  ctx.reply(
    "👋 Привет! Отправь тему или фото, и я сгенерирую ответ через нативные Rich Blocks.",
  );
});

// Заменили bot.on("text") на "message", чтобы ловить и текст, и фотки
bot.on("message", async (ctx) => {
  // Игнорируем всё кроме текста и фото (чтобы не падал на стикерах/опросах)
  if (!ctx.message.text && !ctx.message.photo && !ctx.message.caption) return;

  // Чтобы не завис интервал на Vercel
  let typingInterval;

  try {
    const prompt = (ctx.message.text || ctx.message.caption || "").trim();
    const hasPhoto = !!ctx.message.photo;

    // ЖЕСТКИЙ ФИЛЬТР: работает только если нет фото и текст короткий
    const stopWords = [
      "ок",
      "окей",
      "да",
      "угу",
      "ага",
      "спасибо",
      "спс",
      "понял",
      "плюс",
      "агась",
    ];
    if (
      !hasPhoto &&
      (prompt.length < 4 || stopWords.includes(prompt.toLowerCase()))
    ) {
      await ctx.reply("👍 Принято! Жду тему для новой статьи или задачу.");
      return;
    }

    // 1. Постоянный индикатор "Печатает..." (как класс Typing в codex_bridge)
    await ctx.sendChatAction("typing").catch(() => {});
    typingInterval = setInterval(() => {
      ctx.sendChatAction("typing").catch(() => {});
    }, 4000);

    // 2. Скачивание фото (берем самый большой размер, как в incoming_attachment)
    let imagePart = null;
    if (hasPhoto) {
      const photo = ctx.message.photo.pop(); // Последний элемент — самое высокое качество
      const fileLink = await ctx.telegram.getFileLink(photo.file_id);
      const imageResp = await fetch(fileLink.href);
      const arrayBuffer = await imageResp.arrayBuffer();
      imagePart = {
        inlineData: {
          data: Buffer.from(arrayBuffer).toString("base64"),
          mimeType: "image/jpeg",
        },
      };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const currentDate = new Date().toLocaleDateString("ru-RU", {
      timeZone: "Europe/Moscow",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    // 3. Усиленный промпт со спизженными правилами математики и форматирования
    const systemInstruction = `Ты профессиональный AI-автор и преподаватель. Текущая дата: ${currentDate}. Пользователь находится в Казани. 
Никогда не путай месяцы и время. Пиши глубокие статьи, используя заголовки, списки и таблицы (Markdown), которые преобразуются в нативные блоки. 
ВАЖНО ПО ФОРМАТИРОВАНИЮ:
- Математические выражения оформляй как $...$ внутри строки или $$...$$ отдельным блоком. 
- Не используй \\lvert / \\rvert, для модуля пиши \\left|...\\right|. 
- Не помещай формулы с модулем в таблицы — выноси их отдельным блоком.
- Если приложено фото, внимательно изучи его и дай подробный ответ.`;

    // Собираем части запроса (текст + картинка, если есть)
    const parts = [
      {
        text: `${systemInstruction}\n\nЗапрос: ${prompt || "Опиши, что на фото, и реши задачу, если она там есть."}`,
      },
    ];
    if (imagePart) parts.push(imagePart);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-3.7-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts }] }),
      },
    );

    const data = await response.json();
    if (!response.ok) {
      if (response.status === 429) {
        throw new Error(
          "Превышен лимит запросов (20 в минуту). Подожди полминуты перед новым запросом.",
        );
      }
      throw new Error(data.error?.message || `HTTP error: ${response.status}`);
    }

    const replyText =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "(пустой ответ)";
    const telegramToken = process.env.TELEGRAM_TOKEN;
    const chatId = ctx.chat.id;
    const messageId = ctx.message.message_id;

    // 4. Отправка Rich Message с reply_parameters (чтобы ответ цеплялся к твоему сообщению)
    const richRes = await fetch(
      `https://api.telegram.org/bot${telegramToken}/sendRichMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          reply_parameters: { message_id: messageId }, // Ответ веткой (Reply)
          rich_message: { markdown: replyText },
        }),
      },
    );

    const richData = await richRes.json();

    // 5. Умный фолбек (как send_html): если Rich упал, режем лонгрид по 4000 символов, чтобы не было ошибки длины
    if (!richRes.ok) {
      console.warn("Rich Message API fallback:", richData);
      const chunkSize = 4000;
      for (let i = 0; i < replyText.length; i += chunkSize) {
        const chunk = replyText.substring(i, i + chunkSize);
        await ctx
          .reply(chunk, {
            parse_mode: "Markdown",
            reply_parameters: i === 0 ? { message_id: messageId } : undefined,
          })
          .catch(() => ctx.reply(chunk)); // Если Markdown сломан, шлем сырой текст
      }
    }
  } catch (error) {
    console.error("API Error:", error);
    await ctx.reply(`❌ Ошибка: ${error.message}`);
  } finally {
    if (typingInterval) clearInterval(typingInterval);
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
