// Amy EngMate 词汇批改代理：浏览器 → Cloudflare Worker → MiMo。
// MiMo key 作为 Cloudflare secret（MIMO_API_KEY）保存，绝不进入代码仓库或前端。
// 接口与前端 gradeExam 完全对齐：入参 {items:[{id,term,expected,accepted,answer}]}，返回 {results:[{id,correct}]}。

const MIMO_ENDPOINT = "https://api.xiaomimimo.com/v1/chat/completions";
const MODEL = "mimo-v2.5-pro";
const BATCH_SIZE = 20;      // 单次最多判 20 题，避免输出过长被截断
const MAX_ITEMS = 200;       // 一份试卷上限保护

// 允许调用本代理的来源：GitHub Pages 线上站 + 本地开发。
const ALLOWED_ORIGINS = new Set([
  "https://dannyxiexie.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);

// 与本地实测一致的判分规则（已验证准确率 10/12，且只放水不杀对）。
const SYSTEM_PROMPT = `你是小学英语"英译中"词汇题的批改助手。判断学生的中文作答是否应视为正确。
规则：
- 只要语义与标准释义相符即算对，包括：近义、简写、口语化、多字少字、字序差异、量词或助词有无、举例的省略号差异。
- 只有完全无关或意思相反才算错。
- 小学生答题，拿不准时倾向判对（宽松）。
严格只输出 JSON，不要任何解释、理由或 markdown：
{"results":[{"id":"题目id","correct":true}]}`;

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://dannyxiexie.github.io";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-App-Key",
    "Access-Control-Max-Age": "86400"
  };
}

function json(data, status, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
  });
}

async function gradeBatch(items, key) {
  const user = "题目：\n" + JSON.stringify(items.map((x) => ({ id: x.id, term: x.term, standard: x.expected, student: x.answer })));
  const resp = await fetch(MIMO_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: user }
      ],
      temperature: 0.2,
      max_completion_tokens: 3000,
      stream: false
    })
  });
  if (!resp.ok) throw new Error("MiMo HTTP " + resp.status);
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || "";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed.results) ? parsed.results : [];
  } catch {
    return [];
  }
}

// 出题质检：判断每道例句选词题里，哪些选项填进空格"语法+语义都合理"。
// 合理选项 > 1 即视为歧义题，前端会跳过。用于避免"好几个词都填得通"的不严谨题目。
const CLOZE_SYSTEM = `你是英语"例句选词"出题质检员。对每道题，判断4个选项里哪些填进空格在语法和语义上都合理（可能成为正确答案）。
规则：只有填进去后句子语法正确、语义通顺、符合常理的才算合理；明显不通的不算。
严格只输出 JSON，不要解释或 markdown：
{"results":[{"index":0,"valid":[0,2]}]}`;

async function checkClozeBatch(items, key) {
  const user = "题目：\n" + JSON.stringify(items.map((x, i) => ({ index: x.index ?? i, prompt: x.prompt, choices: x.choices })));
  const resp = await fetch(MIMO_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: CLOZE_SYSTEM }, { role: "user", content: user }],
      temperature: 0.2,
      max_completion_tokens: 3000,
      stream: false
    })
  });
  if (!resp.ok) throw new Error("MiMo HTTP " + resp.status);
  const content = (await resp.json()).choices?.[0]?.message?.content || "";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try { const parsed = JSON.parse(match[0]); return Array.isArray(parsed.results) ? parsed.results : []; } catch { return []; }
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405, cors);

    // 可选共享密钥：挡公网随意调用。未设 APP_KEY 则不校验。
    if (env.APP_KEY) {
      const appKey = request.headers.get("x-app-key");
      if (appKey !== env.APP_KEY) return json({ error: "unauthorized" }, 401, cors);
    }

    let body;
    try { body = await request.json(); } catch { return json({ error: "invalid json" }, 400, cors); }

    // 例句选词出题质检：返回每道题里"语法+语义都合理"的选项下标，前端据此跳过歧义题。
    // AI 失败时该批返回空，前端会把没拿到结果的题当作非歧义保留，不影响出题。
    if (Array.isArray(body?.cloze)) {
      const clozeItems = body.cloze.filter((x) => x && x.prompt && Array.isArray(x.choices) && x.choices.length);
      if (!clozeItems.length) return json({ results: [] }, 200, cors);
      const key = env.MIMO_API_KEY;
      if (!key) return json({ error: "server misconfigured" }, 500, cors);
      const batches = [];
      for (let i = 0; i < clozeItems.length; i += BATCH_SIZE) batches.push(clozeItems.slice(i, i + BATCH_SIZE));
      const results = await Promise.all(batches.map((b) => checkClozeBatch(b, key).catch(() => [])));
      return json({ results: results.flat() }, 200, cors);
    }

    const items = Array.isArray(body?.items)
      ? body.items.filter((x) => x && x.id && x.term && x.expected != null && x.answer != null && String(x.answer).trim())
      : [];
    if (!items.length) return json({ results: [] }, 200, cors);
    if (items.length > MAX_ITEMS) return json({ error: "too many items" }, 400, cors);

    const key = env.MIMO_API_KEY;
    if (!key) return json({ error: "server misconfigured" }, 500, cors);

    // 分批并发，单批输出小、不会截断；任一批失败返回空，前端用本地判定兜底。
    const batches = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) batches.push(items.slice(i, i + BATCH_SIZE));
    try {
      const results = await Promise.all(batches.map((b) => gradeBatch(b, key).catch(() => [])));
      return json({ results: results.flat() }, 200, cors);
    } catch {
      return json({ results: [] }, 200, cors);
    }
  }
};
