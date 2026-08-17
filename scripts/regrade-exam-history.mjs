import fs from "node:fs";
import path from "node:path";

const API_URL = process.env.GRADING_API_URL || "https://grade.dannyxiexie.tech";
const MAX_ATTEMPTS = 6;
const REQUEST_TIMEOUT_MS = 55000;
const files = process.argv.slice(2);

if (!files.length) {
  console.error("Usage: node scripts/regrade-exam-history.mjs <exam-log.json> [...]");
  process.exit(1);
}

const acceptedPath = path.resolve("grading-rules/accepted-answers.json");
const acceptedPayload = fs.existsSync(acceptedPath)
  ? JSON.parse(fs.readFileSync(acceptedPath, "utf8"))
  : {};
const acceptedAnswers = acceptedPayload.entries || acceptedPayload;

function saveRecord(file, record) {
  const target = path.resolve(file);
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`);
  fs.renameSync(temporary, target);
}

function calculateResults(record, meanings) {
  const cloze = (record.exam.cloze || []).map((item) => ({
    correct: item.answer === item.term,
    answer: item.term
  }));
  const correct = [...meanings, ...cloze].filter((item) => item?.correct).length;
  const total = meanings.length + cloze.length;
  return { meanings, cloze, correct, total, score: total ? Math.round(correct / total * 100) : 0 };
}

async function gradeItem(item, onAttempt) {
  const requestIds = [];
  let lastError = new Error("AI grading unavailable");
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    onAttempt(attempt, requestIds);
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { "Content-Type": "application/json", Origin: "https://dannyxiexie.github.io" },
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
      if (!response.ok) throw new Error(payload.error || `AI grading HTTP ${response.status}`);
      const result = Array.isArray(payload.results) ? payload.results[0] : null;
      if (payload.results?.length !== 1 || result?.id !== item.id || typeof result.correct !== "boolean") {
        throw new Error("AI returned an incomplete grading result");
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
      lastError = reason;
      if (attempt < MAX_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  const error = new Error(lastError.message || "AI grading unavailable");
  error.requestIds = requestIds;
  throw error;
}

async function regradeFile(file, startDelay) {
  await new Promise((resolve) => setTimeout(resolve, startDelay));
  const record = JSON.parse(fs.readFileSync(file, "utf8"));
  if (record.parentGradedAt) throw new Error(`${file}: parent-graded record must not be changed`);

  const examItems = record.exam?.meanings || [];
  const previousAudit = Array.isArray(record.gradingAudit?.items) ? record.gradingAudit.items : [];
  const auditById = new Map(previousAudit.map((item) => [item.id, item]));
  const meanings = examItems.map((item, index) => {
    if (!String(item.answer || "").trim()) {
      return { id: item.id, correct: false, answer: item.meaningZh, source: "blank" };
    }
    if (auditById.has(item.id) && record.results?.meanings?.[index]?.source === "ai") {
      return record.results.meanings[index];
    }
    return null;
  });
  const totalAi = examItems.filter((item) => String(item.answer || "").trim()).length;
  const startedAt = record.gradingAudit?.startedAt || new Date().toISOString();

  for (let index = 0; index < examItems.length; index += 1) {
    const item = examItems[index];
    if (!String(item.answer || "").trim() || meanings[index]) continue;
    try {
      const graded = await gradeItem(item, (attempt, requestIds) => {
        record.regradingProgress = {
          status: "grading",
          done: auditById.size,
          total: totalAi,
          currentIndex: index,
          currentAttempt: attempt,
          requestIds
        };
        saveRecord(file, record);
      });
      meanings[index] = graded.result;
      auditById.set(item.id, graded.audit);
      record.results = calculateResults(record, meanings.map((result, resultIndex) => result || record.results.meanings[resultIndex]));
      record.gradingAudit = {
        provider: graded.audit.provider,
        model: graded.audit.model,
        startedAt,
        itemCount: auditById.size,
        items: [...auditById.values()]
      };
      record.regradingProgress = { status: "grading", done: auditById.size, total: totalAi, currentIndex: null, currentAttempt: 0 };
      saveRecord(file, record);
      if (auditById.size % 5 === 0 || auditById.size === totalAi) {
        console.log(`${path.basename(file)} ${auditById.size}/${totalAi}`);
      }
    } catch (reason) {
      record.regradingProgress = {
        status: "interrupted",
        done: auditById.size,
        total: totalAi,
        failedIndex: index,
        failedId: item.id,
        requestIds: reason.requestIds || [],
        error: reason.message || "AI grading unavailable"
      };
      saveRecord(file, record);
      throw new Error(`${path.basename(file)} interrupted at ${auditById.size}/${totalAi}: ${record.regradingProgress.error}`);
    }
  }

  const completedAt = new Date().toISOString();
  record.results = calculateResults(record, meanings);
  record.gradingVersion = 6;
  record.regradedAt = completedAt;
  record.gradingAudit = {
    provider: [...auditById.values()][0]?.provider || "xiaomi-mimo",
    model: [...auditById.values()][0]?.model || "",
    startedAt,
    completedAt,
    itemCount: auditById.size,
    items: [...auditById.values()]
  };
  delete record.regradingProgress;
  saveRecord(file, record);
  console.log(`${path.basename(file)} complete: ${record.results.score}/100`);
}

const settled = await Promise.allSettled(files.map((file, index) => regradeFile(file, index * 750)));
const failures = settled.filter((result) => result.status === "rejected");
for (const failure of failures) console.error(failure.reason.message);
if (failures.length) process.exit(1);
