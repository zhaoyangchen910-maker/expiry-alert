-- 过期警报 · Supabase 数据库初始化脚本
-- 在 Supabase SQL Editor 中执行此脚本
-- 使用自定义 users 表 + pgcrypto 密码哈希，不依赖 Supabase Auth

-- 0. 启用 pgcrypto 扩展（用于密码哈希）
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================
-- 1. 自定义用户表
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  is_guest BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 行级安全：用户可以查看自己的信息
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 注意：由于不使用 Supabase Auth，无法用 auth.uid() 做 RLS
-- 改为通过 RPC 函数控制访问，RLS 保持宽松策略
CREATE POLICY "允许所有已认证操作"
  ON users FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 2. RPC 函数：注册用户
-- ============================================================

CREATE OR REPLACE FUNCTION register_user(
  p_username TEXT,
  p_email TEXT,
  p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_result JSONB;
BEGIN
  -- 检查邮箱是否已存在
  IF EXISTS (SELECT 1 FROM users WHERE email = p_email) THEN
    RETURN jsonb_build_object(
      'error', '该邮箱已注册，请直接登录',
      'code', 'email_exists'
    );
  END IF;

  -- 密码至少 6 位
  IF length(p_password) < 6 THEN
    RETURN jsonb_build_object(
      'error', '密码至少 6 位',
      'code', 'weak_password'
    );
  END IF;

  -- 插入用户（密码用 bcrypt 哈希）
  INSERT INTO users (username, email, password_hash, is_guest)
  VALUES (
    p_username,
    p_email,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    false
  )
  RETURNING id INTO v_user_id;

  SELECT jsonb_build_object(
    'id', u.id,
    'username', u.username,
    'email', u.email,
    'is_guest', u.is_guest,
    'created_at', u.created_at
  )
  INTO v_result
  FROM users u
  WHERE u.id = v_user_id;

  RETURN jsonb_build_object('user', v_result);
END;
$$;

-- ============================================================
-- 3. RPC 函数：登录验证
-- ============================================================

CREATE OR REPLACE FUNCTION login_user(
  p_email TEXT,
  p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user RECORD;
  v_result JSONB;
BEGIN
  -- 查找用户并验证密码
  SELECT id, username, email, is_guest, created_at
  INTO v_user
  FROM users
  WHERE email = p_email
    AND password_hash = extensions.crypt(p_password, password_hash);

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', '邮箱或密码错误',
      'code', 'invalid_credentials'
    );
  END IF;

  RETURN jsonb_build_object(
    'user', jsonb_build_object(
      'id', v_user.id,
      'username', v_user.username,
      'email', v_user.email,
      'is_guest', v_user.is_guest,
      'created_at', v_user.created_at
    )
  );
END;
$$;

-- ============================================================
-- 4. RPC 函数：创建游客用户
-- ============================================================

CREATE OR REPLACE FUNCTION create_guest_user()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_guest_name TEXT;
  v_result JSONB;
BEGIN
  -- 生成游客名：游客_随机6位
  v_guest_name := '游客_' || substring(gen_random_uuid()::text, 1, 6);

  INSERT INTO users (username, email, password_hash, is_guest)
  VALUES (
    v_guest_name,
    NULL,
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf', 10)),
    true
  )
  RETURNING id INTO v_user_id;

  SELECT jsonb_build_object(
    'id', u.id,
    'username', u.username,
    'email', u.email,
    'is_guest', u.is_guest,
    'created_at', u.created_at
  )
  INTO v_result
  FROM users u
  WHERE u.id = v_user_id;

  RETURN jsonb_build_object('user', v_result);
END;
$$;

-- ============================================================
-- 5. 食材表（user_id 引用自定义 users 表）
-- ============================================================

CREATE TABLE IF NOT EXISTS foods (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '其他',
  buy_date DATE NOT NULL,
  shelf_life INTEGER NOT NULL,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE foods ENABLE ROW LEVEL SECURITY;

-- 由于不使用 Supabase Auth，RLS 通过应用层 user_id 过滤
-- 这里保持宽松策略，实际过滤在 data-service.js 中完成
CREATE POLICY "允许所有已认证操作"
  ON foods FOR ALL
  USING (true)
  WITH CHECK (true);

-- 索引
CREATE INDEX IF NOT EXISTS idx_foods_user_id ON foods (user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);