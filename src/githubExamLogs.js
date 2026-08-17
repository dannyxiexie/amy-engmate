const BRANCH = "main";
const LOG_DIRECTORY = "exam-logs";
const REWARD_DIRECTORY = "reward-logs";
const RULES_DIRECTORY = "grading-rules";
const ACCEPTED_ANSWERS_FILE = "accepted-answers.json";
const WRITE_PROXY_ROOT = String(import.meta.env.VITE_GITHUB_WRITE_PROXY_URL || "https://grade.dannyxiexie.tech/github").replace(/\/$/, "");
const DEVICE_ID_KEY = "amy-engmate:device-id:v1";

function requestHeaders(accept = "application/vnd.github+json") {
  return {
    Accept: accept
  };
}

function deviceId() {
  let value = window.localStorage.getItem(DEVICE_ID_KEY) || "";
  if (!value) {
    value = globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(DEVICE_ID_KEY, value);
  }
  return value;
}

function encodeBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

function decodeBase64(value) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function recordFileName(record, dateField = "completedAt") {
  const date = String(record[dateField] || new Date().toISOString()).slice(0, 10);
  const safeId = String(record.id || Date.now()).replace(/[^a-zA-Z0-9_-]/g, "");
  return `${date}-${safeId}.json`;
}

async function githubRequest(path, { method = "GET", body, accept } = {}) {
  const response = await fetch(`${WRITE_PROXY_ROOT}${path}`, {
    method,
    headers: {
      ...requestHeaders(accept),
      "X-Device-Id": deviceId(),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return response;
}

export async function loadGithubExamLogs() {
  return loadGithubLogs(LOG_DIRECTORY, (record) => record?.id && record?.exam && record?.results);
}

async function loadGithubLogs(directory, isValidRecord) {
  const directoryResponse = await githubRequest(`/contents/${directory}?ref=${BRANCH}`);
  if (directoryResponse.status === 404) return [];
  if (!directoryResponse.ok) throw new Error("暂时无法读取 GitHub 记录");

  const files = (await directoryResponse.json())
    .filter((item) => item.type === "file" && item.name.endsWith(".json"))
    .sort((left, right) => right.name.localeCompare(left.name))
    .slice(0, 200);

  const records = await Promise.all(files.map(async (file) => {
    try {
      const response = await githubRequest(`/contents/${encodeURIComponent(directory)}/${encodeURIComponent(file.name)}?ref=${BRANCH}`);
      if (!response.ok) return null;
      const payload = await response.json();
      const record = JSON.parse(decodeBase64(payload.content || ""));
      return isValidRecord(record) ? record : null;
    } catch {
      // One damaged log should not hide the remaining history.
      return null;
    }
  }));
  return records.filter(Boolean);
}

export async function uploadGithubExamLog(record) {
  return uploadGithubLog({
    directory: LOG_DIRECTORY,
    record,
    dateField: "completedAt",
    commitMessage: `Save Amy exam record ${record.id}`
  });
}

export async function loadGithubRewardLogs() {
  return loadGithubLogs(
    REWARD_DIRECTORY,
    (record) => record?.id && ["reward", "payment"].includes(record?.type) && Number(record?.amount) > 0
  );
}

export async function uploadGithubRewardLog(record) {
  return uploadGithubLog({
    directory: REWARD_DIRECTORY,
    record,
    dateField: "createdAt",
    commitMessage: `Save Amy reward record ${record.id}`
  });
}

// 接受答案表（家长批改沉淀的可学习规则）：以条目 id 为键、可接受作答文本数组为值。
// 存成仓库内单独文件，不放进 exam-logs，避免污染历史记录列表。
export function mergeAcceptedAnswers(local = {}, remote = {}) {
  const merged = {};
  new Set([...Object.keys(local), ...Object.keys(remote)]).forEach((id) => {
    const values = new Set([
      ...(local[id] || []),
      ...(remote[id] || [])
    ].map((value) => String(value).trim()).filter(Boolean));
    if (values.size) merged[id] = [...values];
  });
  return merged;
}

export async function loadGithubAcceptedAnswers() {
  const response = await githubRequest(`/contents/${encodeURIComponent(RULES_DIRECTORY)}/${encodeURIComponent(ACCEPTED_ANSWERS_FILE)}?ref=${BRANCH}`);
  if (response.status === 404) return {};
  if (!response.ok) throw new Error("暂时无法读取 GitHub 接受答案");
  const payload = await response.json();
  const data = JSON.parse(decodeBase64(payload.content || "{}"));
  const entries = data?.entries && typeof data.entries === "object" && !Array.isArray(data.entries) ? data.entries : {};
  const cleaned = {};
  Object.entries(entries).forEach(([id, list]) => {
    if (Array.isArray(list)) {
      const values = list.map((value) => String(value).trim()).filter(Boolean);
      if (values.length) cleaned[id] = values;
    }
  });
  return cleaned;
}

async function uploadGithubJsonFile({ directory, fileName, content, commitMessage }) {
  const path = `/contents/${encodeURIComponent(directory)}/${encodeURIComponent(fileName)}`;
  const existingResponse = await githubRequest(`${path}?ref=${BRANCH}`);
  let sha;
  if (existingResponse.ok) {
    sha = (await existingResponse.json()).sha;
  } else if (existingResponse.status !== 404) {
    throw new Error(existingResponse.status === 401 || existingResponse.status === 403 ? "后台上传暂时不可用" : "无法检查云端记录");
  }
  const uploadResponse = await githubRequest(path, {
    method: "PUT",
    body: {
      message: commitMessage,
      branch: BRANCH,
      content: encodeBase64(content),
      ...(sha ? { sha } : {})
    }
  });
  if (!uploadResponse.ok) {
    const reason = await uploadResponse.json().catch(() => ({}));
    if (uploadResponse.status === 401 || uploadResponse.status === 403) {
      throw new Error("后台上传暂时不可用");
    }
    throw new Error(reason.message || "上传记录失败");
  }
  return { fileName, updated: Boolean(sha) };
}

// 上传前先把远端拉下来与本地取并集，保证多端各自新增的接受答案不会互相覆盖。
export async function uploadGithubAcceptedAnswers(entries = {}) {
  let remote = {};
  try {
    remote = await loadGithubAcceptedAnswers();
  } catch {
    // 远端暂时读不到时，仍按本地写入，下次再合并。
  }
  const merged = mergeAcceptedAnswers(entries, remote);
  const payload = { version: 1, updatedAt: new Date().toISOString(), entries: merged };
  await uploadGithubJsonFile({
    directory: RULES_DIRECTORY,
    fileName: ACCEPTED_ANSWERS_FILE,
    content: JSON.stringify(payload, null, 2),
    commitMessage: "Update Amy accepted answers"
  });
  return merged;
}

async function uploadGithubLog({ directory, record, dateField, commitMessage }) {
  const fileName = recordFileName(record, dateField);
  const existingResponse = await githubRequest(`/contents/${encodeURIComponent(directory)}/${encodeURIComponent(fileName)}?ref=${BRANCH}`);
  let sha;
  if (existingResponse.ok) {
    sha = (await existingResponse.json()).sha;
  } else if (existingResponse.status !== 404) {
    throw new Error(existingResponse.status === 401 || existingResponse.status === 403 ? "后台上传暂时不可用" : "无法检查云端记录");
  }

  const uploadResponse = await githubRequest(`/contents/${encodeURIComponent(directory)}/${encodeURIComponent(fileName)}`, {
    method: "PUT",
    body: {
      message: commitMessage,
      branch: BRANCH,
      content: encodeBase64(JSON.stringify(record, null, 2)),
      ...(sha ? { sha } : {})
    }
  });
  if (!uploadResponse.ok) {
    const reason = await uploadResponse.json().catch(() => ({}));
    if (uploadResponse.status === 401 || uploadResponse.status === 403) {
      throw new Error("后台上传暂时不可用");
    }
    throw new Error(reason.message || "上传记录失败");
  }
  return { fileName, updated: Boolean(sha) };
}
