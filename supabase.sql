-- 过期警报 · Supabase 数据库初始化脚本
-- 在 Supabase SQL Editor 中执行此脚本

-- 1. 食材表
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

-- 2. 行级安全策略
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

-- 3. 索引：按 user_id 查询加速
CREATE INDEX IF NOT EXISTS idx_foods_user_id ON foods (user_id);

-- 4. 允许匿名用户（游客模式）
-- 注意：需要在 Supabase Dashboard → Authentication → Settings 中
-- 开启 "Allow anonymous sign-ins"
-- 匿名用户的 auth.uid() 同样有效，RLS 策略会自动适配