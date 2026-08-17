const OWNER = "dannyxiexie";
const REPOSITORY = "amy-engmate";
const BRANCH = "main";
const WRITE_PROXY_ROOT = String(import.meta.env.VITE_GITHUB_WRITE_PROXY_URL || "https://grade.dannyxiexie.tech/github").replace(/\/$/, "");
const POST_ROOT = "homework-posts";
const IMAGE_ROOT = "public/homework-images";
const DEVICE_ID_KEY = "amy-engmate:device-id:v1";

function requestHeaders() {
  return {
    Accept: "application/vnd.github+json"
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

async function githubRequest(path, { method = "GET", body } = {}) {
  return fetch(`${WRITE_PROXY_ROOT}${path}`, {
    method,
    headers: {
      ...requestHeaders(),
      "X-Device-Id": deviceId(),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

function encodeText(value) {
  return bytesToBase64(new TextEncoder().encode(value));
}

function decodeText(value) {
  const binary = atob(String(value || "").replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

async function responseError(response, fallback) {
  const payload = await response.json().catch(() => ({}));
  const error = new Error(response.status === 401 || response.status === 403
    ? "后台上传暂时不可用"
    : payload.message || fallback);
  error.status = response.status;
  return error;
}

export function createHomeworkStoragePaths(homeworkDate, postId) {
  const [year, month] = homeworkDate.split("-");
  const folder = `${year}/${month}/${postId}`;
  return {
    metadataPath: `${POST_ROOT}/${folder}/post.json`,
    imageFolder: `${IMAGE_ROOT}/${folder}`
  };
}

export function homeworkImageUrls(path) {
  const publicPath = path.replace(/^public\//, "");
  return {
    publicUrl: `${import.meta.env.BASE_URL}${publicPath}`,
    rawUrl: `https://raw.githubusercontent.com/${OWNER}/${REPOSITORY}/${BRANCH}/${path}`
  };
}

export async function loadGithubHomeworkPost(path) {
  const response = await githubRequest(`/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${BRANCH}`);
  if (!response.ok) throw await responseError(response, "无法读取作业记录");
  const payload = await response.json();
  return { post: JSON.parse(decodeText(payload.content)), sha: payload.sha };
}

export async function loadGithubHomeworkPosts() {
  const treeResponse = await githubRequest(`/git/trees/${BRANCH}?recursive=1`);
  if (treeResponse.status === 404) return [];
  if (!treeResponse.ok) throw await responseError(treeResponse, "暂时无法读取作业发布记录");
  const tree = await treeResponse.json();
  const paths = (tree.tree || [])
    .filter((item) => item.type === "blob" && /^homework-posts\/\d{4}\/\d{2}\/[^/]+\/post\.json$/.test(item.path))
    .map((item) => item.path)
    .sort((left, right) => right.localeCompare(left))
    .slice(0, 200);

  const posts = await Promise.all(paths.map(async (path) => {
    try {
      const { post } = await loadGithubHomeworkPost(path);
      return post?.id && post?.homeworkDate && Array.isArray(post?.images) ? post : null;
    } catch {
      // One damaged record should not hide the remaining posts.
      return null;
    }
  }));
  return posts.filter(Boolean).sort((left, right) => {
    const dateOrder = String(right.homeworkDate).localeCompare(String(left.homeworkDate));
    return dateOrder || new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
  });
}

async function createBlob(content) {
  const response = await githubRequest("/git/blobs", {
    method: "POST",
    body: { content, encoding: "base64" }
  });
  if (!response.ok) throw await responseError(response, "图片上传失败");
  return (await response.json()).sha;
}

export async function commitGithubHomeworkPost({ post, imageFiles, message }) {
  const entries = [];
  for (const imageFile of imageFiles) {
    const bytes = new Uint8Array(await imageFile.blob.arrayBuffer());
    entries.push({
      path: imageFile.path,
      mode: "100644",
      type: "blob",
      sha: await createBlob(bytesToBase64(bytes))
    });
  }
  entries.push({
    path: post.metadataPath,
    mode: "100644",
    type: "blob",
    sha: await createBlob(encodeText(JSON.stringify(post, null, 2)))
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const referenceResponse = await githubRequest(`/git/ref/heads/${BRANCH}`);
    if (!referenceResponse.ok) throw await responseError(referenceResponse, "无法读取仓库状态");
    const parentSha = (await referenceResponse.json()).object.sha;
    const commitResponse = await githubRequest(`/git/commits/${parentSha}`);
    if (!commitResponse.ok) throw await responseError(commitResponse, "无法读取仓库提交");
    const baseTree = (await commitResponse.json()).tree.sha;

    const treeResponse = await githubRequest("/git/trees", {
      method: "POST",
      body: { base_tree: baseTree, tree: entries }
    });
    if (!treeResponse.ok) throw await responseError(treeResponse, "无法创建图片目录");
    const treeSha = (await treeResponse.json()).sha;

    const newCommitResponse = await githubRequest("/git/commits", {
      method: "POST",
      body: { message, tree: treeSha, parents: [parentSha] }
    });
    if (!newCommitResponse.ok) throw await responseError(newCommitResponse, "无法保存作业发布");
    const commitSha = (await newCommitResponse.json()).sha;

    const updateResponse = await githubRequest(`/git/refs/heads/${BRANCH}`, {
      method: "PATCH",
      body: { sha: commitSha, force: false }
    });
    if (updateResponse.ok) return { commitSha };
    if (updateResponse.status !== 409 && updateResponse.status !== 422) {
      throw await responseError(updateResponse, "无法完成作业发布");
    }
  }
  throw new Error("仓库刚刚有其他更新，请再试一次");
}

async function savePostFile(post, sha, message) {
  const response = await githubRequest(`/contents/${post.metadataPath.split("/").map(encodeURIComponent).join("/")}`, {
    method: "PUT",
    body: {
      message,
      branch: BRANCH,
      content: encodeText(JSON.stringify(post, null, 2)),
      sha
    }
  });
  if (!response.ok) throw await responseError(response, "保存作业记录失败");
  return post;
}

export async function mutateGithubHomeworkPost(path, mutate, message) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { post, sha } = await loadGithubHomeworkPost(path);
    const nextPost = mutate(structuredClone(post));
    try {
      return await savePostFile(nextPost, sha, message);
    } catch (error) {
      if (![409, 422].includes(error.status) || attempt === 2) throw error;
    }
  }
  throw new Error("记录刚刚有其他更新，请再试一次");
}
