const OWNER = "dannyxiexie";
const REPOSITORY = "amy-engmate";
const BRANCH = "main";
const LOG_DIRECTORY = "exam-logs";
const API_ROOT = `https://api.github.com/repos/${OWNER}/${REPOSITORY}`;

export const GITHUB_TOKEN_KEY = "amy-engmate:github-write-token:v1";
export const GITHUB_TOKEN_URL = "https://github.com/settings/personal-access-tokens/new?name=Amy%20EngMate%20exam%20logs&description=Upload%20Amy%20exam%20history&target_name=dannyxiexie&expires_in=365&contents=write";

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

function recordFileName(record) {
  const date = String(record.completedAt || new Date().toISOString()).slice(0, 10);
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
  const directoryResponse = await githubRequest(`/contents/${LOG_DIRECTORY}?ref=${BRANCH}`, { token });
  if (directoryResponse.status === 404) return [];
  if (!directoryResponse.ok) throw new Error("暂时无法读取 GitHub 考试日志");

  const files = (await directoryResponse.json())
    .filter((item) => item.type === "file" && item.name.endsWith(".json"))
    .sort((left, right) => right.name.localeCompare(left.name))
    .slice(0, 200);

  const records = [];
  for (const file of files) {
    try {
      const response = await githubRequest(`/contents/${encodeURIComponent(LOG_DIRECTORY)}/${encodeURIComponent(file.name)}?ref=${BRANCH}`, { token });
      if (!response.ok) continue;
      const payload = await response.json();
      const record = JSON.parse(decodeBase64(payload.content || ""));
      if (record?.id && record?.exam && record?.results) records.push(record);
    } catch {
      // One damaged log should not hide the remaining history.
    }
  }
  return records;
}

export async function uploadGithubExamLog(record, token) {
  if (!token) throw new Error("需要先连接 GitHub");
  const fileName = recordFileName(record);
  const path = `${LOG_DIRECTORY}/${fileName}`;
  const existingResponse = await githubRequest(`/contents/${encodeURIComponent(LOG_DIRECTORY)}/${encodeURIComponent(fileName)}?ref=${BRANCH}`, { token });
  let sha;
  if (existingResponse.ok) {
    sha = (await existingResponse.json()).sha;
  } else if (existingResponse.status !== 404) {
    throw new Error(existingResponse.status === 401 || existingResponse.status === 403 ? "GitHub 授权无效或没有写入权限" : "无法检查云端记录");
  }

  const uploadResponse = await githubRequest(`/contents/${encodeURIComponent(LOG_DIRECTORY)}/${encodeURIComponent(fileName)}`, {
    token,
    method: "PUT",
    body: {
      message: `Save Amy exam record ${record.id}`,
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
    throw new Error(reason.message || "上传考试记录失败");
  }
  return { fileName, updated: Boolean(sha) };
}

export async function verifyGithubWriteToken(token) {
  if (!token) throw new Error("请输入 GitHub Token");
  const response = await githubRequest("", { token });
  if (!response.ok) throw new Error("Token 无效，或没有访问 amy-engmate 的权限");
  return true;
}
