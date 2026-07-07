// api/_supabase.js
// 后端共享的 Supabase 客户端（使用 SERVICE ROLE KEY，绕过 RLS）
// 仅在 Vercel Serverless Functions 中使用，不会暴露给前端

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 环境变量");
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey);