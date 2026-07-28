"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpen, Check, CheckCircle2, ChevronRight, Clock3, GraduationCap, History, RotateCcw, X } from "lucide-react";
import { createAmyExam, createClozePrompt, fetchAmyVocabulary, formatTime, gradeMeaning, hideTermInExample } from "./amyVocabularyData.js";
import "./amyVocabulary.css";

const HISTORY_KEY = "family-reader:amy-grade-5-vocabulary:exam-history:v1";
const DRAFTS_KEY = "family-reader:amy-grade-5-vocabulary:exam-drafts:v1";
const GRADING_VERSION = 5;
const GRADING_API_URL = import.meta.env.VITE_GRADING_API_URL || "";

function readHistory() {
  if (typeof window === "undefined") return [];
  try {
    const data = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(data) ? data.slice(0, 18) : [];
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

async function gradeExam(exam) {
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
        headers: { "Content-Type": "application/json" },
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

  const cloze = exam.cloze.map((item) => ({ correct: item.answer === item.term, answer: item.term }));
  const correct = [...meanings, ...cloze].filter((item) => item.correct).length;
  const total = meanings.length + cloze.length;
  return { meanings, cloze, correct, total, score: total ? Math.round(correct / total * 100) : 0 };
}

function SessionPicker({ data, selected, drafts, onSelect, onView, onStart }) {
  const current = data.sessions.find((item) => item.number === selected);
  const hasDraft = current && isDraftCompatible(drafts[current.number], current);
  return <main className="amy-home">
    <div className="amy-title"><span>AMY · GRADE 5 VOCABULARY</span><h1>{data.title}</h1><p>选择第几次，先复习中文和例句，再完成覆盖全部学习项的测试。</p></div>
    <section className="amy-session-grid">
      {data.sessions.map((session) => <button key={session.number} disabled={!session.available} onClick={() => session.available && onSelect(session.number)} className={selected === session.number ? "selected" : ""}>
        <span>第</span><strong>{session.number}</strong><span>次</span><small>{session.available ? session.itemCount + " 个学习项" : "资料待加入"}</small>{selected === session.number ? <Check size={18} /> : null}
      </button>)}
    </section>
    {current ? <section className="amy-mode-row">
      <button onClick={() => onView("review")}><BookOpen size={24} /><span><strong>复习</strong><small>英文、中文、例句和翻译</small></span><ChevronRight size={18} /></button>
      <button className="exam" onClick={onStart}><GraduationCap size={24} /><span><strong>{hasDraft ? "继续考试" : "考试"}</strong><small>{hasDraft ? "继续上次未提交的试卷" : "全量英译中，加例句选词"}</small></span><ChevronRight size={18} /></button>
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

function Paper({ session, exam, setExam, elapsed, results, onSubmit, isGrading = false }) {
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
      {done ? <div className="amy-result-filter" aria-label="批改结果筛选"><span>查看</span><button className={resultFilter === "all" ? "active" : ""} onClick={() => setResultFilter("all")}>全部</button><button className={resultFilter === "wrong" ? "active" : ""} onClick={() => setResultFilter("wrong")}>只看错题</button></div> : null}
      <div className="amy-questions">{section === "meanings" ? meaningQuestions.map(({ item, index }) => <article key={item.id} className="amy-question"><span>{item.displayNumber}</span><div><label>{item.term}</label><input value={item.answer} disabled={done || isGrading} onChange={(event) => updateMeaning(index, event.target.value)} placeholder="写中文含义" autoComplete="off" />{results?.meanings[index] ? <Result {...results.meanings[index]} /> : null}</div></article>) : clozeQuestions.map(({ item, index }) => <article key={item.id} className="amy-question"><span>{index + 1}</span><div><label>{item.prompt || hideTermInExample(item.example, item.term)}</label><div className="amy-options">{item.choices.map((choice) => <button key={choice} disabled={done || isGrading} onClick={() => updateCloze(index, choice)} className={item.answer === choice ? "selected" : ""}>{choice}</button>)}</div>{results?.cloze[index] ? <Result {...results.cloze[index]} /> : null}</div></article>)}</div>
    </section>
    <aside className="amy-aside"><div className="amy-timer"><Clock3 size={17} /><div><span>用时</span><strong>{formatTime(elapsed)}</strong>{!done ? <small>已自动保存</small> : null}</div></div>{done ? <div className="amy-score"><span>本次得分</span><strong>{results.score}<small> / 100</small></strong><p>{results.correct} / {results.total} 题正确</p></div> : <button className="amy-primary" disabled={isGrading} onClick={onSubmit}>{isGrading ? "正在理解答案" : "提交并批改"}</button>}</aside>
  </main>;
}

function HistoryPage({ history, onOpen }) {
  return <main className="amy-content"><div className="amy-heading"><div><span>EXAM ARCHIVE</span><h1>历史考试</h1></div></div>{history.length ? <div className="amy-history">{history.map((item) => <button key={item.id} onClick={() => onOpen(item)}><span>第 {item.session} 次</span><span>{new Date(item.completedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span><strong>{item.results.score} 分</strong><ChevronRight size={17} /></button>)}</div> : <p className="amy-empty">完成一次考试后，成绩和错题会保存在这里。</p>}</main>;
}

export default function AmyVocabularyApp({ onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState("home");
  const [exam, setExam] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [results, setResults] = useState(null);
  const [history, setHistory] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [storageReady, setStorageReady] = useState(false);
  const [record, setRecord] = useState(null);
  const [isGrading, setIsGrading] = useState(false);
  const regradedRecords = useRef(new Set());
  const session = useMemo(() => data?.sessions.find((item) => item.number === selected), [data, selected]);
  useEffect(() => { fetchAmyVocabulary().then(setData).catch((reason) => setError(reason.message)); }, []);
  useEffect(() => {
    setHistory(readHistory());
    setDrafts(readDrafts());
    setStorageReady(true);
  }, []);
  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history, storageReady]);
  useEffect(() => {
    if (!storageReady) return;
    const latest = history[0];
    if (!latest?.exam || latest.gradingVersion >= GRADING_VERSION || regradedRecords.current.has(latest.id)) return;
    regradedRecords.current.add(latest.id);
    gradeExam(prepareExam(latest.exam)).then((outcome) => {
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
  const start = () => {
    if (!session?.entries.length) return;
    const draft = drafts[session.number];
    if (isDraftCompatible(draft, session)) {
      setExam(prepareExam(draft.exam));
      setElapsed(Number(draft.elapsed) || 0);
      setResults(null);
      setView("exam");
      return;
    }
    if (draft) clearDraft(session.number);
    const previous = history.find((item) => item.session === session.number)?.exam?.signature || "";
    setExam(createAmyExam(session, previous));
    setElapsed(0);
    setResults(null);
    setView("exam");
  };
  const restart = () => {
    if (!session?.entries.length) return;
    clearDraft(session.number);
    const previous = history.find((item) => item.session === session.number)?.exam?.signature || "";
    setExam(createAmyExam(session, previous));
    setElapsed(0);
    setResults(null);
    setView("exam");
  };
  const submit = async () => {
    if (isGrading) return;
    setIsGrading(true);
    const readyExam = prepareExam(exam);
    const outcome = await gradeExam(readyExam);
    setExam(readyExam);
    setResults(outcome);
    clearDraft(session.number);
    setHistory((current) => [{ id: String(Date.now()) + Math.random().toString(36).slice(2, 7), completedAt: new Date().toISOString(), session: session.number, elapsed, exam: readyExam, results: outcome, gradingVersion: GRADING_VERSION }, ...current].slice(0, 18));
    setIsGrading(false);
  };
  const back = () => { if (view === "home") onBack?.(); else if (view === "historyDetail") setView("history"); else setView("home"); };
  if (error) return <main className="amy-loading">资料加载失败：{error}</main>;
  if (!data) return <main className="amy-loading">正在打开英语词汇复习</main>;
  const archivedSession = record ? data.sessions.find((item) => item.number === record.session) : null;
  return <div className="amy-app"><header>{view === "home" && !onBack ? <span className="amy-header-spacer" /> : <button aria-label="返回" onClick={back}><ArrowLeft size={19} /></button>}<div><span>AMY VOCABULARY</span><strong>五年级英语词汇 · 复习与考试</strong></div><button className="amy-history-button" onClick={() => setView("history")}><History size={16} /><span>历史</span></button></header>
    {view === "home" ? <SessionPicker data={data} selected={selected} drafts={drafts} onSelect={setSelected} onView={setView} onStart={start} /> : null}
    {view === "review" && session ? <Review session={session} /> : null}
    {view === "exam" && session && exam ? <><Paper session={session} exam={exam} setExam={setExam} elapsed={elapsed} results={results} onSubmit={submit} isGrading={isGrading} />{results ? <button className="amy-retry" onClick={restart}><RotateCcw size={16} /> 再考一套</button> : null}</> : null}
    {view === "history" ? <HistoryPage history={history} onOpen={(item) => { setRecord(item); setSelected(item.session); setView("historyDetail"); }} /> : null}
    {view === "historyDetail" && record && archivedSession ? <Paper session={archivedSession} exam={record.exam} setExam={() => {}} elapsed={record.elapsed} results={record.results} onSubmit={() => {}} /> : null}
  </div>;
}
