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
    console.error("[foods.js] 缺少 session:", request.headers.authorization);
    return json(401, { error: "请先登录" });
  }

  const userId = session.userId;
  console.log("[foods.js] 用户操作:", request.method, "userId:", userId);

  try {
    switch (request.method) {
      case "GET": {
        const { data, error } = await getSupabase()
          .from("foods")
          .select("id, name, category, buy_date, shelf_life, note")
          .eq("user_id", userId)
          .order("created_at", { ascending: true });

        if (error) {
          console.error("[foods.js] GET 查询错误:", error);
          return json(500, { error: error.message });
        }

        const foods = (data || []).map((row) => ({
          id: row.id,
          name: row.name,
          category: row.category,
          buyDate: row.buy_date,
          shelfLife: row.shelf_life,
          note: row.note || ""
        }));

        console.log("[foods.js] GET 返回", foods.length, "条记录");
        return json(200, { foods });
      }

      case "POST": {
        const { foods } = request.body || [];
        if (!Array.isArray(foods)) {
          console.error("[foods.js] POST 参数错误:", typeof request.body);
          return json(400, { error: "foods 必须是数组" });
        }

        console.log("[foods.js] POST 保存", foods.length, "条记录");

        // 先删除该用户的所有旧数据
        const { error: deleteError } = await getSupabase()
          .from("foods")
          .delete()
          .eq("user_id", userId);

        if (deleteError) {
          console.error("[foods.js] 删除旧数据失败:", deleteError);
          return json(500, { error: "删除旧数据失败: " + deleteError.message });
        }

        if (foods.length === 0) {
          return json(200, { ok: true, deleted: true });
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

        console.log("[foods.js] 准备插入:", JSON.stringify(rows[0]), "等", rows.length, "条");

        const { error } = await getSupabase().from("foods").insert(rows);
        if (error) {
          console.error("[foods.js] 插入失败:", error);
          return json(500, { error: "插入失败: " + error.message });
        }

        console.log("[foods.js] 插入成功");
        return json(200, { ok: true });
      }

      case "DELETE": {
        const { error } = await getSupabase().from("foods").delete().eq("user_id", userId);
        if (error) {
          console.error("[foods.js] 删除失败:", error);
          return json(500, { error: error.message });
        }
        return json(200, { ok: true });
      }

      default:
        return json(405, { error: "不支持的请求方法" });
    }
  } catch (err) {
    console.error("[foods.js] 未捕获异常:", err);
    return json(500, { error: err.message || "服务器内部错误" });
  }
}