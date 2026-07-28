# LUMIÈRE｜你的光泽日程

一个轻奢极简风的美妆日程管理工具，将个人产品库、护理方案、日历行程、每日打卡和产品推荐连接在一起。

## 功能

- 管理个人美妆产品、库存状态和开封期限
- 创建早晚护理方案并按日期重复
- 在月历中新增、编辑和删除行程
- 根据当天行程与皮肤状态推荐已有产品
- 完成、跳过和记录每日护理感受
- 使用文字或语音与美妆日程助手对话，助手基于 RAG（护肤知识库检索 + 用户个人数据 + 大模型）生成回复，接口异常时自动降级为规则问答
- 使用浏览器本地存储保存个人数据

## 本地运行（纯前端）

Windows 上直接运行 `npm run dev`（`vinext dev`）依赖 Cloudflare Workers 本地运行时，在部分 Windows 环境下会崩溃。建议使用纯前端 Vite 开发服务器：

```bash
npm install
npx vite --config vite.pages.config.ts
```

## 智能助手后端（RAG API）

助手对话通过 `api/assistant-chat.ts`（Vercel Serverless Function）调用大模型生成回复，本地测试需要先配置环境变量：

```bash
cp .env.example .env.local
# 编辑 .env.local，填入 ARK_API_KEY
```

环境变量说明：

| 变量 | 说明 |
| --- | --- |
| `ARK_API_KEY` | 火山方舟（Volcengine Ark）API Key，必填 |
| `ARK_BASE_URL` | API 地址，默认 `https://ark.cn-beijing.volces.com/api/v3` |
| `ARK_MODEL` | 模型名称，默认 `glm-5-2-260617` |

可以用以下脚本快速验证接口逻辑（无需启动完整开发服务器）：

```bash
npx tsx api/_lib/local-test.ts
```

该功能仅在部署到 Vercel（支持 Serverless Function）时可用；纯静态的 GitHub Pages 部署没有对应后端，助手会自动降级为本地规则问答。

## 构建 GitHub Pages

```bash
npm run build:pages
```

推送到 `main` 分支后，GitHub Actions 会自动构建并部署到 GitHub Pages。

## 部署到 Vercel

```bash
npx vercel --prod
```

部署前需要在 Vercel 项目设置中配置好上述环境变量（`ARK_API_KEY` / `ARK_BASE_URL` / `ARK_MODEL`），也可以用 CLI 添加：

```bash
npx vercel env add ARK_API_KEY production
```
