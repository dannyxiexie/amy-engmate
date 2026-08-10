"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpen, Check, CheckCircle2, ChevronRight, ClipboardCopy, Clock3, CloudUpload, Download, Gift, GraduationCap, History, Images, PenLine, RotateCcw, Upload, X } from "lucide-react";
import { AMY_VOCABULARY_MANIFEST, createAmyExam, createClozePrompt, fetchAmyVocabularySession, formatTime, gradeMeaning, hideTermInExample, matchesAcceptedAnswer, recomputeScore } from "./amyVocabularyData.js";
import { GITHUB_TOKEN_KEY, loadGithubAcceptedAnswers, loadGithubExamLogs, mergeAcceptedAnswers, uploadGithubAcceptedAnswers, uploadGithubExamLog, verifyGithubWriteToken } from "./githubExamLogs.js";
import GithubCodeDialog from "./GithubCodeDialog.jsx";
import "./amyVocabulary.css";

const HISTORY_KEY = "family-reader:amy-grade-5-vocabulary:exam-history:v1";
const DRAFTS_KEY = "family-reader:amy-grade-5-vocabulary:exam-drafts:v1";
const ACCEPTED_KEY = "family-reader:amy-grade-5-vocabulary:accepted-answers:v1";
const GRADING_VERSION = 5;
const GRADING_API_URL = import.meta.env.VITE_GRADING_API_URL || "https://grade.dannyxiexie.tech";

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

async function gradeExam(exam, acceptedAnswers = {}) {
  const meanings = exam.meanings.map((item) => ({
    id: item.id,
    correct: gradeMeaning(item.answer, item.meaningZh),
    answer: item.meaningZh
  }));
  const semanticItems = exam.meanings
    .filter((item) => item.answer.trim())
    .map((item) => ({
      id: item.id,
      term: item.term,
      expected: item.meaningZh,
      accepted: item.acceptedMeaningsZh || [],
      answer: item.answer
    }));

  if (semanticItems.length && GRADING_API_URL) {
    try {
      const response = await fetch(GRADING_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(import.meta.env.VITE_APP_KEY ? { "X-App-Key": import.meta.env.VITE_APP_KEY } : {})
        },
        body: JSON.stringify({ items: semanticItems })
      });
      if (!response.ok) throw new Error("grading request failed");
      const payload = await response.json();
      const semanticResults = new Map((payload.results || []).map((item) => [item.id, Boolean(item.correct)]));
      meanings.forEach((item) => {
        if (semanticResults.has(item.id)) item.correct = item.correct || semanticResults.get(item.id);
      });
    } catch {
      // The clear local matches still count if the local AI is temporarily unavailable.
    }
  }

  // 家长批改沉淀下来的接受答案：同一条目（id 全局稳定）若本次作答命中已接受的写法，直接判对。
  // 这是静态站上让批改"越用越准"的关键一层，等价于持续更新的批改提示词。
  exam.meanings.forEach((source, index) => {
    const accepted = acceptedAnswers[source.id];
    if (accepted?.length && matchesAcceptedAnswer(source.answer, accepted)) {
      meanings[index].correct = true;
    }
  });

  const cloze = exam.cloze.map((item) => ({ correct: item.answer === item.term, answer: item.term }));
  const correct = [...meanings, ...cloze].filter((item) => item.correct).length;
  const total = meanings.length + cloze.length;
  return { meanings, cloze, correct, total, score: total ? Math.round(correct / total * 100) : 0 };
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
        headers: { "Content-Type": "application/json", ...(import.meta.env.VITE_APP_KEY ? { "X-App-Key": import.meta.env.VITE_APP_KEY } : {}) },
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

function Result({ correct, answer }) {
  return <div className={"amy-result " + (correct ? "correct" : "wrong")}>{correct ? <><CheckCircle2 size={16} /> 正确</> : <><X size={16} /> 正确答案：{answer}</>}</div>;
}

function Paper({ session, exam, setExam, elapsed, results, onSubmit, isGrading = false, parent = null, allowParentEnter = false, onEnterParent, parentSummary = null, onCopyAccepted, onDismissSummary }) {
  const [section, setSection] = useState("meanings");
  const [resultFilter, setResultFilter] = useState("all");
  const done = Boolean(results);
  const answered = exam.meanings.filter((item) => item.answer.trim()).length + exam.cloze.filter((item) => item.answer).length;
  const total = exam.meanings.length + exam.cloze.length;
  const updateMeaning = (index, answer) => setExam((current) => ({ ...current, meanings: current.meanings.map((item, itemIndex) => itemIndex === index ? { ...item, answer } : item) }));
  const updateCloze = (index, answer) => setExam((current) => ({ ...current, cloze: current.cloze.map((item, itemIndex) => itemIndex === index ? { ...item, answer } : item) }));
  const meaningQuestions = exam.meanings
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => !done || resultFilter === "all" || !results.meanings[index]?.correct);
  const clozeQuestions = exam.cloze
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => !done || resultFilter === "all" || !results.cloze[index]?.correct);
  return <main className="amy-exam-layout">
    <section className="amy-paper"><div className="amy-exam-head"><div><span>第 {session.number} 次</span><h1>{done ? "批改结果" : "全量词汇测试"}</h1></div><strong>{answered} / {total} 已作答</strong></div>
      <nav className="amy-tabs"><button className={section === "meanings" ? "active" : ""} onClick={() => setSection("meanings")}>1 英译中 <small>{exam.meanings.filter((item) => item.answer.trim()).length}/{exam.meanings.length}</small></button><button className={section === "cloze" ? "active" : ""} onClick={() => setSection("cloze")}>2 例句选词 <small>{exam.cloze.filter((item) => item.answer).length}/{exam.cloze.length}</small></button></nav>
      {parent?.active ? <p className="amy-parent-hint">家长批改模式：把该算对的“英译中”错题点为对，完成后重算分数；例句选词为客观题，不参与批改。</p> : null}
      {done ? <div className="amy-result-filter" aria-label="批改结果筛选"><span>查看</span><button className={resultFilter === "all" ? "active" : ""} onClick={() => setResultFilter("all")}>全部</button><button className={resultFilter === "wrong" ? "active" : ""} onClick={() => setResultFilter("wrong")}>只看错题</button></div> : null}
      <div className="amy-questions">{section === "meanings" ? meaningQuestions.map(({ item, index }) => {
        const result = results?.meanings[index];
        const flipped = parent?.active && parent.flips.has(index);
        const canMark = parent?.active && result && !result.correct && Boolean(item.answer?.trim());
        return <article key={item.id} className="amy-question"><span>{item.displayNumber}</span><div><label>{item.term}</label><input value={item.answer} disabled={done || isGrading} onChange={(event) => updateMeaning(index, event.target.value)} placeholder="写中文含义" autoComplete="off" />{flipped ? <div className="amy-result correct"><CheckCircle2 size={16} /> 家长判对</div> : result ? <Result {...result} /> : null}{canMark ? <button type="button" className={"amy-mark-correct" + (flipped ? " active" : "")} onClick={() => parent.onToggle(index)}><Check size={15} /> {flipped ? "取消算对" : "这题算对"}</button> : null}</div></article>;
      }) : clozeQuestions.map(({ item, index }) => <article key={item.id} className="amy-question"><span>{index + 1}</span><div><label>{item.prompt || hideTermInExample(item.example, item.term)}</label><div className="amy-options">{item.choices.map((choice) => <button key={choice} disabled={done || isGrading} onClick={() => updateCloze(index, choice)} className={item.answer === choice ? "selected" : ""}>{choice}</button>)}</div>{results?.cloze[index] ? <Result {...results.cloze[index]} /> : null}</div></article>)}</div>
    </section>
    <aside className="amy-aside"><div className="amy-timer"><Clock3 size={17} /><div><span>用时</span><strong>{formatTime(elapsed)}</strong>{!done ? <small>已自动保存</small> : null}</div></div>{done ? <div className="amy-score"><span>本次得分</span><strong>{results.score}<small> / 100</small></strong><p>{results.correct} / {results.total} 题正确</p></div> : <button className="amy-primary" disabled={isGrading} onClick={onSubmit}>{isGrading ? "正在理解答案" : "提交并批改"}</button>}{parentSummary ? <div className="amy-parent-summary"><span>家长批改小结</span><strong>+{parentSummary.count} 题改对</strong><p>最新得分 {parentSummary.score}<small> / 100</small> · {parentSummary.correct}/{parentSummary.total} 题正确</p>{parentSummary.added?.length ? <><small>新增 {parentSummary.added.length} 条可接受答案，下次同样作答会自动判对。</small><button className="copy" onClick={onCopyAccepted}>{parentSummary.copied ? <><Check size={14} /> 已复制</> : <><ClipboardCopy size={14} /> 复制补充答案</>}</button></> : null}<button className="link" onClick={onDismissSummary}>关闭小结</button></div> : null}{done && !parentSummary && parent?.active ? <div className="amy-parent-bar"><div><span>家长批改中</span><strong>已选 {parent.flips.size} 题算对</strong></div><button className="primary" disabled={!parent.flips.size} onClick={parent.onSubmit}>完成批改</button><button onClick={parent.onCancel}>取消</button></div> : null}{done && !parentSummary && !parent?.active && allowParentEnter ? <button className="amy-parent-enter" onClick={onEnterParent}><PenLine size={16} /> 家长批改</button> : null}</aside>
  </main>;
}

function HistoryPage({ history, onOpen, onExport, onImport, onUpload, cloudStatus, isUploading }) {
  return <main className="amy-content"><div className="amy-heading"><div><span>EXAM ARCHIVE</span><h1>历史考试</h1></div><div className="amy-history-tools"><button onClick={onExport} disabled={!history.length}><Download size={15} />导出记录</button><label><Upload size={15} />导入记录<input type="file" accept="application/json,.json" onChange={(event) => { onImport(event.target.files?.[0]); event.target.value = ""; }} /></label><button className="cloud" onClick={onUpload} disabled={!history.length || isUploading}><CloudUpload size={15} />{isUploading ? "正在上传" : "上传记录"}</button></div></div>
    {cloudStatus.message ? <div className={`amy-cloud-status ${cloudStatus.type || ""}`}><CloudUpload size={15} /><span>{cloudStatus.message}</span></div> : null}
    {history.length ? <div className="amy-history">{history.map((item) => <button key={item.id} onClick={() => onOpen(item)}><span>第 {item.session} 次</span><span>{new Date(item.completedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span><strong>{item.results.score} 分</strong><ChevronRight size={17} /></button>)}</div> : <p className="amy-empty">完成一次考试后，成绩和错题会保存在这里。</p>}</main>;
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
  const [drafts, setDrafts] = useState({});
  const [storageReady, setStorageReady] = useState(false);
  const [record, setRecord] = useState(null);
  const [isGrading, setIsGrading] = useState(false);
  const [preparingExam, setPreparingExam] = useState(false);
  const [acceptedAnswers, setAcceptedAnswers] = useState({});
  const [parentMode, setParentMode] = useState(false);
  const [parentFlips, setParentFlips] = useState(() => new Set());
  const [parentSummary, setParentSummary] = useState(null);
  // 自动重批 effect 用 ref 读最新接受答案，避免把它加进依赖导致反复触发。
  const acceptedRef = useRef({});
  acceptedRef.current = acceptedAnswers;
  const [githubToken, setGithubToken] = useState("");
  const [showGithubAccess, setShowGithubAccess] = useState(false);
  const [githubAccessError, setGithubAccessError] = useState("");
  const [isSavingGithubAccess, setIsSavingGithubAccess] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [cloudStatus, setCloudStatus] = useState({ type: "", message: "打开历史时会自动同步云端记录" });
  const regradedRecords = useRef(new Set());
  const session = useMemo(() => data?.sessions.find((item) => item.number === selected), [data, selected]);
  useEffect(() => {
    setHistory(readHistory());
    setDrafts(readDrafts());
    setAcceptedAnswers(readAcceptedAnswers());
    setGithubToken(window.localStorage.getItem(GITHUB_TOKEN_KEY) || "");
    setStorageReady(true);
  }, []);
  useEffect(() => {
    if (!storageReady || view !== "history" || cloudLoaded) return;
    let cancelled = false;
    const token = window.localStorage.getItem(GITHUB_TOKEN_KEY) || "";
    const localHistory = readHistory();
    loadGithubExamLogs(token)
      .then(async (cloudHistory) => {
        if (cancelled) return;
        setHistory((current) => mergeHistory(cloudHistory, current));
        const pendingRecords = recordsNeedingUpload(localHistory, cloudHistory);
        if (pendingRecords.length && !token) {
          setCloudStatus({
            type: "error",
            message: `有 ${pendingRecords.length} 份考试只保存在这台设备，需要上传代码才能同步`
          });
          setGithubAccessError("");
          setShowGithubAccess(true);
          return;
        }
        if (pendingRecords.length) {
          setCloudStatus({ type: "loading", message: `发现 ${pendingRecords.length} 份未同步记录，正在自动补传` });
          try {
            for (const record of pendingRecords) await uploadGithubExamLog(record, token);
            if (cancelled) return;
            setCloudStatus({
              type: "success",
              message: `${mergeHistory(cloudHistory, localHistory).length} 份考试记录已全部同步`
            });
            setCloudLoaded(true);
          } catch (reason) {
            if (cancelled) return;
            setCloudStatus({
              type: "error",
              message: `${pendingRecords.length} 份记录仍只在这台设备，稍后打开会自动重试`
            });
            if (/授权|权限|Token/.test(reason.message || "")) {
              setGithubAccessError(reason.message);
              setShowGithubAccess(true);
            }
          }
          return;
        }
        setCloudStatus({
          type: "success",
          message: cloudHistory.length ? `已从 GitHub 同步 ${cloudHistory.length} 份考试记录` : "GitHub 中还没有考试记录"
        });
        setCloudLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setCloudStatus({ type: "error", message: "暂时无法读取 GitHub 记录，本地历史不受影响" });
      });
    return () => { cancelled = true; };
  }, [cloudLoaded, storageReady, view]);
  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history, storageReady]);
  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(ACCEPTED_KEY, JSON.stringify(acceptedAnswers));
  }, [acceptedAnswers, storageReady]);
  // 进入历史页时顺带把云端接受答案拉下来与本地取并集，让多端家长批改互相共享。
  useEffect(() => {
    if (!storageReady || view !== "history") return;
    let cancelled = false;
    const token = window.localStorage.getItem(GITHUB_TOKEN_KEY) || "";
    if (!token) return;
    loadGithubAcceptedAnswers(token)
      .then((remote) => {
        if (cancelled || !remote) return;
        setAcceptedAnswers((current) => {
          const merged = mergeAcceptedAnswers(current, remote);
          return JSON.stringify(merged) === JSON.stringify(current) ? current : merged;
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [storageReady, view]);
  useEffect(() => {
    if (!storageReady) return;
    const latest = history[0];
    if (!latest?.exam || latest.gradingVersion >= GRADING_VERSION || regradedRecords.current.has(latest.id)) return;
    regradedRecords.current.add(latest.id);
    gradeExam(prepareExam(latest.exam), acceptedRef.current).then((outcome) => {
      setHistory((current) => current.map((item) => item.id === latest.id ? {
        ...item,
        exam: prepareExam(item.exam),
        results: outcome,
        gradingVersion: GRADING_VERSION,
        regradedAt: new Date().toISOString()
      } : item));
      setRecord((current) => current?.id === latest.id ? { ...current, exam: prepareExam(current.exam), results: outcome, gradingVersion: GRADING_VERSION } : current);
    });
  }, [history, storageReady]);
  useEffect(() => {
    if (view !== "exam" || results || !session || !exam) return;
    const draft = { session: session.number, exam, elapsed, savedAt: new Date().toISOString() };
    setDrafts((current) => {
      const next = { ...current, [session.number]: draft };
      window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
      return next;
    });
  }, [elapsed, exam, results, session, view]);
  useEffect(() => { if (view !== "exam" || results) return undefined; const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000); return () => window.clearInterval(timer); }, [view, results]);
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
      setExam(prepareExam(draft.exam));
      setElapsed(Number(draft.elapsed) || 0);
      setResults(null);
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
      setView("exam");
    } finally {
      setPreparingExam(false);
    }
  };
  const submit = async () => {
    if (isGrading) return;
    setIsGrading(true);
    const readyExam = prepareExam(exam);
    const outcome = await gradeExam(readyExam, acceptedAnswers);
    setExam(readyExam);
    setResults(outcome);
    clearDraft(session.number);
    const completedRecord = { id: String(Date.now()) + Math.random().toString(36).slice(2, 7), completedAt: new Date().toISOString(), session: session.number, elapsed, exam: readyExam, results: outcome, gradingVersion: GRADING_VERSION };
    setHistory((current) => mergeHistory([completedRecord], current));
    setIsGrading(false);
    const token = window.localStorage.getItem(GITHUB_TOKEN_KEY) || "";
    if (token) {
      setCloudStatus({ type: "loading", message: "正在把本次考试保存到 GitHub" });
      uploadGithubExamLog(completedRecord, token)
        .then(() => setCloudStatus({ type: "success", message: "本次考试已保存到 GitHub" }))
        .catch(() => setCloudStatus({ type: "error", message: "本次考试已保存在设备中，请到历史页重新上传" }));
    } else {
      setGithubAccessError("");
      setShowGithubAccess(true);
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
  const uploadHistory = async (tokenOverride = "") => {
    const token = tokenOverride || githubToken || window.localStorage.getItem(GITHUB_TOKEN_KEY) || "";
    if (!token) {
      setGithubAccessError("");
      setShowGithubAccess(true);
      return;
    }
    if (!history.length || isUploading) return;
    setIsUploading(true);
    setCloudStatus({ type: "loading", message: `正在上传 ${history.length} 份考试记录` });
    try {
      for (let index = 0; index < history.length; index += 1) {
        setCloudStatus({ type: "loading", message: `正在上传第 ${index + 1} / ${history.length} 份记录` });
        await uploadGithubExamLog(history[index], token);
      }
      setCloudStatus({ type: "success", message: `已将 ${history.length} 份考试记录同步到 GitHub` });
      setCloudLoaded(true);
    } catch (reason) {
      setCloudStatus({ type: "error", message: reason.message || "上传失败，本地记录仍然保留" });
      if (/授权|权限|Token/.test(reason.message || "")) {
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
      await uploadHistory(token);
    } catch (reason) {
      setGithubAccessError(reason.message || "无法验证 GitHub 授权");
    } finally {
      setIsSavingGithubAccess(false);
    }
  };
  const clearGithubAccess = () => {
    window.localStorage.removeItem(GITHUB_TOKEN_KEY);
    setGithubToken("");
    setGithubAccessError("");
    setShowGithubAccess(false);
    setCloudStatus({ type: "", message: "已清除这台设备上的 GitHub 写入授权" });
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
    const gradedItems = [...flips]
      .map((index) => {
        const source = record.exam?.meanings?.[index];
        return source ? { id: source.id, term: source.term, answer: source.answer, displayNumber: source.displayNumber } : null;
      })
      .filter((item) => item && item.id && item.answer && String(item.answer).trim());
    const updatedRecord = { ...record, results: newResults, regradedAt: now, parentGradedAt: now, parentGraded: gradedItems };

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
    setCloudStatus({ type: "loading", message: "正在把批改结果保存到 GitHub" });
    try {
      await uploadGithubExamLog(updatedRecord, token);
      if (gradedItems.length) {
        const merged = await uploadGithubAcceptedAnswers(nextAccepted, token);
        setAcceptedAnswers(merged);
      }
      setCloudStatus({ type: "success", message: "批改结果与补充答案已保存到 GitHub" });
    } catch (reason) {
      setCloudStatus({ type: "error", message: reason.message || "批改已保存在设备中，请到历史页重新上传" });
      if (/授权|权限|Token/.test(reason.message || "")) {
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
    {view === "exam" && session && exam ? <><Paper session={session} exam={exam} setExam={setExam} elapsed={elapsed} results={results} onSubmit={submit} isGrading={isGrading} />{results ? <button className="amy-retry" onClick={restart}><RotateCcw size={16} /> 再考一套</button> : null}</> : null}
    {view === "history" ? <HistoryPage history={history} onOpen={(item) => { setRecord(item); setSelected(item.session); setParentMode(false); setParentFlips(new Set()); setParentSummary(null); setView("historyDetail"); }} onExport={exportHistory} onImport={importHistory} onUpload={() => uploadHistory()} cloudStatus={cloudStatus} isUploading={isUploading} /> : null}
    {view === "historyDetail" && record && archivedSession ? <Paper session={archivedSession} exam={record.exam} setExam={() => {}} elapsed={record.elapsed} results={record.results} onSubmit={() => {}} allowParentEnter onEnterParent={enterParent} parent={parentMode ? { active: true, flips: parentFlips, onToggle: toggleFlip, onSubmit: submitParentGrading, onCancel: cancelParent } : null} parentSummary={parentSummary} onCopyAccepted={copyAcceptedText} onDismissSummary={() => setParentSummary(null)} /> : null}
    </>}{showGithubAccess ? <GithubCodeDialog initialToken={githubToken} isSaving={isSavingGithubAccess} error={githubAccessError} onClose={() => setShowGithubAccess(false)} onSave={saveGithubAccess} onClear={clearGithubAccess} /> : null}
  </div>;
}
