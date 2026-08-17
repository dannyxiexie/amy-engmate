import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpRight, CloudUpload, Gift, Plus, WalletCards } from "lucide-react";
import { loadGithubRewardLogs, uploadGithubRewardLog } from "./githubExamLogs.js";
import "./reward.css";

const REWARD_STORAGE_KEY = "amy-engmate:reward-ledger:v1";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function readLocalRecords() {
  try {
    const records = JSON.parse(window.localStorage.getItem(REWARD_STORAGE_KEY) || "[]");
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function mergeRecords(...groups) {
  const recordsById = new Map();
  groups.flat().forEach((record) => {
    if (!record?.id || !["reward", "payment"].includes(record.type) || !(Number(record.amount) > 0)) return;
    recordsById.set(record.id, { ...record, amount: Number(record.amount) });
  });
  return [...recordsById.values()]
    .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())
    .slice(0, 500);
}

function money(value) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(value);
}

function displayDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function ledgerRows(records) {
  let balance = 0;
  return [...records]
    .sort((left, right) => new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime())
    .map((record) => {
      balance += record.type === "reward" ? record.amount : -record.amount;
      return { ...record, balanceAfter: balance };
    })
    .reverse();
}

export default function RewardApp({ onBack }) {
  const [records, setRecords] = useState([]);
  const [storageReady, setStorageReady] = useState(false);
  const [entryType, setEntryType] = useState("reward");
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [cloudStatus, setCloudStatus] = useState({ type: "loading", message: "正在同步奖励记录" });
  const [isUploading, setIsUploading] = useState(false);

  const balance = useMemo(
    () => records.reduce((total, record) => total + (record.type === "reward" ? record.amount : -record.amount), 0),
    [records]
  );
  const rows = useMemo(() => ledgerRows(records), [records]);

  useEffect(() => {
    setRecords(readLocalRecords());
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    let cancelled = false;
    loadGithubRewardLogs()
      .then((cloudRecords) => {
        if (cancelled) return;
        setRecords((current) => mergeRecords(cloudRecords, current));
        setCloudStatus({
          type: "success",
          message: cloudRecords.length ? `已同步 ${cloudRecords.length} 条奖励记录` : "还没有奖励记录"
        });
      })
      .catch(() => {
        if (!cancelled) setCloudStatus({ type: "error", message: "云端暂时无法连接，本机记录仍会保留" });
      });
    return () => { cancelled = true; };
  }, [storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(REWARD_STORAGE_KEY, JSON.stringify(records));
  }, [records, storageReady]);

  const uploadAll = async () => {
    if (!records.length || isUploading) return;
    setIsUploading(true);
    setCloudStatus({ type: "loading", message: "正在保存奖励记录" });
    try {
      for (const record of records) await uploadGithubRewardLog(record);
      setCloudStatus({ type: "success", message: "奖励记录已保存" });
    } catch (reason) {
      setCloudStatus({ type: "error", message: reason.message || "上传失败，本机记录仍然保留" });
    } finally {
      setIsUploading(false);
    }
  };

  const addRecord = () => {
    const numericAmount = Number(amount);
    if (!startDate || (entryType === "reward" && !endDate)) {
      window.alert("请填写日期。");
      return;
    }
    if (entryType === "reward" && startDate > endDate) {
      window.alert("结束日期不能早于开始日期。");
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      window.alert("请输入正确的金额。");
      return;
    }
    if (entryType === "payment" && numericAmount > balance) {
      window.alert("本次扣减不能超过当前待充值余额。");
      return;
    }

    const record = {
      id: String(Date.now()) + Math.random().toString(36).slice(2, 7),
      type: entryType,
      startDate,
      endDate: entryType === "reward" ? endDate : startDate,
      amount: Math.round(numericAmount * 100) / 100,
      note: note.trim(),
      createdAt: new Date().toISOString()
    };
    setRecords((current) => mergeRecords(record, current));
    setAmount("");
    setNote("");

    setCloudStatus({ type: "loading", message: "正在保存这笔记录" });
    uploadGithubRewardLog(record)
      .then(() => setCloudStatus({ type: "success", message: "这笔记录已自动保存" }))
      .catch(() => setCloudStatus({ type: "error", message: "已保存在本机，稍后可点同步重试" }));
  };

  return <div className="reward-app">
    <header>
      <button aria-label="返回英语复习" onClick={onBack}><ArrowLeft size={19} /></button>
      <div><span>AMY REWARDS</span><strong>奖励系统</strong></div>
      <button className="reward-sync-button" disabled={!records.length || isUploading} onClick={() => uploadAll()} title="同步记录">
        <CloudUpload size={17} /><span>{isUploading ? "同步中" : "同步"}</span>
      </button>
    </header>

    <main className="reward-main">
      <section className="reward-balance">
        <div>
          <span>当前还应充值</span>
          <strong>{money(balance)}</strong>
          <small>奖励增加，实际充值后扣减</small>
        </div>
        <WalletCards size={34} />
      </section>

      <section className="reward-entry">
        <div className="reward-section-title">
          <div><span>NEW RECORD</span><h1>录入一笔</h1></div>
          <div className={`reward-cloud-status ${cloudStatus.type || ""}`}><CloudUpload size={14} /><span>{cloudStatus.message}</span></div>
        </div>

        <div className="reward-type" aria-label="记录类型">
          <button className={entryType === "reward" ? "active" : ""} onClick={() => setEntryType("reward")}><Gift size={17} />增加奖励</button>
          <button className={entryType === "payment" ? "active" : ""} onClick={() => setEntryType("payment")}><ArrowUpRight size={17} />已充值扣减</button>
        </div>

        <div className={`reward-fields ${entryType}`}>
          <label>{entryType === "reward" ? "从几号" : "充值日期"}<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          {entryType === "reward" ? <label>到几号<input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} /></label> : null}
          <label>金额（元）<input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" /></label>
          <label className="reward-note">备注（可选）<input type="text" maxLength="100" value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：本周作业全部完成" /></label>
          <button className="reward-submit" onClick={addRecord}><Plus size={18} />记一笔</button>
        </div>
      </section>

      <section className="reward-ledger">
        <div className="reward-section-title"><div><span>LEDGER</span><h2>奖励记录</h2></div><strong>{records.length} 笔</strong></div>
        {rows.length ? <div className="reward-list">
          {rows.map((record) => <article key={record.id}>
            <span className={`reward-kind ${record.type}`}>{record.type === "reward" ? "奖励" : "充值"}</span>
            <div>
              <strong>{record.type === "reward" && record.startDate !== record.endDate ? `${displayDate(record.startDate)} - ${displayDate(record.endDate)}` : displayDate(record.startDate)}</strong>
              {record.note ? <p>{record.note}</p> : null}
              <small>{new Date(record.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 录入</small>
            </div>
            <b className={record.type}>{record.type === "reward" ? "+" : "-"}{money(record.amount)}</b>
            <small>余额 {money(record.balanceAfter)}</small>
          </article>)}
        </div> : <p className="reward-empty">第一笔记录会显示在这里。</p>}
      </section>
    </main>
  </div>;
}
