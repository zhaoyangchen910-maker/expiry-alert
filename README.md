# 过期警报

《过期警报》是一款减少家庭食物浪费的趣味冰箱管家。用户可以手动录入食材和购买日期，网站会自动计算保质期倒计时，并根据临期食材生成一份"抢救菜谱"。

## 已完成功能

- **手动录入**食材名称、分类、购买日期、保质期天数和备注
- **拍照识别**：上传食品包装图片，AI 自动识别食物名称、分类、生产日期和保质期
- 使用浏览器本地存储（未登录）或 Supabase 云端数据库（已登录）保存食材数据
- 自动计算到期日、剩余天数和临期状态
- 按保质期紧急程度排序食材
- 删除单个食材或清空冰箱
- 一键放入示例食材，方便演示
- 根据临期食材生成抢救菜谱（DeepSeek AI）
- 根据最紧急食材生成搞笑提醒
- 邮箱注册/登录 + 游客匿名登录（自定义用户表，密码 bcrypt 哈希）
- 响应式页面，支持手机和电脑访问

## 安全架构

- **前端不直接连接数据库**：所有数据库操作通过 Vercel Serverless Functions（`/api/*`）完成
- **Supabase Key 不暴露给前端**：`SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 存在 Vercel 环境变量中，仅后端可访问
- **密码哈希在 PostgreSQL 端完成**：通过 `pgcrypto` 扩展的 bcrypt 算法，前端只传递明文密码到后端 API，数据库返回不含密码字段
- **会话管理**：登录成功后，后端返回用户信息，前端存入 localStorage，请求 API 时作为 Bearer Token 传递，后端验证 userId 是否存在
- **数据隔离**：每个食材绑定 `user_id`，API 层强制过滤，用户只能操作自己的数据

## 项目结构

```text
.
├── index.html              # 网站入口
├── styles.css              # 页面样式
├── app.js                  # 交互逻辑
├── auth.js                 # 认证模块（调 /api/auth）
├── data-service.js         # 数据抽象层（localStorage ↔ /api/foods）
├── supabase.sql            # 数据库建表脚本 + RPC 函数
├── api/
│   ├── _supabase.js        # 后端共享 Supabase 客户端
│   ├── auth.js             # 认证 API（注册/登录/游客/验证）
│   ├── foods.js            # 食材 CRUD API
│   ├── generate-recipe.js  # 菜谱生成 API（DeepSeek）
│   └── recognize-food.js   # 图片识别 API（DeepSeek / OpenAI 视觉模型）
├── vercel.json             # Vercel 部署配置
├── package.json            # 项目信息和本地预览命令
└── README.md
```

## 部署前必须配置

### 1. 创建 Supabase 项目

1. 打开 [supabase.com](https://supabase.com) 注册账号并创建一个新项目
2. 项目创建完成后，进入 Dashboard → **SQL Editor**
3. 打开 `supabase.sql` 文件，复制全部内容粘贴到 SQL Editor 中执行
   - 这会创建 `users` 表、`foods` 表，以及 `register_user`、`login_user`、`create_guest_user` 三个 RPC 函数
4. 进入 **Settings → API**，复制 **Project URL** 和 **service_role key**（注意不是 anon key）

### 2. 配置 Vercel 环境变量

在 Vercel 项目设置 → **Environment Variables** 中添加：

| 变量名 | 值 | 说明 |
|---|---|---|
| `SUPABASE_URL` | `https://xxx.supabase.co` | Supabase 项目地址 |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Supabase service_role key（具有管理员权限，不要泄露） |
| `DEEPSEEK_API_KEY` | `sk-...` | DeepSeek API Key（用于菜谱生成；如 DeepSeek 支持图片识别，也可用于拍照识别） |
| `OPENAI_API_KEY` | `sk-...` | OpenAI API Key（可选，用于图片识别。如果 DeepSeek 不支持图片，设置此变量并配置 VISION_API_PROVIDER=openai） |
| `VISION_API_PROVIDER` | `deepseek` 或 `openai` | 图片识别使用的 AI 提供商，默认 deepseek |

### 3. 部署

1. 把项目上传到 GitHub 仓库
2. 打开 Vercel → **Add New Project** → 导入 GitHub 仓库
3. Framework Preset 选择 `Other`
4. Build Command 留空，Output Directory 留空或 `.`
5. 先在 Vercel 设置中添加上述环境变量
6. 点击 Deploy

## 本地预览

如果已经安装 Node.js，可以运行：

```bash
npm start
```

也可以直接双击打开 `index.html` 预览（仅限未登录的 localStorage 模式，API 功能需要部署到 Vercel 后使用）。