# Amy EngMate 词汇批改代理（Cloudflare Worker）

把前端“英译中”词汇作答每 10 题一批转发给小米 MiMo 大模型批改，MiMo key 只存在 Cloudflare secret 里，不进仓库、不进前端。接口强制每批最多接收 10 题；一批失败后最多追加 5 次重试，再失败会保留此前批次的进度并等待用户继续。

同一个 Worker 还代理 GitHub 数据读写。GitHub 凭证只保存在 `GITHUB_TOKEN` secret 中；代理只允许访问考试、奖励、作业、作业图片和接受答案所需的固定接口，拒绝修改应用代码。前端不再要求每台设备填写上传代码，后台日志会记录设备编号、目标路径和 GitHub 返回状态。

批改不使用本地判分兜底。每次请求都会生成 `requestId`，并在 Cloudflare Workers Logs 中写入结构化的开始、成功或失败日志；日志只含请求编号、模型、耗时和题目数量，不含单词、参考答案或学生答案。

## 一次部署

```bash
cd grading-worker
npx wrangler login                 # 浏览器授权一次
npx wrangler secret put MIMO_API_KEY   # 粘贴 MiMo key（sk-...），回车
npx wrangler secret put GITHUB_TOKEN   # GitHub 仓库写入凭证，只保存到 Worker secret
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
