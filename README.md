# 过期警报

《过期警报》是一款减少家庭食物浪费的趣味冰箱管家。用户可以手动录入食材和购买日期，网站会自动计算保质期倒计时，并根据临期食材生成一份"抢救菜谱"。

## 已完成功能

- 手动录入食材名称、分类、购买日期、保质期天数和备注
- 使用浏览器本地存储（未登录）或 Supabase 云端数据库（已登录）保存食材数据
- 自动计算到期日、剩余天数和临期状态
- 按保质期紧急程度排序食材
- 删除单个食材或清空冰箱
- 一键放入示例食材，方便演示
- 根据临期食材生成抢救菜谱（DeepSeek AI）
- 根据最紧急食材生成搞笑提醒
- 邮箱注册/登录 + 游客匿名登录
- 响应式页面，支持手机和电脑访问

## 项目结构

```text
.
├── index.html              # 网站入口
├── styles.css              # 页面样式
├── app.js                  # 交互逻辑
├── auth.js                 # 认证模块（登录/注册/游客）
├── data-service.js         # 数据抽象层（localStorage ↔ Supabase）
├── supabase-config.js      # Supabase 配置（需要你填写）
├── supabase.sql            # 数据库建表脚本
├── api/
│   └── generate-recipe.js  # Vercel Serverless Function（DeepSeek API）
├── vercel.json             # Vercel 部署配置
├── package.json            # 项目信息和本地预览命令
└── README.md
```

## 部署前必须配置

### 1. 创建 Supabase 项目

1. 打开 [supabase.com](https://supabase.com) 注册账号并创建一个新项目
2. 项目创建完成后，进入 Dashboard → **SQL Editor**
3. 打开 `supabase.sql` 文件，复制全部内容粘贴到 SQL Editor 中执行
4. 进入 **Authentication → Settings**，开启 "Allow anonymous sign-ins"（游客登录）
5. 进入 **Settings → API**，复制 **Project URL** 和 **anon public key**

### 2. 配置 supabase-config.js

打开 `supabase-config.js`，将第 8 行的 `YOUR_PROJECT.supabase.co` 替换为你的 Project URL，将第 10 行的 anonKey 替换为你的 anon public key。

### 3. 配置 DeepSeek API（可选）

在 Vercel 项目设置中，添加环境变量 `DEEPSEEK_API_KEY`。如果不配置，菜谱生成会使用本地兜底方案。

## 本地预览

如果已经安装 Node.js，可以运行：

```bash
npm start
```

也可以直接双击打开 `index.html` 预览（仅限未登录的 localStorage 模式）。

## 部署到 Vercel

1. 把项目上传到 GitHub 仓库。
2. 打开 Vercel，选择 `Add New Project`。
3. 导入这个 GitHub 仓库。
4. Framework Preset 选择 `Other`。
5. Build Command 留空。
6. Output Directory 留空或填写 `.`。
7. 点击 Deploy。
8. 部署后在 Vercel 项目设置中添加环境变量 `DEEPSEEK_API_KEY`（可选）。