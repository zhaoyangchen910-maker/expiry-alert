// ⚠️ 过期警报 · Supabase 配置
// 使用前必须在 https://supabase.com 创建项目，然后替换下面的 url 和 anonKey！
// 获取方式：Supabase Dashboard → Settings → API → Project URL 和 anon public key

const SUPABASE_CONFIG = {
  // 👇 替换为你的 Supabase 项目地址
  url: "https://YOUR_PROJECT.supabase.co",
  // 👇 替换为你的 anon 公钥（公开安全，配合 RLS 使用）
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvdXItcHJvamVjdCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjE5OTAwMDAwMDB9.EXAMPLE"
};

// 初始化 Supabase 客户端
const supabaseClient = supabase.createClient(
  SUPABASE_CONFIG.url,
  SUPABASE_CONFIG.anonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);