// api/auth.js
// 认证相关 API：注册、登录、游客登录、验证会话
// 所有密码操作在服务端完成，前端不直接接触 Supabase

import { supabase } from "./_supabase.js";

// 会话验证：检查 user_id 是否存在于 users 表
async function verifySession(session) {
  if (!session || !session.userId) {
    return null;
  }
  const { data } = await supabase
    .from("users")
    .select("id, username, email, is_guest")
    .eq("id", session.userId)
    .maybeSingle();
  return data || null;
}

function parseSessionId(request) {
  // 从 Authorization header 或 cookie 中获取 session
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
  if (request.method !== "POST") {
    return response.status(405).json({ error: "仅支持 POST" });
  }

  const { action } = request.body || {};

  try {
    switch (action) {
      case "register": {
        const { username, email, password } = request.body;
        if (!username || !email || !password) {
          return response.status(400).json({ error: "用户名、邮箱和密码不能为空" });
        }
        // 调用数据库 RPC 函数
        const { data, error } = await supabase.rpc("register_user", {
          p_username: username,
          p_email: email,
          p_password: password
        });
        if (error) return response.status(400).json({ error: error.message });
        if (data.error) return response.status(400).json({ error: data.error });
        return response.status(200).json({ user: data.user });
      }

      case "login": {
        const { email, password } = request.body;
        if (!email || !password) {
          return response.status(400).json({ error: "邮箱和密码不能为空" });
        }
        const { data, error } = await supabase.rpc("login_user", {
          p_email: email,
          p_password: password
        });
        if (error) return response.status(400).json({ error: error.message });
        if (data.error) return response.status(401).json({ error: data.error });
        return response.status(200).json({ user: data.user });
      }

      case "guest": {
        const { data, error } = await supabase.rpc("create_guest_user");
        if (error) return response.status(400).json({ error: error.message });
        if (data.error) return response.status(400).json({ error: data.error });
        return response.status(200).json({ user: data.user });
      }

      case "verify": {
        const session = parseSessionId(request);
        const user = await verifySession(session);
        if (!user) {
          return response.status(200).json({ user: null });
        }
        return response.status(200).json({ user });
      }

      default:
        return response.status(400).json({ error: "未知操作：" + action });
    }
  } catch (err) {
    console.error("auth.js error:", err);
    return response.status(500).json({ error: "服务器错误" });
  }
}