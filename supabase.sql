-- 过期警报 · Supabase 数据库初始化脚本
-- 在 Supabase SQL Editor 中执行此脚本

-- Supabase 已经内置了 auth.users 表，用于存储所有用户信息（包括邮箱和游客）
-- 如果你需要存储额外的用户信息（如昵称、头像），可以创建 profiles 表进行扩展

-- 1. 用户扩展信息表（可选，如果你不需要存额外信息可以不创建）
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 行级安全策略
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 用户只能查看和修改自己的信息
CREATE POLICY "用户查看自己资料"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "用户插入自己资料"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "用户更新自己资料"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- 自动创建 profile 触发器：当新用户注册时自动创建一条记录
-- 同时支持邮箱用户和匿名游客
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  fallback_name TEXT;
BEGIN
  -- 匿名用户没有邮箱，用前缀 + 短 ID 作为唯一标识
  IF NEW.email IS NULL THEN
    fallback_name := '游客_' || substring(NEW.id::text, 1, 6);
  ELSE
    fallback_name := split_part(NEW.email, '@', 1);
  END IF;

  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', fallback_name)
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. 食材表
CREATE TABLE IF NOT EXISTS foods (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '其他',
  buy_date DATE NOT NULL,
  shelf_life INTEGER NOT NULL,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 行级安全策略
ALTER TABLE foods ENABLE ROW LEVEL SECURITY;

-- 用户只能看到自己的数据
CREATE POLICY "用户查看自己的食材"
  ON foods FOR SELECT
  USING (auth.uid() = user_id);

-- 用户可以插入自己的数据
CREATE POLICY "用户插入自己的食材"
  ON foods FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 用户只能更新自己的数据
CREATE POLICY "用户更新自己的食材"
  ON foods FOR UPDATE
  USING (auth.uid() = user_id);

-- 用户只能删除自己的数据
CREATE POLICY "用户删除自己的食材"
  ON foods FOR DELETE
  USING (auth.uid() = user_id);

-- 索引：按 user_id 查询加速
CREATE INDEX IF NOT EXISTS idx_foods_user_id ON foods (user_id);

-- 3. 允许匿名用户（游客模式）
-- 注意：需要在 Supabase Dashboard → Authentication → Settings 中
-- 开启 "Allow anonymous sign-ins"
-- 匿名用户的 auth.uid() 同样有效，RLS 策略会自动适配