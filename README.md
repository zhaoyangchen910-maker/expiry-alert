# 过期警报

《过期警报》是一款减少家庭食物浪费的趣味冰箱管家。用户可以手动录入食材和购买日期，网站会自动计算保质期倒计时，并根据临期食材生成一份“抢救菜谱”。

## 已完成功能

- 手动录入食材名称、分类、购买日期、保质期天数和备注
- 使用浏览器本地存储保存食材数据
- 自动计算到期日、剩余天数和临期状态
- 按保质期紧急程度排序食材
- 删除单个食材或清空冰箱
- 一键放入示例食材，方便演示
- 根据临期食材生成抢救菜谱
- 根据最紧急食材生成搞笑提醒
- 响应式页面，支持手机和电脑访问

## 项目结构

```text
.
├── index.html      # 网站入口
├── styles.css      # 页面样式
├── app.js          # 交互逻辑
├── vercel.json     # Vercel 静态部署配置
├── package.json    # 项目信息和本地预览命令
└── README.md
```

## 本地预览

如果已经安装 Node.js，可以运行：

```bash
npm start
```

也可以直接双击打开 `index.html` 预览。

## 部署到 Vercel

1. 把项目上传到 GitHub 仓库。
2. 打开 Vercel，选择 `Add New Project`。
3. 导入这个 GitHub 仓库。
4. Framework Preset 选择 `Other`。
5. Build Command 留空。
6. Output Directory 留空或填写 `.`。
7. 点击 Deploy。

部署完成后，Vercel 会生成一个可公开访问的网址。
