// Vercel Serverless Function
// 调用 DeepSeek API 生成抢救菜谱
// 需要在 Vercel 环境变量中设置 DEEPSEEK_API_KEY

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "仅支持 POST" });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return response.status(200).json({
      error: "no_api_key",
      message: "DeepSeek API Key 未配置。请在 Vercel 环境变量中设置 DEEPSEEK_API_KEY。"
    });
  }

  try {
    const { ingredients } = request.body;
    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return response.status(200).json({
        error: "no_ingredients",
        fallback: true
      });
    }

    const foodList = ingredients
      .map((f) => {
        const dayText = f.daysLeft <= 0
          ? `已过期 ${Math.abs(f.daysLeft)} 天`
          : `还剩 ${f.daysLeft} 天`;
        return `- ${f.name}（${f.category}，${dayText}）`;
      })
      .join("\n");

    const prompt = `你是一个创意菜谱助手。根据以下冰箱里快过期的食材，生成一道抢救菜谱。

规则：
1. 菜名要有趣但不离谱，让用户想试试
2. 步骤 3-6 步，真实可做，尽量用现有食材
3. 优先使用过期风险最高的食材
4. 只返回 JSON，不要多余文字

JSON 格式：
{"name":"菜名","steps":["步骤1","步骤2","步骤3"]}

食材：
${foodList}`;

    const deepseekRes = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages: [
          { role: "system", content: "你是一个创意菜谱助手，只返回 JSON。" },
          { role: "user", content: prompt }
        ],
        stream: false,
        temperature: 0.8,
        max_tokens: 1024
      })
    });

    if (!deepseekRes.ok) {
      return response.status(200).json({ error: "api_error", fallback: true });
    }

    const data = await deepseekRes.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return response.status(200).json({ error: "empty_response", fallback: true });
    }

    try {
      let clean = content.trim();
      if (clean.startsWith("```")) {
        clean = clean.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```$/, "").trim();
      }
      const recipe = JSON.parse(clean);
      if (!recipe.name || !Array.isArray(recipe.steps) || recipe.steps.length === 0) {
        throw new Error("invalid format");
      }
      return response.status(200).json({ recipe });
    } catch {
      return response.status(200).json({ error: "parse_failed", fallback: true, raw: content });
    }
  } catch (error) {
    console.error("Serverless Error:", error);
    return response.status(200).json({ error: "server_error", fallback: true });
  }
}