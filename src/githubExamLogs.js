const OWNER = "dannyxiexie";
const REPOSITORY = "amy-engmate";
const BRANCH = "main";
const LOG_DIRECTORY = "exam-logs";
const REWARD_DIRECTORY = "reward-logs";
const RULES_DIRECTORY = "grading-rules";
const ACCEPTED_ANSWERS_FILE = "accepted-answers.json";
const API_ROOT = `https://api.github.com/repos/${OWNER}/${REPOSITORY}`;

export const GITHUB_TOKEN_KEY = "amy-engmate:github-write-token:v1";

function requestHeaders(token, accept = "application/vnd.github+json") {
  return {
    Accept: accept,
    "X-GitHub-Api-Version": "2026-03-10",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
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

async function githubRequest(path, { token = "", method = "GET", body, accept } = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    method,
    headers: {
      ...requestHeaders(token, accept),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return response;
}

export async function loadGithubExamLogs(token = "") {
  return loadGithubLogs(LOG_DIRECTORY, token, (record) => record?.id && record?.exam && record?.results);
}

async function loadGithubLogs(directory, token, isValidRecord) {
  const directoryResponse = await githubRequest(`/contents/${directory}?ref=${BRANCH}`, { token });
  if (directoryResponse.status === 404) return [];
  if (!directoryResponse.ok) throw new Error("暂时无法读取 GitHub 记录");

  const files = (await directoryResponse.json())
    .filter((item) => item.type === "file" && item.name.endsWith(".json"))
    .sort((left, right) => right.name.localeCompare(left.name))
    .slice(0, 200);

  const records = [];
  for (const file of files) {
    try {
      const response = await githubRequest(`/contents/${encodeURIComponent(directory)}/${encodeURIComponent(file.name)}?ref=${BRANCH}`, { token });
      if (!response.ok) continue;
      const payload = await response.json();
      const record = JSON.parse(decodeBase64(payload.content || ""));
      if (isValidRecord(record)) records.push(record);
    } catch {
      // One damaged log should not hide the remaining history.
    }
  }
  return records;
}

export async function uploadGithubExamLog(record, token) {
  return uploadGithubLog({
    directory: LOG_DIRECTORY,
    record,
    token,
    dateField: "completedAt",
    commitMessage: `Save Amy exam record ${record.id}`
  });
}

export async function loadGithubRewardLogs(token = "") {
  return loadGithubLogs(
    REWARD_DIRECTORY,
    token,
    (record) => record?.id && ["reward", "payment"].includes(record?.type) && Number(record?.amount) > 0
  );
}

export async function uploadGithubRewardLog(record, token) {
  return uploadGithubLog({
    directory: REWARD_DIRECTORY,
    record,
    token,
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

export async function loadGithubAcceptedAnswers(token = "") {
  const response = await githubRequest(`/contents/${encodeURIComponent(RULES_DIRECTORY)}/${encodeURIComponent(ACCEPTED_ANSWERS_FILE)}?ref=${BRANCH}`, { token });
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

async function uploadGithubJsonFile({ directory, fileName, content, token, commitMessage }) {
  if (!token) throw new Error("需要先连接 GitHub");
  const path = `/contents/${encodeURIComponent(directory)}/${encodeURIComponent(fileName)}`;
  const existingResponse = await githubRequest(`${path}?ref=${BRANCH}`, { token });
  let sha;
  if (existingResponse.ok) {
    sha = (await existingResponse.json()).sha;
  } else if (existingResponse.status !== 404) {
    throw new Error(existingResponse.status === 401 || existingResponse.status === 403 ? "GitHub 授权无效或没有写入权限" : "无法检查云端记录");
  }
  const uploadResponse = await githubRequest(path, {
    token,
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
      throw new Error("GitHub 授权无效或没有写入权限");
    }
    throw new Error(reason.message || "上传记录失败");
  }
  return { fileName, updated: Boolean(sha) };
}

// 上传前先把远端拉下来与本地取并集，保证多端各自新增的接受答案不会互相覆盖。
export async function uploadGithubAcceptedAnswers(entries = {}, token) {
  if (!token) throw new Error("需要先连接 GitHub");
  let remote = {};
  try {
    remote = await loadGithubAcceptedAnswers(token);
  } catch {
    // 远端暂时读不到时，仍按本地写入，下次再合并。
  }
  const merged = mergeAcceptedAnswers(entries, remote);
  const payload = { version: 1, updatedAt: new Date().toISOString(), entries: merged };
  await uploadGithubJsonFile({
    directory: RULES_DIRECTORY,
    fileName: ACCEPTED_ANSWERS_FILE,
    content: JSON.stringify(payload, null, 2),
    token,
    commitMessage: "Update Amy accepted answers"
  });
  return merged;
}

async function uploadGithubLog({ directory, record, token, dateField, commitMessage }) {
  if (!token) throw new Error("需要先连接 GitHub");
  const fileName = recordFileName(record, dateField);
  const existingResponse = await githubRequest(`/contents/${encodeURIComponent(directory)}/${encodeURIComponent(fileName)}?ref=${BRANCH}`, { token });
  let sha;
  if (existingResponse.ok) {
    sha = (await existingResponse.json()).sha;
  } else if (existingResponse.status !== 404) {
    throw new Error(existingResponse.status === 401 || existingResponse.status === 403 ? "GitHub 授权无效或没有写入权限" : "无法检查云端记录");
  }

  const uploadResponse = await githubRequest(`/contents/${encodeURIComponent(directory)}/${encodeURIComponent(fileName)}`, {
    token,
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
      throw new Error("GitHub 授权无效或没有写入权限");
    }
    throw new Error(reason.message || "上传记录失败");
  }
  return { fileName, updated: Boolean(sha) };
}

export async function verifyGithubWriteToken(token) {
  if (!token) throw new Error("请输入 GitHub Token");
  const response = await githubRequest("", { token });
  if (!response.ok) throw new Error("Token 无效，或没有访问 amy-engmate 的权限");
  return true;
}
