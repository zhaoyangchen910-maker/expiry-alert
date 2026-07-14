// Vercel Serverless Function
// 调用多模态 AI API 识别图片中的食物和保质期信息
// 支持 Agnes-AI、SiliconFlow(Qwen-VL)、OpenAI(GPT-4o)、DeepSeek 四种 provider
// 通过 VISION_API_PROVIDER 环境变量切换

const VALID_CATEGORIES = ["乳制品", "蔬菜", "水果", "蛋类", "主食", "肉类", "其他"];

// provider 配置
const PROVIDER_CONFIG = {
  agnes: {
    name: "Agnes-AI",
    baseUrl: "https://api-hub.agnes-ai.com/v1/chat/completions",
    model: "agnes-2.0-flash",
    envKey: "AGNES_API_KEY",
    detail: undefined
  },
  siliconflow: {
    name: "SiliconFlow",
    baseUrl: "https://api.siliconflow.cn/v1/chat/completions",
    model: "Qwen/Qwen2.5-VL-72B-Instruct",
    envKey: "SILICONFLOW_API_KEY",
    detail: undefined
  },
  openai: {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o",
    envKey: "OPENAI_API_KEY",
    detail: "high"
  },
  deepseek: {
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/chat/completions",
    model: "deepseek-v4-flash",
    envKey: "DEEPSEEK_API_KEY",
    detail: undefined
  }
};

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "仅支持 POST" });
  }

  const { image } = request.body || {};
  if (!image) {
    return response.status(400).json({ error: "缺少图片数据" });
  }

  // 提取 base64 数据（支持 data:image/jpeg;base64,xxx 和纯 base64 两种格式）
  let base64Image = image;
  if (image.startsWith("data:")) {
    base64Image = image.split(",")[1];
  }

  if (!base64Image || base64Image.length < 100) {
    return response.status(400).json({ error: "图片数据无效" });
  }

  // 选择 AI 提供商（默认 agnes，免费全模态）
  const providerKey = (process.env.VISION_API_PROVIDER || "agnes").toLowerCase();
  const config = PROVIDER_CONFIG[providerKey] || PROVIDER_CONFIG.agnes;
  const apiKey = process.env[config.envKey];

  if (!apiKey) {
    return response.status(200).json({
      error: "no_api_key",
      message: `未配置 ${config.envKey} 环境变量。请在 Vercel 项目设置中添加对应的 API Key。`
    });
  }

  const prompt = `请仔细识别这张图片中的食品包装或食材，提取以下信息：

1. 食品名称（尽可能准确）
2. 食品分类：乳制品、蔬菜、水果、蛋类、主食、肉类、其他
3. 生产日期/购买日期（如果图片中有，转换为 YYYY-MM-DD 格式；如果没有，使用今天日期）
4. 保质期天数（如果包装上有明确保质期，计算从生产日期到过期日的天数；如果没有，根据食品类型给出合理默认值）
5. 备注（任何有用的额外信息，如"开封后需冷藏"、"净含量"等）

重要规则：
- 如果图片中没有食品或食品包装，请返回 {"error": "no_food_detected", "message": "未能识别到食品"}
- 保质期天数必须是正整数
- 日期必须是 YYYY-MM-DD 格式
- 分类必须是上面列出的七种之一

请只返回 JSON 格式，不要任何其他文字：
{
  "name": "食品名称",
  "category": "分类",
  "buyDate": "2024-01-15",
  "shelfLife": 7,
  "note": "备注信息",
  "confidence": 0.95
}`;

  try {
    const result = await callVisionApi(config, apiKey, base64Image, prompt);

    if (result.error) {
      return response.status(200).json(result);
    }

    return response.status(200).json(result);
  } catch (error) {
    console.error("[recognize-food] 识别错误:", error);
    return response.status(200).json({
      error: "recognition_failed",
      message: error.message || "识别过程出错"
    });
  }
}

async function callVisionApi(config, apiKey, base64Image, prompt) {
  const imageContent = {
    type: "image_url",
    image_url: {
      url: `data:image/jpeg;base64,${base64Image}`
    }
  };

  // OpenAI 支持 detail 参数，其他 provider 不支持
  if (config.detail) {
    imageContent.image_url.detail = config.detail;
  }

  const res = await fetch(config.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            imageContent
          ]
        }
      ],
      max_tokens: 1024,
      temperature: 0.2
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    const lowerErr = errText.toLowerCase();

    // DeepSeek 返回图片相关错误时的特殊处理
    if (config.name === "DeepSeek" && (
      lowerErr.includes("image") ||
      lowerErr.includes("multimodal") ||
      lowerErr.includes("vision") ||
      lowerErr.includes("unsupported")
    )) {
      return {
        error: "deepseek_no_vision",
        message: "当前 DeepSeek 模型不支持图片识别。推荐方案：\n1. 注册 Agnes-AI，获取免费 API Key，设置 AGNES_API_KEY 和 VISION_API_PROVIDER=agnes\n2. 或使用 SiliconFlow，设置 SILICONFLOW_API_KEY 和 VISION_API_PROVIDER=siliconflow\n3. 或使用 OpenAI，设置 OPENAI_API_KEY 和 VISION_API_PROVIDER=openai",
        fallback: true
      };
    }

    throw new Error(`${config.name} API 错误: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(`${config.name} 返回空内容`);
  }

  return parseVisionResponse(content);
}

function parseVisionResponse(content) {
  try {
    let clean = content.trim();
    // 去除 markdown 代码块
    if (clean.startsWith("```")) {
      clean = clean.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```$/, "").trim();
    }

    const result = JSON.parse(clean);

    // 如果 AI 返回错误
    if (result.error) {
      return {
        error: result.error,
        message: result.message || "识别失败"
      };
    }

    // 验证必要字段
    if (!result.name || typeof result.name !== "string") {
      return { error: "parse_failed", message: "未能识别出食品名称" };
    }

    // 规范化分类
    if (!VALID_CATEGORIES.includes(result.category)) {
      // 尝试智能匹配
      const categoryMap = {
        "奶": "乳制品", "乳": "乳制品", "牛奶": "乳制品", "酸奶": "乳制品", "奶酪": "乳制品",
        "菜": "蔬菜", "蔬": "蔬菜", "青菜": "蔬菜", "白菜": "蔬菜", "西红柿": "蔬菜",
        "果": "水果", "苹果": "水果", "香蕉": "水果", "橙": "水果", "橘": "水果",
        "蛋": "蛋类", "鸡蛋": "蛋类", "鸭蛋": "蛋类",
        "面": "主食", "米": "主食", "饭": "主食", "面包": "主食", "馒头": "主食", "包子": "主食",
        "肉": "肉类", "猪": "肉类", "牛": "肉类", "羊": "肉类", "鸡": "肉类", "鸭": "肉类", "鱼": "肉类"
      };
      let matched = false;
      for (const [key, value] of Object.entries(categoryMap)) {
        if (result.name.includes(key) || (result.category && result.category.includes(key))) {
          result.category = value;
          matched = true;
          break;
        }
      }
      if (!matched) {
        result.category = "其他";
      }
    }

    // 验证日期格式
    if (!result.buyDate || !/^\d{4}-\d{2}-\d{2}$/.test(result.buyDate)) {
      const today = new Date();
      result.buyDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    }

    // 验证保质期
    const shelfLife = Number(result.shelfLife);
    if (!Number.isFinite(shelfLife) || shelfLife < 1) {
      result.shelfLife = 7;
    } else {
      result.shelfLife = Math.round(shelfLife);
    }

    // 确保 note 是字符串
    if (!result.note) {
      result.note = "";
    }

    // 确保 confidence 是数字
    if (!Number.isFinite(result.confidence)) {
      result.confidence = 0.8;
    }

    return result;
  } catch (err) {
    return {
      error: "parse_failed",
      message: "解析 AI 返回结果失败",
      raw: content
    };
  }
}
