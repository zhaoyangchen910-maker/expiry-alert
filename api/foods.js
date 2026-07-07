// api/foods.js
// 食材 CRUD API：所有操作在服务端完成，通过 user_id 隔离数据
// 前端通过 Authorization header 传递 session 信息

import { supabase } from "./_supabase.js";

function parseSessionId(request) {
  const authHeader = request.headers.authorization || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/);
  if (match) {
    try {
      return JSON.parse(Buffer.from(match[1], "base64").toString());
    } catch {
      return null;
    }
  }
  return null;
}

export default async function handler(request, response) {
  // 所有请求都需要 session
  const session = parseSessionId(request);
  if (!session || !session.userId) {
    return response.status(401).json({ error: "请先登录" });
  }

  const userId = session.userId;

  try {
    switch (request.method) {
      case "GET": {
        // 获取当前用户的所有食材
        const { data, error } = await supabase
          .from("foods")
          .select("id, name, category, buy_date, shelf_life, note")
          .eq("user_id", userId)
          .order("created_at", { ascending: true });

        if (error) return response.status(500).json({ error: error.message });

        const foods = (data || []).map((row) => ({
          id: row.id,
          name: row.name,
          category: row.category,
          buyDate: row.buy_date,
          shelfLife: row.shelf_life,
          note: row.note || ""
        }));

        return response.status(200).json({ foods });
      }

      case "POST": {
        // 保存食材列表（全量替换）
        const { foods } = request.body || [];
        if (!Array.isArray(foods)) {
          return response.status(400).json({ error: "foods 必须是数组" });
        }

        // 删除当前用户所有食材
        await supabase.from("foods").delete().eq("user_id", userId);

        if (foods.length === 0) {
          return response.status(200).json({ ok: true });
        }

        const rows = foods.map((food) => ({
          id: food.id,
          user_id: userId,
          name: food.name,
          category: food.category,
          buy_date: food.buyDate,
          shelf_life: food.shelfLife,
          note: food.note || ""
        }));

        const { error } = await supabase.from("foods").insert(rows);
        if (error) return response.status(500).json({ error: error.message });

        return response.status(200).json({ ok: true });
      }

      case "DELETE": {
        // 删除当前用户所有食材
        await supabase.from("foods").delete().eq("user_id", userId);
        return response.status(200).json({ ok: true });
      }

      default:
        return response.status(405).json({ error: "不支持的请求方法" });
    }
  } catch (err) {
    console.error("foods.js error:", err);
    return response.status(500).json({ error: "服务器错误" });
  }
}