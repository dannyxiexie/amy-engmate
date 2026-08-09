# Amy EngMate 词汇批改代理（Cloudflare Worker）

把前端"英译中"词汇作答转发给小米 MiMo 大模型批改，MiMo key 只存在 Cloudflare secret 里，不进仓库、不进前端。

## 一次部署

```bash
cd grading-worker
npx wrangler login                 # 浏览器授权一次
npx wrangler secret put MIMO_API_KEY   # 粘贴 MiMo key（sk-...），回车
npx wrangler deploy
```

部署成功后会输出地址，形如 `https://amy-engmate-grading.<子域>.workers.dev`。

## 接到前端

在网站项目根目录新建 `.env`（已被 .gitignore，不会提交）：

```
VITE_GRADING_API_URL=https://amy-engmate-grading.<子域>.workers.dev
```

然后 `npm run build` 并推送，线上即启用 AI 批改（`gradeExam` 已支持，无需改逻辑）。

## 可选加固

防止别人发现这个地址后白嫖你的 MiMo 额度：

```bash
npx wrangler secret put APP_KEY       # 设一个随机串，如 amy-xxxx
```

并在网站 `.env` 里加同样的值：

```
VITE_APP_KEY=amy-xxxx
```

设了之后前端会自动带 `X-App-Key` 请求头，Worker 校验通过才放行。
