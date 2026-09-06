import { Telegraf } from "telegraf";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// Функция запроса с автоповторами при перегрузке (retries)
async function fetchGeminiWithRetry(apiKey, body, maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-3.7-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      const data = await response.json();

      if (response.ok) {
        return data;
      }

      const errMsg = data.error?.message || `HTTP error: ${response.status}`;

      // Если модель перегружена (high demand / 503), делаем паузу и пробуем снова
      if (
        response.status === 503 ||
        errMsg.includes("high demand") ||
        errMsg.includes("overloaded")
      ) {
        lastError = new Error(errMsg);
        if (attempt < maxRetries) {
          await new Promise((res) => setTimeout(res, 2000 * attempt));
          continue;
        }
      }

      if (response.status === 429) {
        throw new Error(
          "Превышен лимит запросов (20 в минуту). Подожди полминуты перед новым запросом.",
        );
      }

      throw new Error(errMsg);
    } catch (err) {
      lastError = err;
      if (
        attempt < maxRetries &&
        (err.message.includes("high demand") ||
          err.message.includes("overloaded"))
      ) {
        await new Promise((res) => setTimeout(res, 2000 * attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

bot.start((ctx) => {
  ctx.reply(
    "👋 Привет! Отправь тему или фото, и я сгенерирую ответ через нативные Rich Blocks.",
  );
});

bot.on("message", async (ctx) => {
  if (!ctx.message.text && !ctx.message.photo && !ctx.message.caption) return;

  let typingInterval;

  try {
    const prompt = (ctx.message.text || ctx.message.caption || "").trim();
    const hasPhoto = !!ctx.message.photo;

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

    await ctx.sendChatAction("typing").catch(() => {});
    typingInterval = setInterval(() => {
      ctx.sendChatAction("typing").catch(() => {});
    }, 4000);

    let imagePart = null;
    if (hasPhoto) {
      const photo = ctx.message.photo.pop();
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

    const systemInstruction = `Ты профессиональный AI-автор и преподаватель. Текущая дата: ${currentDate}. Пользователь находится в Казани. 
Никогда не путай месяцы и время. Пиши глубокие статьи, используя заголовки, списки и таблицы (Markdown), которые преобразуются в нативные блоки. 
ВАЖНО ПО ФОРМАТИРОВАНИЮ:
- Математические выражения оформляй как $...$ внутри строки или $$...$$ отдельным блоком. 
- Не используй \\lvert / \\rvert, для модуля пиши \\left|...\\right|. 
- Не помещай формулы с модулем в таблицы — выноси их отдельным блоком.
- Если приложено фото, внимательно изучи его и дай подробный ответ.`;

    const parts = [
      {
        text: `${systemInstruction}\n\nЗапрос: ${prompt || "Опиши, что на фото, и реши задачу, если она там есть."}`,
      },
    ];
    if (imagePart) parts.push(imagePart);

    // Вызываем Gemini через функцию с автоповторами
    const data = await fetchGeminiWithRetry(
      apiKey,
      { contents: [{ parts }] },
      3,
    );

    const replyText =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "(пустой ответ)";
    const telegramToken = process.env.TELEGRAM_TOKEN;
    const chatId = ctx.chat.id;
    const messageId = ctx.message.message_id;

    const richRes = await fetch(
      `https://api.telegram.org/bot${telegramToken}/sendRichMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          reply_parameters: { message_id: messageId },
          rich_message: { markdown: replyText },
        }),
      },
    );

    const richData = await richRes.json();

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
          .catch(() => ctx.reply(chunk));
      }
    }
  } catch (error) {
    console.error("API Error:", error);
    if (
      error.message.includes("high demand") ||
      error.message.includes("overloaded")
    ) {
      await ctx.reply(
        "⚠️ Серверы Gemini сейчас сильно перегружены. Попробуй повторить через полминуты.",
      );
    } else {
      await ctx.reply(`❌ Ошибка: ${error.message}`);
    }
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
