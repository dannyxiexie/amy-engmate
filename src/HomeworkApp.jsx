import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronRight, CircleX, CloudUpload, ImagePlus, MessageSquare, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import {
  commitGithubHomeworkPost,
  createHomeworkStoragePaths,
  homeworkImageUrls,
  loadGithubHomeworkPost,
  loadGithubHomeworkPosts,
  mutateGithubHomeworkPost
} from "./githubHomework.js";
import { compressHomeworkImage } from "./homeworkImages.js";
import "./homework.css";

const DEVICE_ID_KEY = "amy-engmate:device-id:v1";
const MAX_IMAGES = 30;

function newId(prefix = "") {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, "") || Math.random().toString(36).slice(2);
  return `${prefix}${Date.now()}${random.slice(0, 10)}`;
}

function readDeviceId() {
  let deviceId = window.localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = newId("device-");
    window.localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatHomeworkDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function formatTimestamp(value) {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function sortPosts(posts) {
  return [...posts].sort((left, right) => {
    const dateOrder = String(right.homeworkDate).localeCompare(String(left.homeworkDate));
    return dateOrder || new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
  });
}

function auditEntry(action, deviceId, details = {}) {
  return { id: newId("audit-"), action, deviceId, timestamp: new Date().toISOString(), details };
}

function updatePostInList(posts, post) {
  return sortPosts([post, ...posts.filter((item) => item.id !== post.id)]);
}

function HomeworkImage({ image, alt }) {
  const [source, setSource] = useState(image.publicUrl || homeworkImageUrls(image.path).publicUrl);
  const [failed, setFailed] = useState(false);
  const rawUrl = image.rawUrl || homeworkImageUrls(image.path).rawUrl;

  useEffect(() => {
    setSource(image.publicUrl || homeworkImageUrls(image.path).publicUrl);
    setFailed(false);
  }, [image.path, image.publicUrl]);

  if (failed) return <div className="homework-image-failed">图片正在发布，请稍后刷新</div>;
  return <img src={source} alt={alt} loading="lazy" onError={() => {
    if (source !== rawUrl) setSource(rawUrl);
    else setFailed(true);
  }} />;
}

function CommentList({ comments }) {
  if (!comments.length) return null;
  return <div className="homework-comments">{comments.map((comment) => <article key={comment.id}>
    <p>{comment.text}</p>
    <time>{formatTimestamp(comment.createdAt)}</time>
  </article>)}</div>;
}

function CommentComposer({ label, busy, onSubmit }) {
  const [text, setText] = useState("");
  const submit = async () => {
    const cleanText = text.trim();
    if (!cleanText || busy) return;
    const saved = await onSubmit(cleanText);
    if (saved !== false) setText("");
  };
  return <div className="homework-comment-compose">
    <label>{label}<textarea rows="2" value={text} maxLength="500" onChange={(event) => setText(event.target.value)} placeholder="写一条评论" /></label>
    <button disabled={!text.trim() || busy} onClick={submit} aria-label="发表评论"><Send size={16} />{busy ? "发送中" : "发表"}</button>
  </div>;
}

function PostEditor({ initialPost, saving, progress, onCancel, onSubmit }) {
  const [homeworkDate, setHomeworkDate] = useState(initialPost?.homeworkDate || today());
  const [description, setDescription] = useState(initialPost?.description || "");
  const [existingImages, setExistingImages] = useState(initialPost?.images || []);
  const [newImages, setNewImages] = useState([]);
  const [error, setError] = useState("");
  const previews = useRef(new Set());

  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const addFiles = (files) => {
    const imageFiles = [...files].filter((file) => file.type.startsWith("image/"));
    const remaining = MAX_IMAGES - existingImages.length - newImages.length;
    if (!remaining) {
      setError("一次发布最多 30 张图片。");
      return;
    }
    if (imageFiles.length > remaining) setError(`这次还能添加 ${remaining} 张图片。`);
    else setError("");
    const additions = imageFiles.slice(0, remaining).map((file) => {
      const previewUrl = URL.createObjectURL(file);
      previews.current.add(previewUrl);
      return { id: newId("image-"), file, title: "", previewUrl };
    });
    setNewImages((current) => [...current, ...additions]);
  };

  const removeNewImage = (id) => setNewImages((current) => current.filter((image) => {
    if (image.id === id) {
      URL.revokeObjectURL(image.previewUrl);
      previews.current.delete(image.previewUrl);
      return false;
    }
    return true;
  }));

  const submit = () => {
    const cleanDescription = description.trim();
    const allImages = [...existingImages, ...newImages];
    if (!homeworkDate) return setError("请选择作业日期。");
    if (!cleanDescription) return setError("请填写这次发布的描述。");
    if (!allImages.length) return setError("请至少添加一张图片。");
    if (allImages.length > MAX_IMAGES) return setError("一次发布最多 30 张图片。");
    if (allImages.some((image) => !image.title.trim())) return setError("每张图片都必须填写标题。");
    setError("");
    onSubmit({ homeworkDate, description: cleanDescription, existingImages, newImages });
  };

  return <main className="homework-editor">
    <div className="homework-page-heading">
      <div><span>{initialPost ? "EDIT POST" : "NEW POST"}</span><h1>{initialPost ? "修改作业发布" : "发布作业记录"}</h1></div>
      <small>最多 30 张</small>
    </div>
    <section className="homework-editor-fields">
      <label>作业日期<input type="date" value={homeworkDate} onChange={(event) => setHomeworkDate(event.target.value)} /></label>
      <label>发布描述<textarea rows="4" maxLength="1000" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="说明这是哪一天、哪一项作业" /></label>
    </section>

    <section className="homework-image-editor">
      <div className="homework-editor-title"><div><h2>图片与标题</h2><span>{existingImages.length + newImages.length} / {MAX_IMAGES}</span></div>
        <label className="homework-add-images"><ImagePlus size={17} />添加图片<input type="file" accept="image/*" multiple onChange={(event) => { addFiles(event.target.files || []); event.target.value = ""; }} /></label>
      </div>
      <div className="homework-edit-grid">
        {existingImages.map((image) => <article key={image.id}>
          <HomeworkImage image={image} alt={image.title} />
          <label>图片标题<input value={image.title} maxLength="100" onChange={(event) => setExistingImages((current) => current.map((item) => item.id === image.id ? { ...item, title: event.target.value } : item))} /></label>
          <button className="homework-remove-image" onClick={() => setExistingImages((current) => current.filter((item) => item.id !== image.id))} aria-label="移除图片"><Trash2 size={16} /></button>
        </article>)}
        {newImages.map((image) => <article key={image.id}>
          <img src={image.previewUrl} alt="待上传图片" />
          <label>图片标题<input value={image.title} maxLength="100" onChange={(event) => setNewImages((current) => current.map((item) => item.id === image.id ? { ...item, title: event.target.value } : item))} placeholder="必须填写" /></label>
          <button className="homework-remove-image" onClick={() => removeNewImage(image.id)} aria-label="移除图片"><Trash2 size={16} /></button>
        </article>)}
      </div>
      {!existingImages.length && !newImages.length ? <label className="homework-dropzone"><ImagePlus size={27} /><strong>选择照片</strong><span>可一次选择多张，每张都要填写标题</span><input type="file" accept="image/*" multiple onChange={(event) => { addFiles(event.target.files || []); event.target.value = ""; }} /></label> : null}
    </section>

    {error ? <p className="homework-form-error">{error}</p> : null}
    {saving ? <div className="homework-save-progress"><CloudUpload size={17} /><span>{progress}</span></div> : null}
    <div className="homework-editor-actions"><button onClick={onCancel} disabled={saving}>取消</button><button className="primary" onClick={submit} disabled={saving}>{saving ? "正在保存" : initialPost ? "保存修改" : "发布"}</button></div>
  </main>;
}

function PostList({ posts, loading, status, onCreate, onOpen }) {
  return <main className="homework-list-page">
    <div className="homework-page-heading"><div><span>HOMEWORK JOURNAL</span><h1>作业发布</h1></div><button className="homework-new-button" onClick={onCreate}><Plus size={17} />新发布</button></div>
    {status ? <div className="homework-status"><CloudUpload size={15} /><span>{status}</span></div> : null}
    {loading ? <p className="homework-empty">正在读取公开记录</p> : posts.length ? <section className="homework-post-list">{posts.map((post) => <button key={post.id} onClick={() => onOpen(post)}>
      <div className="homework-date-block"><strong>{new Date(`${post.homeworkDate}T00:00:00`).getDate()}</strong><span>{new Date(`${post.homeworkDate}T00:00:00`).toLocaleString("zh-CN", { month: "short" })}</span></div>
      <div><strong>{formatHomeworkDate(post.homeworkDate)}的作业</strong><p>{post.description}</p><small>{post.images.length} 张图片 · {(post.comments || []).length} 条评论</small></div>
      <span className={`homework-state ${post.confirmedAt ? "confirmed" : post.rejectedAt ? "rejected" : "open"}`}>{post.confirmedAt ? "已确认" : post.rejectedAt ? "已驳回" : "等待确认"}</span>
      <ChevronRight size={18} />
    </button>)}</section> : <p className="homework-empty">还没有发布记录。</p>}
  </main>;
}

function PostDetail({ post, busyAction, onBack, onEdit, onConfirm, onReject, onComment }) {
  const postComments = (post.comments || []).filter((comment) => comment.targetType === "post");
  return <main className="homework-detail">
    <div className="homework-detail-head">
      <button className="homework-inline-back" onClick={onBack}><ArrowLeft size={16} />全部发布</button>
      <div><span>{formatHomeworkDate(post.homeworkDate)}</span><h1>{post.description}</h1><small>{post.images.length} 张图片 · 发布于 {formatTimestamp(post.createdAt)}</small></div>
      <div className="homework-detail-actions">
        {!post.confirmedAt ? <button onClick={onEdit}><Pencil size={16} />修改或补图</button> : null}
        {post.confirmedAt ? <span className="homework-confirmed"><CheckCircle2 size={17} />已确认</span> : post.rejectedAt ? <span className="homework-rejected"><CircleX size={17} />已驳回</span> : <>
          <button className="confirm" disabled={Boolean(busyAction)} onClick={onConfirm}><CheckCircle2 size={16} />{busyAction === "confirm" ? "确认中" : "爸妈确认"}</button>
          <button className="reject" disabled={Boolean(busyAction)} onClick={onReject}><CircleX size={16} />{busyAction === "reject" ? "驳回中" : "驳回"}</button>
        </>}
      </div>
    </div>

    <section className="homework-post-comments">
      <div className="homework-section-label"><MessageSquare size={16} /><strong>整次发布的评论</strong><span>{postComments.length}</span></div>
      <CommentList comments={postComments} />
      <CommentComposer label="" busy={busyAction === "comment-post"} onSubmit={(text) => onComment("post", null, text)} />
    </section>

    <section className="homework-gallery">{post.images.map((image, index) => {
      const imageComments = (post.comments || []).filter((comment) => comment.targetType === "image" && comment.targetId === image.id);
      return <article key={image.id} className="homework-photo-card">
        <div className="homework-photo-heading"><span>{index + 1}</span><h2>{image.title}</h2></div>
        <HomeworkImage image={image} alt={image.title} />
        <div className="homework-photo-comments">
          <div className="homework-section-label"><MessageSquare size={15} /><strong>这张图片的评论</strong><span>{imageComments.length}</span></div>
          <CommentList comments={imageComments} />
          <CommentComposer label="" busy={busyAction === `comment-${image.id}`} onSubmit={(text) => onComment("image", image.id, text)} />
        </div>
      </article>;
    })}</section>
  </main>;
}

export default function HomeworkApp({ onBack }) {
  const [view, setView] = useState("list");
  const [posts, setPosts] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("正在连接公开记录");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const deviceId = useMemo(() => readDeviceId(), []);

  useEffect(() => {
    loadGithubHomeworkPosts()
      .then((records) => {
        setPosts(records);
        setStatus(records.length ? `已读取 ${records.length} 次公开发布` : "还没有公开发布");
      })
      .catch(() => setStatus("暂时无法读取公开记录，请稍后刷新"))
      .finally(() => setLoading(false));
  }, []);

  const runWithUpload = (action) => action();

  const compressNewImages = async (newImages, imageFolder) => {
    const uploads = [];
    const metadata = [];
    for (let index = 0; index < newImages.length; index += 1) {
      const image = newImages[index];
      setProgress(`正在处理第 ${index + 1} / ${newImages.length} 张图片`);
      const compressed = await compressHomeworkImage(image.file);
      const path = `${imageFolder}/${image.id}.${compressed.extension}`;
      const urls = homeworkImageUrls(path);
      uploads.push({ path, blob: compressed.blob });
      metadata.push({
        id: image.id,
        title: image.title.trim(),
        path,
        ...urls,
        mimeType: compressed.mimeType,
        width: compressed.width,
        height: compressed.height,
        size: compressed.blob.size,
        createdAt: new Date().toISOString()
      });
    }
    return { uploads, metadata };
  };

  const publishPost = (form) => runWithUpload(async () => {
    setSaving(true);
    try {
      const postId = newId("post-");
      const paths = createHomeworkStoragePaths(form.homeworkDate, postId);
      const { uploads, metadata } = await compressNewImages(form.newImages, paths.imageFolder);
      const timestamp = new Date().toISOString();
      const post = {
        version: 1,
        id: postId,
        metadataPath: paths.metadataPath,
        imageFolder: paths.imageFolder,
        homeworkDate: form.homeworkDate,
        description: form.description,
        images: metadata,
        comments: [],
        confirmedAt: null,
        confirmedByDeviceId: null,
        rejectedAt: null,
        rejectedByDeviceId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        auditLog: [auditEntry("create_post", deviceId, { imageCount: metadata.length })]
      };
      setProgress("正在远程发布");
      await commitGithubHomeworkPost({ post, imageFiles: uploads, message: `Publish Amy homework ${post.id}` });
      setPosts((current) => updatePostInList(current, post));
      setSelectedPost(post);
      setView("detail");
      setStatus("作业已经发布，图片页面约半分钟后完成更新");
    } catch (error) {
      window.alert(error.message || "发布失败，请稍后重试");
    } finally {
      setSaving(false);
      setProgress("");
    }
  });

  const editPost = (form) => runWithUpload(async () => {
    setSaving(true);
    try {
      const { post: latest } = await loadGithubHomeworkPost(selectedPost.metadataPath);
      if (latest.confirmedAt) throw new Error("这次发布已经确认，不能再修改内容");
      const imageFolder = latest.imageFolder || selectedPost.imageFolder;
      const { uploads, metadata } = await compressNewImages(form.newImages, imageFolder);
      const existingTitles = new Map(form.existingImages.map((image) => [image.id, image.title.trim()]));
      const keptImages = latest.images
        .filter((image) => existingTitles.has(image.id))
        .map((image) => ({ ...image, title: existingTitles.get(image.id) }));
      const timestamp = new Date().toISOString();
      const applyEdits = (current) => {
        if (current.confirmedAt) throw new Error("这次发布已经确认，不能再修改内容");
        return {
          ...current,
          homeworkDate: form.homeworkDate,
          description: form.description,
          images: [...keptImages, ...metadata],
          rejectedAt: null,
          rejectedByDeviceId: null,
          updatedAt: timestamp,
          auditLog: [...(current.auditLog || []), auditEntry("edit_post", deviceId, {
            imageCount: keptImages.length + metadata.length,
            addedImages: metadata.length
          })]
        };
      };
      let updated;
      if (uploads.length) {
        updated = applyEdits(latest);
        setProgress("正在上传补充图片");
        await commitGithubHomeworkPost({ post: updated, imageFiles: uploads, message: `Update Amy homework ${latest.id}` });
      } else {
        setProgress("正在保存修改");
        updated = await mutateGithubHomeworkPost(latest.metadataPath, applyEdits, `Edit Amy homework ${latest.id}`);
      }
      setSelectedPost(updated);
      setPosts((current) => updatePostInList(current, updated));
      setView("detail");
      setStatus("修改已保存");
    } catch (error) {
      window.alert(error.message || "保存失败，请稍后重试");
    } finally {
      setSaving(false);
      setProgress("");
    }
  });

  const addComment = (targetType, targetId, text) => new Promise((resolve) => {
    runWithUpload(async () => {
      const actionKey = targetType === "post" ? "comment-post" : `comment-${targetId}`;
      setBusyAction(actionKey);
      try {
        const timestamp = new Date().toISOString();
        const comment = { id: newId("comment-"), targetType, targetId, text, createdAt: timestamp };
        const updated = await mutateGithubHomeworkPost(selectedPost.metadataPath, (current) => ({
          ...current,
          comments: [...(current.comments || []), comment],
          updatedAt: timestamp,
          auditLog: [...(current.auditLog || []), auditEntry("add_comment", deviceId, { targetType, targetId })]
        }), `Comment on Amy homework ${selectedPost.id}`);
        setSelectedPost(updated);
        setPosts((current) => updatePostInList(current, updated));
        resolve(true);
      } catch (error) {
        window.alert(error.message || "评论保存失败");
        resolve(false);
      } finally {
        setBusyAction("");
      }
    });
  });

  const confirmPost = () => runWithUpload(async () => {
    setBusyAction("confirm");
    try {
      const timestamp = new Date().toISOString();
      const updated = await mutateGithubHomeworkPost(selectedPost.metadataPath, (current) => current.confirmedAt ? current : ({
        ...current,
        confirmedAt: timestamp,
        confirmedByDeviceId: deviceId,
        rejectedAt: null,
        rejectedByDeviceId: null,
        updatedAt: timestamp,
        auditLog: [...(current.auditLog || []), auditEntry("confirm_post", deviceId)]
      }), `Confirm Amy homework ${selectedPost.id}`);
      setSelectedPost(updated);
      setPosts((current) => updatePostInList(current, updated));
    } catch (error) {
      window.alert(error.message || "确认失败，请稍后重试");
    } finally {
      setBusyAction("");
    }
  });

  const rejectPost = () => runWithUpload(async () => {
    setBusyAction("reject");
    try {
      const timestamp = new Date().toISOString();
      const updated = await mutateGithubHomeworkPost(selectedPost.metadataPath, (current) => current.rejectedAt ? current : ({
        ...current,
        confirmedAt: null,
        confirmedByDeviceId: null,
        rejectedAt: timestamp,
        rejectedByDeviceId: deviceId,
        updatedAt: timestamp,
        auditLog: [...(current.auditLog || []), auditEntry("reject_post", deviceId)]
      }), `Reject Amy homework ${selectedPost.id}`);
      setSelectedPost(updated);
      setPosts((current) => updatePostInList(current, updated));
    } catch (error) {
      window.alert(error.message || "驳回失败，请稍后重试");
    } finally {
      setBusyAction("");
    }
  });

  const back = () => {
    if (view === "list") onBack?.();
    else if (view === "detail") setView("list");
    else if (selectedPost) setView("detail");
    else setView("list");
  };

  return <div className="homework-app">
    <header>
      <button aria-label="返回" onClick={back}><ArrowLeft size={19} /></button>
      <div><span>AMY HOMEWORK</span><strong>作业图片记录</strong></div>
      {view === "list" ? <button className="homework-header-add" onClick={() => { setSelectedPost(null); setView("create"); }}><Plus size={17} /><span>发布</span></button> : <span className="homework-header-spacer" />}
    </header>

    {view === "list" ? <PostList posts={posts} loading={loading} status={status} onCreate={() => { setSelectedPost(null); setView("create"); }} onOpen={(post) => { setSelectedPost(post); setView("detail"); }} /> : null}
    {view === "create" ? <PostEditor saving={saving} progress={progress} onCancel={() => setView("list")} onSubmit={publishPost} /> : null}
    {view === "edit" && selectedPost ? <PostEditor initialPost={selectedPost} saving={saving} progress={progress} onCancel={() => setView("detail")} onSubmit={editPost} /> : null}
    {view === "detail" && selectedPost ? <PostDetail post={selectedPost} busyAction={busyAction} onBack={() => setView("list")} onEdit={() => setView("edit")} onConfirm={confirmPost} onReject={rejectPost} onComment={addComment} /> : null}
  </div>;
}
