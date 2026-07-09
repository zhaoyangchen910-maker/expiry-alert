// api/auth.js
// 认证相关 API：注册、登录、游客登录、验证会话
// 所有密码操作在服务端完成，前端不直接接触 Supabase

import { getSupabase } from "./_supabase.js";

// 会话验证：检查 user_id 是否存在于 users 表
async function verifySession(session) {
  if (!session || !session.userId) {
    return null;
  }
  const { data } = await getSupabase()
    .from("users")
    .select("id, username, email, is_guest")
    .eq("id", session.userId)
    .maybeSingle();
  return data || null;
}

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
  // 确保所有响应都是 JSON
  const json = (status, body) => response.status(status).json(body);

  if (request.method !== "POST") {
    return json(405, { error: "仅支持 POST" });
  }

  const { action } = request.body || {};

  try {
    switch (action) {
      case "register": {
        const { username, email, password } = request.body;
        if (!username || !email || !password) {
          return json(400, { error: "用户名、邮箱和密码不能为空" });
        }
        const { data, error } = await getSupabase().rpc("register_user", {
          p_username: username,
          p_email: email,
          p_password: password
        });
        if (error) return json(400, { error: error.message });
        if (data.error) return json(400, { error: data.error });
        return json(200, { user: data.user });
      }

      case "login": {
        const { email, password } = request.body;
        if (!email || !password) {
          return json(400, { error: "邮箱和密码不能为空" });
        }
        const { data, error } = await getSupabase().rpc("login_user", {
          p_email: email,
          p_password: password
        });
        if (error) return json(400, { error: error.message });
        if (data.error) return json(401, { error: data.error });
        return json(200, { user: data.user });
      }

      case "guest": {
        const { data, error } = await getSupabase().rpc("create_guest_user");
        if (error) return json(400, { error: error.message });
        if (data.error) return json(400, { error: data.error });
        return json(200, { user: data.user });
      }

      case "verify": {
        const session = parseSessionId(request);
        const user = await verifySession(session);
        return json(200, { user: user || null });
      }

      default:
        return json(400, { error: "未知操作：" + action });
    }
  } catch (err) {
    console.error("auth.js error:", err);
    return json(500, { error: err.message || "服务器内部错误" });
  }
}