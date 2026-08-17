// Amy EngMate grading proxy: browser -> Cloudflare Worker -> Xiaomi MiMo.
// Secrets stay in Cloudflare. Structured logs never include terms or student answers.

const MIMO_ENDPOINT = "https://api.xiaomimimo.com/v1/chat/completions";
const MODEL = "mimo-v2.5-pro";
const MAX_CLOZE_ITEMS = 200;
const CLOZE_BATCH_SIZE = 20;

const ALLOWED_ORIGINS = new Set([
  "https://dannyxiexie.github.io",
  "https://dannyxiexie.tech",
  "https://www.dannyxiexie.tech",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);

const SYSTEM_PROMPT = `你是小学英语“英译中”考试批改员。你每次只批改一道题。

判断目标：从英文原词或短语出发，独立判断学生中文是否是一种合理译法。standard 只是学习资料中的参考，不是唯一答案；不要先比较两段中文像不像，也不要要求学生逐字复刻参考答案。

必须判对：
1. 自然的中文同义表达、口语表达、语序变化、合理省略虚词。
2. 中文数字与阿拉伯数字混用，例如 seven→7、fifth→第5、October→10月。
3. 不影响含义的标点、空格、省略号、大小写差异。
4. 人称代词在脱离语境时的合理差异，例如 them→他们/她们/它们。
5. 家长确认过的 accepted 列表：学生答案只要与其中任一项语义相同，必须判对。
6. 自然的祝愿或意译，例如 enjoy yourself→玩得开心/祝你玩得好。
7. 英文在小学课堂语境中允许常见的相邻义项，例如 ideas→想法/主意/建议，over there→在那里/在那边。
8. 固定结构只要核心关系完整即可，例如 help somebody do something→帮助一个人去干某件事情/帮助某人做某事。

应该判错：核心动作、对象、方向、否定、时态或比较程度错误；只答了过于宽泛的上位词；写了彼此矛盾的多个猜测。

示例：
- try to feed：尝试去喂养 = 尝试喂养，判对。
- spend the day resting：休息一天 = 用一天休息，判对。
- list the ideas：列出建议 = 列出想法，判对。
- take a truck tour：坐卡车浏览 = 乘卡车游览，判对。
- all of them：他们的全部 = 它们全部，判对。
- we'll try this：将要尝试这个 = 会尝试/实施这个，判对。

只输出 JSON，不要解释或 markdown：
{"results":[{"id":"题目id","correct":true}]}`;

const CLOZE_SYSTEM = `你是英语“例句选词”出题质检员。对每道题：
1. 判断选项里哪些填进空格后语法正确且语义通顺（valid，返回选项下标）。
2. 判断正确答案填入后是否语法正确且语义通顺（answer_ok）。
严格只输出 JSON，不要解释或 markdown：
{"results":[{"index":0,"valid":[0,2],"answer_ok":true}]}`;

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://dannyxiexie.github.io";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-App-Key, X-Upload-Code",
    "Access-Control-Expose-Headers": "X-Grading-Request-Id",
    "Access-Control-Max-Age": "86400"
  };
}

function json(data, status, headers = {}, requestId = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(requestId ? { "X-Grading-Request-Id": requestId } : {}),
      ...headers
    }
  });
}

function log(event, fields = {}) {
  console.log({ service: "amy-engmate-grading", event, ...fields });
}

function errorMessage(reason) {
  return reason instanceof Error ? reason.message.slice(0, 180) : "unknown error";
}

function parseJsonObject(content) {
  const match = String(content || "").match(/\{[\s\S]*\}/);
  if (!match) throw new Error("MiMo response did not contain JSON");
  return JSON.parse(match[0]);
}

async function callMimo(messages, key, maxCompletionTokens) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(MIMO_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        messages,
        thinking: { type: "disabled" },
        temperature: 0.1,
        max_completion_tokens: maxCompletionTokens,
        stream: false
      })
    });
    if (!response.ok) throw new Error(`MiMo HTTP ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (reason) {
    if (reason?.name === "AbortError") throw new Error("MiMo request timed out");
    throw reason;
  } finally {
    clearTimeout(timeout);
  }
}

async function gradeOne(item, key) {
  const user = "题目：\n" + JSON.stringify({
    id: item.id,
    term: item.term,
    standard: item.expected,
    accepted: Array.isArray(item.accepted) ? item.accepted : [],
    student: item.answer
  });
  const content = await callMimo([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: user }
  ], key, 1000);
  const parsed = parseJsonObject(content);
  const result = Array.isArray(parsed.results) ? parsed.results[0] : null;
  if (parsed.results?.length !== 1 || result?.id !== item.id || typeof result.correct !== "boolean") {
    throw new Error("MiMo returned an incomplete grading result");
  }
  return { id: item.id, correct: result.correct };
}

async function checkClozeBatch(items, key) {
  const user = "题目：\n" + JSON.stringify(items.map((item, index) => ({
    index: item.index ?? index,
    prompt: item.prompt,
    choices: item.choices,
    answer: item.answer
  })));
  const content = await callMimo([
    { role: "system", content: CLOZE_SYSTEM },
    { role: "user", content: user }
  ], key, 3000);
  const parsed = parseJsonObject(content);
  return Array.isArray(parsed.results) ? parsed.results : [];
}

async function handleCloze(body, key, requestId, cors) {
  const items = body.cloze.filter((item) => item && item.prompt && Array.isArray(item.choices) && item.choices.length);
  if (!items.length) return json({ requestId, results: [] }, 200, cors, requestId);
  if (items.length > MAX_CLOZE_ITEMS) return json({ error: "too many items", requestId }, 400, cors, requestId);
  const batches = [];
  for (let index = 0; index < items.length; index += CLOZE_BATCH_SIZE) {
    batches.push(items.slice(index, index + CLOZE_BATCH_SIZE));
  }
  try {
    const results = await Promise.all(batches.map((batch) => checkClozeBatch(batch, key)));
    log("cloze_check_succeeded", { requestId, model: MODEL, itemCount: items.length });
    return json({ requestId, provider: "xiaomi-mimo", model: MODEL, results: results.flat() }, 200, cors, requestId);
  } catch (reason) {
    console.error({ service: "amy-engmate-grading", event: "cloze_check_failed", requestId, model: MODEL, itemCount: items.length, error: errorMessage(reason) });
    return json({ error: "cloze check unavailable", requestId }, 502, cors, requestId);
  }
}

export default {
  async fetch(request, env) {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    const cors = corsHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "method not allowed", requestId }, 405, cors, requestId);

    if (env.APP_KEY && request.headers.get("x-app-key") !== env.APP_KEY) {
      log("request_rejected", { requestId, reason: "unauthorized" });
      return json({ error: "unauthorized", requestId }, 401, cors, requestId);
    }
    if (!env.MIMO_API_KEY) {
      console.error({ service: "amy-engmate-grading", event: "configuration_error", requestId, error: "MIMO_API_KEY missing" });
      return json({ error: "server misconfigured", requestId }, 500, cors, requestId);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      log("request_rejected", { requestId, reason: "invalid_json" });
      return json({ error: "invalid json", requestId }, 400, cors, requestId);
    }

    if (Array.isArray(body?.cloze)) return handleCloze(body, env.MIMO_API_KEY, requestId, cors);

    const items = Array.isArray(body?.items)
      ? body.items.filter((item) => item && item.id && item.term && item.expected != null && item.answer != null && String(item.answer).trim())
      : [];
    if (items.length !== 1) {
      log("request_rejected", { requestId, reason: "grading_requires_exactly_one_item", itemCount: items.length });
      return json({ error: "grading requires exactly one item", requestId }, 400, cors, requestId);
    }

    log("grading_started", { requestId, model: MODEL, itemCount: 1 });
    try {
      const result = await gradeOne(items[0], env.MIMO_API_KEY);
      const gradedAt = new Date().toISOString();
      log("grading_succeeded", { requestId, model: MODEL, itemCount: 1, durationMs: Date.now() - startedAt });
      return json({ requestId, provider: "xiaomi-mimo", model: MODEL, gradedAt, results: [result] }, 200, cors, requestId);
    } catch (reason) {
      console.error({ service: "amy-engmate-grading", event: "grading_failed", requestId, model: MODEL, itemCount: 1, durationMs: Date.now() - startedAt, error: errorMessage(reason) });
      return json({ error: "AI grading unavailable", requestId }, 502, cors, requestId);
    }
  }
};
