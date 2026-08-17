"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpDown, BookOpen, Check, CheckCircle2, ChevronRight, ClipboardCopy, Clock3, Download, Gift, GraduationCap, History, Images, PenLine, RefreshCw, RotateCcw, Upload, X } from "lucide-react";
import { AMY_VOCABULARY_MANIFEST, createAmyExam, createClozePrompt, fetchAmyVocabularySession, formatTime, hideTermInExample, recomputeScore } from "./amyVocabularyData.js";
import { GITHUB_TOKEN_KEY, loadGithubAcceptedAnswers, loadGithubExamLogs, mergeAcceptedAnswers, uploadGithubAcceptedAnswers, uploadGithubExamLog, verifyGithubWriteToken } from "./githubExamLogs.js";
import GithubCodeDialog from "./GithubCodeDialog.jsx";
import "./amyVocabulary.css";

const HISTORY_KEY = "family-reader:amy-grade-5-vocabulary:exam-history:v1";
const DRAFTS_KEY = "family-reader:amy-grade-5-vocabulary:exam-drafts:v1";
const ACCEPTED_KEY = "family-reader:amy-grade-5-vocabulary:accepted-answers:v1";
const LAST_SYNC_KEY = "family-reader:amy-grade-5-vocabulary:last-history-sync:v1";
const GRADING_VERSION = 6;
const GRADING_API_URL = import.meta.env.VITE_GRADING_API_URL || "https://grade.dannyxiexie.tech";
const MAX_GRADING_ATTEMPTS = 6;

function gradingHeaders() {
  if (import.meta.env.VITE_STORAGE_BACKEND === "server") {
    const code = window.localStorage.getItem(GITHUB_TOKEN_KEY) || "";
    return code ? { "X-Upload-Code": code } : {};
  }
  return import.meta.env.VITE_APP_KEY ? { "X-App-Key": import.meta.env.VITE_APP_KEY } : {};
}

function readHistory() {
  if (typeof window === "undefined") return [];
  try {
    const data = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(data) ? data.slice(0, 200) : [];
  } catch {
    return [];
  }
}

function readDrafts() {
  if (typeof window === "undefined") return {};
  try {
    const data = JSON.parse(window.localStorage.getItem(DRAFTS_KEY) || "{}");
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function readAcceptedAnswers() {
  if (typeof window === "undefined") return {};
  try {
    const data = JSON.parse(window.localStorage.getItem(ACCEPTED_KEY) || "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const cleaned = {};
    Object.entries(data).forEach(([id, list]) => {
      if (Array.isArray(list)) {
        const values = list.map((value) => String(value).trim()).filter(Boolean);
        if (values.length) cleaned[id] = values;
      }
    });
    return cleaned;
  } catch {
    return {};
  }
}

function mergeHistory(importedHistory = [], localHistory = []) {
  const byId = new Map();
  [...importedHistory, ...localHistory].forEach((item) => {
    if (!item?.id || !item?.exam || !item?.results) return;
    const previous = byId.get(item.id);
    const previousTime = new Date(previous?.regradedAt || previous?.completedAt || 0).getTime();
    const itemTime = new Date(item.regradedAt || item.completedAt || 0).getTime();
    if (!previous || itemTime >= previousTime) byId.set(item.id, item);
  });
  return [...byId.values()]
    .sort((left, right) => new Date(right.completedAt || 0).getTime() - new Date(left.completedAt || 0).getTime())
    .slice(0, 200);
}

function recordUpdatedAt(record) {
  return new Date(record?.regradedAt || record?.completedAt || 0).getTime();
}

function recordsNeedingUpload(localHistory, cloudHistory) {
  const cloudById = new Map(cloudHistory.map((record) => [record.id, record]));
  return localHistory.filter((record) => {
    const cloudRecord = cloudById.get(record.id);
    return !cloudRecord || recordUpdatedAt(record) > recordUpdatedAt(cloudRecord);
  });
}

function formatSyncTime(value) {
  if (!value) return "尚未同步";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "尚未同步";
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function gradingBreakdown(record = {}) {
  const results = record.results || {};
  const meanings = Array.isArray(results.meanings) ? results.meanings : [];
  const parentCorrected = meanings.filter((item) => item?.parentCorrected).length;
  const parentReviewed = Boolean(record.parentGradedAt || parentCorrected);
  const reconstructedAi = parentReviewed
    ? recomputeScore({
      ...results,
      meanings: meanings.map((item) => item?.parentCorrected ? { ...item, correct: false } : item)
    })
    : results;
  const storedAi = record.aiGrading;
  const ai = storedAi?.total ? storedAi : {
    score: reconstructedAi.score || 0,
    correct: reconstructedAi.correct || 0,
    total: reconstructedAi.total || 0
  };
  return {
    parentReviewed,
    ai,
    parent: parentReviewed ? {
      score: results.score || 0,
      correct: results.correct || 0,
      total: results.total || 0
    } : null
  };
}

function isDraftCompatible(draft, session) {
  if (!draft?.exam || !Array.isArray(draft.exam.meanings) || !session?.entries?.length) return false;
  const expectedIds = new Set(session.entries.map((entry) => entry.id));
  return draft.exam.meanings.length === expectedIds.size
    && draft.exam.meanings.every((item) => expectedIds.has(item.id));
}

function prepareExam(exam) {
  return {
    ...exam,
    cloze: (exam?.cloze || [])
      .map((item) => ({ ...item, prompt: item.prompt || createClozePrompt(item.example, item.term) }))
      .filter((item) => item.prompt)
  };
}

function createGradingProgress(exam, saved = null) {
  const savedMeanings = Array.isArray(saved?.meanings) ? saved.meanings : [];
  const meanings = exam.meanings.map((item, index) => {
    const previous = savedMeanings[index];
    if (previous?.id === item.id && typeof previous.correct === "boolean") return previous;
    if (!item.answer.trim()) return { id: item.id, correct: false, answer: item.meaningZh, source: "blank" };
    return null;
  });
  return {
    status: saved?.status === "complete" ? "complete" : "ready",
    meanings,
    cloze: exam.cloze.map((item) => ({ correct: item.answer === item.term, answer: item.term })),
    startedAt: saved?.startedAt || new Date().toISOString(),
    auditItems: Array.isArray(saved?.auditItems) ? saved.auditItems : [],
    failedIndex: null,
    currentIndex: null,
    currentAttempt: 0,
    error: ""
  };
}

function gradingCounts(exam, progress) {
  const aiIndexes = exam.meanings
    .map((item, index) => item.answer.trim() ? index : -1)
    .filter((index) => index >= 0);
  return {
    done: aiIndexes.filter((index) => progress?.meanings?.[index]).length,
    total: aiIndexes.length
  };
}

function finishGrading(progress) {
  return recomputeScore({ meanings: progress.meanings, cloze: progress.cloze });
}

async function requestAiGrade(item, acceptedAnswers, onAttempt) {
  if (!GRADING_API_URL) throw new Error("AI批改服务未配置");
  let lastError = null;
  const requestIds = [];
  for (let attempt = 1; attempt <= MAX_GRADING_ATTEMPTS; attempt += 1) {
    onAttempt(attempt);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 55000);
    try {
      const response = await fetch(GRADING_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...gradingHeaders() },
        signal: controller.signal,
        body: JSON.stringify({ items: [{
          id: item.id,
          term: item.term,
          expected: item.meaningZh,
          accepted: [...(item.acceptedMeaningsZh || []), ...(acceptedAnswers[item.id] || [])],
          answer: item.answer
        }] })
      });
      const payload = await response.json().catch(() => ({}));
      if (payload.requestId) requestIds.push(payload.requestId);
      if (!response.ok) throw new Error(payload.error || `AI批改请求失败（${response.status}）`);
      const result = Array.isArray(payload.results) ? payload.results[0] : null;
      if (payload.results?.length !== 1 || result?.id !== item.id || typeof result.correct !== "boolean") {
        throw new Error("AI返回的批改结果不完整");
      }
      return {
        result: { id: item.id, correct: result.correct, answer: item.meaningZh, source: "ai" },
        audit: {
          id: item.id,
          requestId: payload.requestId || "",
          requestIds,
          attempts: attempt,
          provider: payload.provider || "xiaomi-mimo",
          model: payload.model || "",
          gradedAt: payload.gradedAt || new Date().toISOString()
        }
      };
    } catch (reason) {
      lastError = reason?.name === "AbortError" ? new Error("AI批改请求超时") : reason;
      if (attempt < MAX_GRADING_ATTEMPTS) {
        await new Promise((resolve) => window.setTimeout(resolve, 500 * attempt));
      }
    } finally {
      window.clearTimeout(timeout);
    }
  }
  const error = new Error(lastError?.message || "AI批改连续失败");
  error.requestIds = requestIds;
  throw error;
}

async function gradeExamOneByOne(exam, acceptedAnswers, savedProgress, onProgress) {
  let progress = createGradingProgress(exam, savedProgress);
  progress = { ...progress, status: "grading" };
  onProgress(progress);

  for (let index = 0; index < exam.meanings.length; index += 1) {
    const item = exam.meanings[index];
    if (!item.answer.trim() || progress.meanings[index]) continue;
    try {
      const graded = await requestAiGrade(item, acceptedAnswers, (attempt) => {
        progress = { ...progress, currentIndex: index, currentAttempt: attempt, error: "" };
        onProgress(progress);
      });
      const meanings = [...progress.meanings];
      meanings[index] = graded.result;
      progress = {
        ...progress,
        meanings,
        auditItems: [...progress.auditItems.filter((entry) => entry.id !== item.id), graded.audit],
        currentIndex: null,
        currentAttempt: 0
      };
      onProgress(progress);
    } catch (reason) {
      progress = {
        ...progress,
        status: "interrupted",
        failedIndex: index,
        currentIndex: null,
        currentAttempt: MAX_GRADING_ATTEMPTS,
        error: reason.message || "AI批改暂时不可用",
        failedRequestIds: reason.requestIds || []
      };
      onProgress(progress);
      return { status: "interrupted", progress };
    }
  }

  progress = { ...progress, status: "complete", completedAt: new Date().toISOString(), failedIndex: null, error: "" };
  onProgress(progress);
  return { status: "complete", progress, results: finishGrading(progress) };
}

// 用 AI 检查候选例句选词题里哪些"歧义"（多个选项填得通），优先保留非歧义题。
// AI 不可用或没返回的题按非歧义保留，保证出题永远不卡住。
async function filterClozeByAi(candidates, wantCount = 12) {
  if (!candidates?.length) return [];
  const validMap = new Map();
  const grammarBad = new Set();
  if (GRADING_API_URL) {
    try {
      const resp = await fetch(GRADING_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...gradingHeaders() },
        body: JSON.stringify({ cloze: candidates.map((c, i) => ({ index: i, prompt: c.prompt, choices: c.choices, answer: c.term })) })
      });
      if (resp.ok) {
        const data = await resp.json();
        for (const r of (data.results || [])) {
          if (r.valid) validMap.set(r.index, r.valid);
          if (r.answer_ok === false) grammarBad.add(r.index); // 正确答案填进去语法不通 → 题目有问题
        }
      }
    } catch { /* AI 不可用时退化为不筛 */ }
  }
  // 优先级：语法OK且非歧义(0) > 语法OK但歧义(1) > 语法有问题(2，跳过)
  const indexed = candidates.map((c, i) => ({ c, i, rank: grammarBad.has(i) ? 2 : ((validMap.get(i)?.length ?? 1) > 1 ? 1 : 0) }));
  indexed.sort((a, b) => a.rank - b.rank || a.i - b.i);
  return indexed.slice(0, wantCount).map((x) => x.c);
}

function PreparingExam() {
  return <main className="amy-preparing"><div className="amy-bike-scene">
    <svg viewBox="0 0 260 150" className="amy-bike" aria-hidden="true">
      <line x1="0" y1="128" x2="260" y2="128" stroke="#cbd6cf" strokeWidth="2" />
      <g className="amy-bike-rider">
        <circle className="amy-wheel" cx="62" cy="104" r="22" fill="none" stroke="#23745d" strokeWidth="3" />
        <line x1="62" y1="104" x2="62" y2="82" stroke="#23745d" strokeWidth="2" />
        <circle className="amy-wheel" cx="186" cy="104" r="22" fill="none" stroke="#23745d" strokeWidth="3" />
        <line x1="186" y1="104" x2="186" y2="82" stroke="#23745d" strokeWidth="2" />
        <path d="M62 104 L120 104 L186 104 M120 104 L120 60 M120 60 L150 48 M120 60 L92 50" fill="none" stroke="#23745d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path className="amy-leg" d="M120 78 L108 104 L98 96 M120 78 L132 104 L142 98" fill="none" stroke="#b25924" strokeWidth="3" strokeLinecap="round" />
        <circle cx="150" cy="40" r="11" fill="#f6c9a0" stroke="#b25924" strokeWidth="2" />
        <path d="M120 60 Q135 54 145 44" fill="none" stroke="#23745d" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
    <p>AI 正在为你精心出题<span className="amy-dots"><i></i><i></i><i></i></span></p>
    <small>正在挑选最合适的“例句选词”，稍等一下下～</small>
  </div></main>;
}

function SessionPicker({ data, selected, drafts, loadingSession, onSelect, onView, onStart }) {
  const current = data.sessions.find((item) => item.number === selected);
  const hasDraft = current && isDraftCompatible(drafts[current.number], current);
  const isLoading = current && loadingSession === current.number;
  const isReady = current && Array.isArray(current.entries);
  return <main className="amy-home">
    <div className="amy-title"><span>AMY · GRADE 5 VOCABULARY</span><h1>{data.title}</h1><p>选择第几次，先复习中文和例句，再完成覆盖全部学习项的测试。</p></div>
    <section className="amy-session-grid">
      {data.sessions.map((session) => <button key={session.number} disabled={!session.available} onClick={() => session.available && onSelect(session.number)} className={selected === session.number ? "selected" : ""}>
        <span>第</span><strong>{session.number}</strong><span>次</span><small>{session.available ? session.itemCount + " 个学习项" : "资料待加入"}</small>{selected === session.number ? <Check size={18} /> : null}
      </button>)}
    </section>
    {current ? <section className="amy-mode-row">
      <button disabled={!isReady} onClick={() => onView("review")}><BookOpen size={24} /><span><strong>{isLoading ? "正在载入" : "复习"}</strong><small>{isLoading ? "只加载这一次的资料" : "英文、中文、例句和翻译"}</small></span><ChevronRight size={18} /></button>
      <button disabled={!isReady} className="exam" onClick={onStart}><GraduationCap size={24} /><span><strong>{isLoading ? "正在载入" : hasDraft ? "继续考试" : "考试"}</strong><small>{isLoading ? "很快就好" : hasDraft ? "继续上次未提交的试卷" : "全量英译中，加例句选词"}</small></span><ChevronRight size={18} /></button>
    </section> : null}
  </main>;
}

function Review({ session }) {
  return <main className="amy-content"><div className="amy-heading"><div><span>第 {session.number} 次</span><h1>复习清单</h1></div><strong>{session.groupCount} 个老师编号 · {session.itemCount} 个学习项</strong></div>
    <section className="amy-review-list">{session.groups.map((group) => <article key={group.id} className="amy-review-card">
      <div className="amy-group-source"><span className="amy-number">{group.teacherNumber}</span><strong>{group.sourceText}</strong></div>
      {group.items.map((item) => <div key={item.id} className="amy-study-item">
        <div className="amy-review-main"><strong>{item.term}</strong><b>{item.meaningZh}</b></div>
        <div className="amy-example"><span>EXAMPLE</span><p>{item.example}</p><small>{item.exampleZh}</small></div>
      </div>)}
    </article>)}</section>
  </main>;
}

function Result({ correct, answer, parentCorrected }) {
  if (parentCorrected) {
    return <div className="amy-result-review"><div className="amy-result wrong"><X size={16} /> AI批改：错误，参考答案：{answer}</div><div className="amy-result correct"><CheckCircle2 size={16} /> 家长批改：正确</div></div>;
  }
  return <div className={"amy-result " + (correct ? "correct" : "wrong")}>{correct ? <><CheckCircle2 size={16} /> 正确</> : <><X size={16} /> 正确答案：{answer}</>}</div>;
}

function Paper({ session, exam, setExam, elapsed, results, grading = null, gradingProgress = null, onSubmit, onContinue, isGrading = false, parent = null, allowParentEnter = false, onEnterParent, parentSummary = null, onCopyAccepted, onDismissSummary }) {
  const [section, setSection] = useState("meanings");
  const [resultFilter, setResultFilter] = useState("all");
  const done = Boolean(results);
  const submitted = done || Boolean(gradingProgress);
  const answered = exam.meanings.filter((item) => item.answer.trim()).length + exam.cloze.filter((item) => item.answer).length;
  const total = exam.meanings.length + exam.cloze.length;
  const progressCounts = gradingCounts(exam, gradingProgress);
  const updateMeaning = (index, answer) => setExam((current) => ({ ...current, meanings: current.meanings.map((item, itemIndex) => itemIndex === index ? { ...item, answer } : item) }));
  const updateCloze = (index, answer) => setExam((current) => ({ ...current, cloze: current.cloze.map((item, itemIndex) => itemIndex === index ? { ...item, answer } : item) }));
  const meaningQuestions = exam.meanings
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => !done || resultFilter === "all" || !results.meanings[index]?.correct);
  const clozeQuestions = exam.cloze
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => !done || resultFilter === "all" || !results.cloze[index]?.correct);
  const gradingSummary = done ? (grading || gradingBreakdown({ results })) : null;
  return <main className="amy-exam-layout">
    <section className="amy-paper"><div className="amy-exam-head"><div><span>第 {session.number} 次</span><h1>{done ? "批改结果" : "全量词汇测试"}</h1></div><strong>{answered} / {total} 已作答</strong></div>
      <nav className="amy-tabs"><button className={section === "meanings" ? "active" : ""} onClick={() => setSection("meanings")}>1 英译中 <small>{exam.meanings.filter((item) => item.answer.trim()).length}/{exam.meanings.length}</small></button><button className={section === "cloze" ? "active" : ""} onClick={() => setSection("cloze")}>2 例句选词 <small>{exam.cloze.filter((item) => item.answer).length}/{exam.cloze.length}</small></button></nav>
      {parent?.active ? <p className="amy-parent-hint">家长批改模式：把该算对的“英译中”错题点为对，完成后重算分数；例句选词为客观题，不参与批改。</p> : null}
      {done ? <div className="amy-result-filter" aria-label="批改结果筛选"><span>查看</span><button className={resultFilter === "all" ? "active" : ""} onClick={() => setResultFilter("all")}>全部</button><button className={resultFilter === "wrong" ? "active" : ""} onClick={() => setResultFilter("wrong")}>只看错题</button></div> : null}
      <div className="amy-questions">{section === "meanings" ? meaningQuestions.map(({ item, index }) => {
        const result = results?.meanings[index] || gradingProgress?.meanings?.[index];
        const flipped = parent?.active && parent.flips.has(index);
        const canMark = parent?.active && result && !result.correct && Boolean(item.answer?.trim());
        return <article key={item.id} className="amy-question"><span>{item.displayNumber}</span><div><label>{item.term}</label><input value={item.answer} disabled={submitted || isGrading} onChange={(event) => updateMeaning(index, event.target.value)} placeholder="写中文含义" autoComplete="off" />{flipped ? <div className="amy-result correct"><CheckCircle2 size={16} /> 家长判对</div> : result ? <Result {...result} /> : null}{canMark ? <button type="button" className={"amy-mark-correct" + (flipped ? " active" : "")} onClick={() => parent.onToggle(index)}><Check size={15} /> {flipped ? "取消算对" : "这题算对"}</button> : null}</div></article>;
      }) : clozeQuestions.map(({ item, index }) => <article key={item.id} className="amy-question"><span>{index + 1}</span><div><label>{item.prompt || hideTermInExample(item.example, item.term)}</label><div className="amy-options">{item.choices.map((choice) => <button key={choice} disabled={submitted || isGrading} onClick={() => updateCloze(index, choice)} className={item.answer === choice ? "selected" : ""}>{choice}</button>)}</div>{(results?.cloze[index] || gradingProgress?.cloze?.[index]) ? <Result {...(results?.cloze[index] || gradingProgress.cloze[index])} /> : null}</div></article>)}</div>
    </section>
    <aside className="amy-aside"><div className="amy-timer"><Clock3 size={17} /><div><span>用时</span><strong>{formatTime(elapsed)}</strong>{!done ? <small>已自动保存</small> : null}</div></div>{done ? <div className={"amy-score" + (gradingSummary.parentReviewed ? " compared" : "")}><div className="amy-score-line"><span>AI批改</span><strong>{gradingSummary.ai.score}<small> / 100</small></strong><p>{gradingSummary.ai.correct} / {gradingSummary.ai.total} 题正确</p></div>{gradingSummary.parentReviewed ? <div className="amy-score-line parent"><span>家长批改</span><strong>{gradingSummary.parent.score}<small> / 100</small></strong><p>{gradingSummary.parent.correct} / {gradingSummary.parent.total} 题正确</p></div> : null}</div> : gradingProgress ? <div className={"amy-grading-progress " + gradingProgress.status}><span>AI逐题批改</span><strong>{progressCounts.done} / {progressCounts.total}</strong>{isGrading ? <p>正在批改第 {(gradingProgress.currentIndex ?? 0) + 1} 题{gradingProgress.currentAttempt > 1 ? `，第 ${gradingProgress.currentAttempt} 次尝试` : ""}</p> : <><p>批改在第 {(gradingProgress.failedIndex ?? 0) + 1} 题中断，已完成的结果都已保存。</p><button className="amy-primary" onClick={onContinue}>继续批改</button></>}</div> : <button className="amy-primary" disabled={isGrading} onClick={onSubmit}>提交并批改</button>}{parentSummary ? <div className="amy-parent-summary"><span>家长批改小结</span><strong>+{parentSummary.count} 题改对</strong><p>最新得分 {parentSummary.score}<small> / 100</small> · {parentSummary.correct}/{parentSummary.total} 题正确</p>{parentSummary.added?.length ? <><small>新增 {parentSummary.added.length} 条可接受答案，下次同样作答会自动判对。</small><button className="copy" onClick={onCopyAccepted}>{parentSummary.copied ? <><Check size={14} /> 已复制</> : <><ClipboardCopy size={14} /> 复制补充答案</>}</button></> : null}<button className="link" onClick={onDismissSummary}>关闭小结</button></div> : null}{done && !parentSummary && parent?.active ? <div className="amy-parent-bar"><div><span>家长批改中</span><strong>已选 {parent.flips.size} 题算对</strong></div><button className="primary" disabled={!parent.flips.size} onClick={parent.onSubmit}>完成批改</button><button onClick={parent.onCancel}>取消</button></div> : null}{done && !parentSummary && !parent?.active && allowParentEnter ? <button className="amy-parent-enter" onClick={onEnterParent}><PenLine size={16} /> 家长批改</button> : null}</aside>
  </main>;
}

function HistoryPage({ history, sortBy, onSortChange, onOpen, onExport, onImport, onSync, cloudStatus, isSyncing, lastSyncAt }) {
  const sortedHistory = useMemo(() => [...history].sort((left, right) => {
    if (sortBy === "session") {
      return Number(left.session) - Number(right.session)
        || new Date(right.completedAt || 0).getTime() - new Date(left.completedAt || 0).getTime();
    }
    return new Date(right.completedAt || 0).getTime() - new Date(left.completedAt || 0).getTime();
  }), [history, sortBy]);
  return <main className="amy-content"><div className="amy-heading"><div><span>EXAM ARCHIVE</span><h1>历史考试</h1></div><div className="amy-history-tools"><button onClick={onExport} disabled={!history.length}><Download size={15} />导出记录</button><label><Upload size={15} />导入记录<input type="file" accept="application/json,.json" onChange={(event) => { onImport(event.target.files?.[0]); event.target.value = ""; }} /></label><button className="cloud" onClick={onSync} disabled={isSyncing}><RefreshCw size={15} />{isSyncing ? "同步中" : "同步"}</button></div></div>
    <div className={`amy-cloud-status ${cloudStatus.type || ""}`}><RefreshCw size={15} /><span><strong>{cloudStatus.message}</strong><small>上次同步：{formatSyncTime(lastSyncAt)}</small></span></div>
    {history.length ? <><div className="amy-history-sort"><span><ArrowUpDown size={14} />排序</span><button className={sortBy === "submitted" ? "active" : ""} onClick={() => onSortChange("submitted")}>提交时间</button><button className={sortBy === "session" ? "active" : ""} onClick={() => onSortChange("session")}>第几次</button></div><div className="amy-history">{sortedHistory.map((item) => {
      const summary = gradingBreakdown(item);
      return <button key={item.id} className={summary.parentReviewed ? "parent-reviewed" : ""} onClick={() => onOpen(item)}><span className="amy-history-session">第 {item.session} 次</span><time>{new Date(item.completedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time><span className="amy-history-scores"><span>AI {summary.ai.score} 分</span>{summary.parentReviewed ? <strong>家长 {summary.parent.score} 分</strong> : null}</span><span className={"amy-history-review-state " + (summary.parentReviewed ? "done" : "ai-only")}>{summary.parentReviewed ? <><Check size={13} />家长已批改</> : "仅AI批改"}</span><ChevronRight size={17} /></button>;
    })}</div></> : <p className="amy-empty">完成一次考试后，成绩和错题会保存在这里。</p>}</main>;
}

export default function AmyVocabularyApp({ onBack, onOpenRewards, onOpenHomework }) {
  const [data, setData] = useState(AMY_VOCABULARY_MANIFEST);
  const [selected, setSelected] = useState(null);
  const [loadingSession, setLoadingSession] = useState(null);
  const [view, setView] = useState("home");
  const [exam, setExam] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [results, setResults] = useState(null);
  const [history, setHistory] = useState([]);
  const [historySort, setHistorySort] = useState("submitted");
  const [drafts, setDrafts] = useState({});
  const [storageReady, setStorageReady] = useState(false);
  const [record, setRecord] = useState(null);
  const [isGrading, setIsGrading] = useState(false);
  const [gradingProgress, setGradingProgress] = useState(null);
  const [preparingExam, setPreparingExam] = useState(false);
  const [acceptedAnswers, setAcceptedAnswers] = useState({});
  const [parentMode, setParentMode] = useState(false);
  const [parentFlips, setParentFlips] = useState(() => new Set());
  const [parentSummary, setParentSummary] = useState(null);
  const [githubToken, setGithubToken] = useState("");
  const [showGithubAccess, setShowGithubAccess] = useState(false);
  const [githubAccessError, setGithubAccessError] = useState("");
  const [isSavingGithubAccess, setIsSavingGithubAccess] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(() => window.localStorage.getItem(LAST_SYNC_KEY) || "");
  const [cloudStatus, setCloudStatus] = useState({ type: "", message: "点击同步获取其他设备的最新记录" });
  const session = useMemo(() => data?.sessions.find((item) => item.number === selected), [data, selected]);
  useEffect(() => {
    setHistory(readHistory());
    setDrafts(readDrafts());
    setAcceptedAnswers(readAcceptedAnswers());
    setGithubToken(window.localStorage.getItem(GITHUB_TOKEN_KEY) || "");
    setStorageReady(true);
  }, []);
  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history, storageReady]);
  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(ACCEPTED_KEY, JSON.stringify(acceptedAnswers));
  }, [acceptedAnswers, storageReady]);
  useEffect(() => {
    if (view !== "exam" || results || !session || !exam) return;
    const draft = { session: session.number, exam, elapsed, gradingProgress, savedAt: new Date().toISOString() };
    setDrafts((current) => {
      const next = { ...current, [session.number]: draft };
      window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
      return next;
    });
  }, [elapsed, exam, gradingProgress, results, session, view]);
  useEffect(() => { if (view !== "exam" || results || gradingProgress) return undefined; const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000); return () => window.clearInterval(timer); }, [gradingProgress, view, results]);
  const clearDraft = (sessionNumber) => setDrafts((current) => {
    const next = { ...current };
    delete next[sessionNumber];
    window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
    return next;
  });
  const selectSession = async (sessionNumber) => {
    setSelected(sessionNumber);
    const existing = data.sessions.find((item) => item.number === sessionNumber);
    if (Array.isArray(existing?.entries)) return;
    setLoadingSession(sessionNumber);
    try {
      const loadedSession = await fetchAmyVocabularySession(sessionNumber);
      setData((current) => ({
        ...current,
        sessions: current.sessions.map((item) => item.number === sessionNumber ? loadedSession : item)
      }));
    } catch (reason) {
      window.alert(reason.message || "资料加载失败，请稍后重试");
    } finally {
      setLoadingSession((current) => current === sessionNumber ? null : current);
    }
  };
  const start = async () => {
    if (!session?.entries.length) return;
    const draft = drafts[session.number];
    if (isDraftCompatible(draft, session)) {
      const restoredExam = prepareExam(draft.exam);
      setExam(restoredExam);
      setElapsed(Number(draft.elapsed) || 0);
      setResults(null);
      setGradingProgress(draft.gradingProgress ? {
        ...createGradingProgress(restoredExam, draft.gradingProgress),
        status: "interrupted",
        failedIndex: draft.gradingProgress.failedIndex ?? draft.gradingProgress.currentIndex ?? null,
        error: draft.gradingProgress.error || "上次批改尚未完成"
      } : null);
      setView("exam");
      return;
    }
    setPreparingExam(true);
    try {
      if (draft) clearDraft(session.number);
      const previous = history.find((item) => item.session === session.number)?.exam?.signature || "";
      const base = createAmyExam(session, previous);
      const cloze = await filterClozeByAi(base.cloze, 12);
      setExam({ ...base, cloze });
      setElapsed(0);
      setResults(null);
      setGradingProgress(null);
      setView("exam");
    } finally {
      setPreparingExam(false);
    }
  };
  const restart = async () => {
    if (!session?.entries.length) return;
    clearDraft(session.number);
    setPreparingExam(true);
    try {
      const previous = history.find((item) => item.session === session.number)?.exam?.signature || "";
      const base = createAmyExam(session, previous);
      const cloze = await filterClozeByAi(base.cloze, 12);
      setExam({ ...base, cloze });
      setElapsed(0);
      setResults(null);
      setGradingProgress(null);
      setView("exam");
    } finally {
      setPreparingExam(false);
    }
  };
  const persistGradingProgress = (readyExam, nextProgress) => {
    setGradingProgress(nextProgress);
    const draft = { session: session.number, exam: readyExam, elapsed, gradingProgress: nextProgress, savedAt: new Date().toISOString() };
    setDrafts((current) => {
      const next = { ...current, [session.number]: draft };
      window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
      return next;
    });
  };
  const completeExam = (readyExam, outcome, progress) => {
    setExam(readyExam);
    setResults(outcome);
    setGradingProgress(null);
    clearDraft(session.number);
    const completedRecord = {
      id: String(Date.now()) + Math.random().toString(36).slice(2, 7),
      completedAt: new Date().toISOString(),
      session: session.number,
      elapsed,
      exam: readyExam,
      results: outcome,
      gradingVersion: GRADING_VERSION,
      gradingAudit: {
        provider: progress.auditItems[0]?.provider || "xiaomi-mimo",
        model: progress.auditItems[0]?.model || "",
        startedAt: progress.startedAt,
        completedAt: progress.completedAt,
        itemCount: progress.auditItems.length,
        items: progress.auditItems
      }
    };
    setHistory((current) => mergeHistory([completedRecord], current));
    const token = window.localStorage.getItem(GITHUB_TOKEN_KEY) || "";
    if (token) {
      setCloudStatus({ type: "loading", message: "正在把本次考试保存到云端" });
      uploadGithubExamLog(completedRecord, token)
        .then(() => setCloudStatus({ type: "success", message: "本次考试已保存到云端" }))
        .catch(() => setCloudStatus({ type: "error", message: "本次考试已保存在设备中，请到历史页重新上传" }));
    } else {
      setGithubAccessError("");
      setShowGithubAccess(true);
    }
  };
  const submit = async () => {
    if (isGrading) return;
    setIsGrading(true);
    const readyExam = prepareExam(exam);
    setExam(readyExam);
    try {
      const outcome = await gradeExamOneByOne(readyExam, acceptedAnswers, gradingProgress, (progress) => persistGradingProgress(readyExam, progress));
      if (outcome.status === "complete") completeExam(readyExam, outcome.results, outcome.progress);
    } finally {
      setIsGrading(false);
    }
  };
  const exportHistory = () => {
    if (!history.length) return;
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), history }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `amy-engmate-exam-history-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const importHistory = async (file) => {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const imported = Array.isArray(payload) ? payload : payload.history;
      if (!Array.isArray(imported)) throw new Error("invalid history");
      setHistory((current) => mergeHistory(imported, current));
    } catch {
      window.alert("这个文件不是有效的 Amy 考试记录。");
    }
  };
  const syncHistory = async (tokenOverride = "") => {
    const token = tokenOverride || githubToken || window.localStorage.getItem(GITHUB_TOKEN_KEY) || "";
    if (isUploading) return;
    setIsUploading(true);
    setCloudStatus({ type: "loading", message: "同步中，正在读取云端记录" });
    try {
      const [cloudHistory, cloudAccepted] = await Promise.all([
        loadGithubExamLogs(token),
        loadGithubAcceptedAnswers(token)
      ]);
      const mergedHistory = mergeHistory(cloudHistory, history);
      const mergedAccepted = mergeAcceptedAnswers(acceptedAnswers, cloudAccepted);
      const pendingRecords = recordsNeedingUpload(history, cloudHistory);
      const acceptedNeedUpload = Object.entries(acceptedAnswers).some(([id, values]) =>
        values.some((value) => !(cloudAccepted[id] || []).includes(value))
      );

      setHistory(mergedHistory);
      setAcceptedAnswers(mergedAccepted);

      if ((pendingRecords.length || acceptedNeedUpload) && !token) {
        const pendingMessage = pendingRecords.length
          ? `有 ${pendingRecords.length} 份本机考试记录尚未上传`
          : "有本机批改内容尚未上传";
        setCloudStatus({
          type: "error",
          message: `已读取云端，但${pendingMessage}`
        });
        setGithubAccessError("");
        setShowGithubAccess(true);
        return;
      }

      for (let index = 0; index < pendingRecords.length; index += 1) {
        setCloudStatus({ type: "loading", message: `同步中，正在保存第 ${index + 1} / ${pendingRecords.length} 份记录` });
        await uploadGithubExamLog(pendingRecords[index], token);
      }
      if (acceptedNeedUpload) {
        setCloudStatus({ type: "loading", message: "同步中，正在保存批改规则" });
        const savedAccepted = await uploadGithubAcceptedAnswers(mergedAccepted, token);
        setAcceptedAnswers(savedAccepted);
      }

      const completedAt = new Date().toISOString();
      window.localStorage.setItem(LAST_SYNC_KEY, completedAt);
      setLastSyncAt(completedAt);
      setCloudStatus({ type: "success", message: `同步完成，共 ${mergedHistory.length} 份考试记录` });
    } catch (reason) {
      setCloudStatus({ type: "error", message: reason.message || "同步失败，本机记录仍然保留" });
      if (/授权|权限|Token|上传代码/.test(reason.message || "")) {
        setGithubAccessError(reason.message);
        setShowGithubAccess(true);
      }
    } finally {
      setIsUploading(false);
    }
  };
  const saveGithubAccess = async (token) => {
    setIsSavingGithubAccess(true);
    setGithubAccessError("");
    try {
      await verifyGithubWriteToken(token);
      window.localStorage.setItem(GITHUB_TOKEN_KEY, token);
      setGithubToken(token);
      setShowGithubAccess(false);
      await syncHistory(token);
    } catch (reason) {
      setGithubAccessError(reason.message || "无法验证上传代码");
    } finally {
      setIsSavingGithubAccess(false);
    }
  };
  const clearGithubAccess = () => {
    window.localStorage.removeItem(GITHUB_TOKEN_KEY);
    setGithubToken("");
    setGithubAccessError("");
    setShowGithubAccess(false);
    setCloudStatus({ type: "", message: "已清除这台设备上的上传代码" });
  };
  const enterParent = () => {
    if (!record?.results) return;
    setParentFlips(new Set());
    setParentSummary(null);
    setParentMode(true);
  };
  const cancelParent = () => {
    setParentMode(false);
    setParentFlips(new Set());
  };
  const toggleFlip = (index) => setParentFlips((current) => {
    const next = new Set(current);
    if (next.has(index)) next.delete(index); else next.add(index);
    return next;
  });
  const submitParentGrading = async () => {
    if (!record?.results) { setParentMode(false); return; }
    const flips = parentFlips;
    if (!flips.size) { setParentMode(false); return; }
    const meanings = record.results.meanings.map((item, index) => (flips.has(index) ? { ...item, correct: true, parentCorrected: true } : item));
    const newResults = recomputeScore({ ...record.results, meanings });
    const now = new Date().toISOString();
    const originalAi = gradingBreakdown(record).ai;
    const gradedItems = [...flips]
      .map((index) => {
        const source = record.exam?.meanings?.[index];
        return source ? { id: source.id, term: source.term, answer: source.answer, displayNumber: source.displayNumber } : null;
      })
      .filter((item) => item && item.id && item.answer && String(item.answer).trim());
    const updatedRecord = { ...record, results: newResults, aiGrading: originalAi, regradedAt: now, parentGradedAt: now, parentGraded: gradedItems };

    // 把本次改对的作答并入接受答案表；上传时再与云端取并集，保证多端新增不互相覆盖。
    let nextAccepted = acceptedAnswers;
    const added = [];
    if (gradedItems.length) {
      nextAccepted = { ...acceptedAnswers };
      gradedItems.forEach(({ id, answer, term }) => {
        const existing = nextAccepted[id] || [];
        if (!existing.includes(answer)) {
          nextAccepted[id] = [...existing, answer];
          added.push({ id, term, answer });
        }
      });
      setAcceptedAnswers(nextAccepted);
    }

    setRecord(updatedRecord);
    setHistory((current) => mergeHistory([updatedRecord], current));
    setParentMode(false);
    setParentFlips(new Set());
    setParentSummary({ count: gradedItems.length, added, score: newResults.score, correct: newResults.correct, total: newResults.total });

    const token = window.localStorage.getItem(GITHUB_TOKEN_KEY) || "";
    if (!token) {
      setGithubAccessError("");
      setShowGithubAccess(true);
      return;
    }
    setCloudStatus({ type: "loading", message: "正在把批改结果保存到云端" });
    try {
      await uploadGithubExamLog(updatedRecord, token);
      if (gradedItems.length) {
        const merged = await uploadGithubAcceptedAnswers(nextAccepted, token);
        setAcceptedAnswers(merged);
      }
      setCloudStatus({ type: "success", message: "批改结果与补充答案已保存到云端" });
    } catch (reason) {
      setCloudStatus({ type: "error", message: reason.message || "批改已保存在设备中，请到历史页重新上传" });
      if (/授权|权限|Token|上传代码/.test(reason.message || "")) {
        setGithubAccessError(reason.message);
        setShowGithubAccess(true);
      }
    }
  };
  const copyAcceptedText = async () => {
    if (!parentSummary?.added?.length) return;
    const date = new Date().toLocaleDateString("zh-CN");
    const lines = parentSummary.added.map((item, index) => `${index + 1}. ${item.term} —— 补充接受：${item.answer}`);
    const text = `# Amy 英语批改·补充接受答案（${date}）\n说明：以下中文作答在“英译中”题中视为正确。\n\n${lines.join("\n")}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("复制补充答案文本", text);
    }
    setParentSummary((current) => (current ? { ...current, copied: true } : current));
  };
  const back = () => {
    if (parentMode) { cancelParent(); return; }
    if (view === "home") onBack?.();
    else if (view === "historyDetail") { setView("history"); setParentSummary(null); }
    else setView("home");
  };
  const archivedSession = record ? data.sessions.find((item) => item.number === record.session) : null;
  return <div className="amy-app"><header>{view === "home" && !onBack ? <span className="amy-header-spacer" /> : <button aria-label="返回" onClick={back}><ArrowLeft size={19} /></button>}<div><span>AMY VOCABULARY</span><strong>五年级英语词汇 · 复习与考试</strong></div><nav className="amy-header-actions"><button aria-label="考试历史" className="amy-history-button" onClick={() => setView("history")}><History size={16} /><span>历史</span></button>{onOpenRewards ? <button aria-label="奖励系统" className="amy-history-button" onClick={onOpenRewards}><Gift size={16} /><span>奖励</span></button> : null}{onOpenHomework ? <button aria-label="作业发布" className="amy-history-button" onClick={onOpenHomework}><Images size={16} /><span>作业</span></button> : null}</nav></header>
    {preparingExam ? <PreparingExam /> : <>{view === "home" ? <SessionPicker data={data} selected={selected} drafts={drafts} loadingSession={loadingSession} onSelect={selectSession} onView={setView} onStart={start} /> : null}
    {view === "review" && session ? <Review session={session} /> : null}
    {view === "exam" && session && exam ? <><Paper session={session} exam={exam} setExam={setExam} elapsed={elapsed} results={results} gradingProgress={gradingProgress} onSubmit={submit} onContinue={submit} isGrading={isGrading} />{results ? <button className="amy-retry" onClick={restart}><RotateCcw size={16} /> 再考一套</button> : null}</> : null}
    {view === "history" ? <HistoryPage history={history} sortBy={historySort} onSortChange={setHistorySort} onOpen={(item) => { setRecord(item); setSelected(item.session); setParentMode(false); setParentFlips(new Set()); setParentSummary(null); setView("historyDetail"); }} onExport={exportHistory} onImport={importHistory} onSync={() => syncHistory()} cloudStatus={cloudStatus} isSyncing={isUploading} lastSyncAt={lastSyncAt} /> : null}
    {view === "historyDetail" && record && archivedSession ? <Paper session={archivedSession} exam={record.exam} setExam={() => {}} elapsed={record.elapsed} results={record.results} grading={gradingBreakdown(record)} onSubmit={() => {}} allowParentEnter onEnterParent={enterParent} parent={parentMode ? { active: true, flips: parentFlips, onToggle: toggleFlip, onSubmit: submitParentGrading, onCancel: cancelParent } : null} parentSummary={parentSummary} onCopyAccepted={copyAcceptedText} onDismissSummary={() => setParentSummary(null)} /> : null}
    </>}{showGithubAccess ? <GithubCodeDialog initialToken={githubToken} isSaving={isSavingGithubAccess} error={githubAccessError} onClose={() => setShowGithubAccess(false)} onSave={saveGithubAccess} onClear={clearGithubAccess} /> : null}
  </div>;
}
