// api/translate-cantonese.js
// 调用 DeepSeek API 把普通话提醒翻译成地道粤语

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "仅支持 POST" });
  }

  if (!DEEPSEEK_API_KEY) {
    return response.status(200).json({
      error: "no_api_key",
      message: "DeepSeek API Key 未配置"
    });
  }

  const { text } = request.body || {};
  if (!text || typeof text !== "string") {
    return response.status(400).json({ error: "缺少 text 参数" });
  }

  try {
    const prompt = `将以下普通话翻译成地道嘅粤语口语，保留原本嘅幽默感同语气。只返回粤语文字，唔好解释。\n\n原文：${text}`;

    const deepseekRes = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages: [
          { role: "system", content: "你係一個粵語翻譯助手，專門將普通話翻譯成地道粵語口語。只返回粵語文字，唔好解釋。" },
          { role: "user", content: prompt }
        ],
        stream: false,
        temperature: 0.8,
        max_tokens: 256
      })
    });

    if (!deepseekRes.ok) {
      return response.status(200).json({ error: "api_error", fallback: text });
    }

    const data = await deepseekRes.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return response.status(200).json({ error: "empty_response", fallback: text });
    }

    // 清理可能的引号
    let cantonese = content;
    if (cantonese.startsWith("""") && cantonese.endsWith(""")) {
      cantonese = cantonese.slice(1, -1);
    }

    return response.status(200).json({ cantonese });
  } catch (err) {
    console.error("translate-cantonese error:", err);
    return response.status(200).json({ error: "server_error", fallback: text });
  }
}