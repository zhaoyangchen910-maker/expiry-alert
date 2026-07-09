// api/foods.js
// 食材 CRUD API：所有操作在服务端完成，通过 user_id 隔离数据
// 前端通过 Authorization header 传递 session 信息

import { getSupabase } from "./_supabase.js";

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
  const json = (status, body) => response.status(status).json(body);

  const session = parseSessionId(request);
  if (!session || !session.userId) {
    return json(401, { error: "请先登录" });
  }

  const userId = session.userId;

  try {
    switch (request.method) {
      case "GET": {
        const { data, error } = await getSupabase()
          .from("foods")
          .select("id, name, category, buy_date, shelf_life, note")
          .eq("user_id", userId)
          .order("created_at", { ascending: true });

        if (error) return json(500, { error: error.message });

        const foods = (data || []).map((row) => ({
          id: row.id,
          name: row.name,
          category: row.category,
          buyDate: row.buy_date,
          shelfLife: row.shelf_life,
          note: row.note || ""
        }));

        return json(200, { foods });
      }

      case "POST": {
        const { foods } = request.body || [];
        if (!Array.isArray(foods)) {
          return json(400, { error: "foods 必须是数组" });
        }

        await getSupabase().from("foods").delete().eq("user_id", userId);

        if (foods.length === 0) {
          return json(200, { ok: true });
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

        const { error } = await getSupabase().from("foods").insert(rows);
        if (error) return json(500, { error: error.message });

        return json(200, { ok: true });
      }

      case "DELETE": {
        await getSupabase().from("foods").delete().eq("user_id", userId);
        return json(200, { ok: true });
      }

      default:
        return json(405, { error: "不支持的请求方法" });
    }
  } catch (err) {
    console.error("foods.js error:", err);
    return json(500, { error: err.message || "服务器内部错误" });
  }
}