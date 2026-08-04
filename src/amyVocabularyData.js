export const AMY_VOCABULARY_BOOK_ID = "amy-grade-5-vocabulary";
const AMY_VOCABULARY_DATA_VERSION = "20260804-1";
export const AMY_VOCABULARY_CONTENT_URL =
  import.meta.env.BASE_URL + "data/books/" + AMY_VOCABULARY_BOOK_ID + "/content.json";

export const AMY_VOCABULARY_MANIFEST = {
  id: AMY_VOCABULARY_BOOK_ID,
  title: "Amy 小学五年级英语词汇",
  stage: "study-and-exam",
  sessions: [
    { number: 1, available: true, itemCount: 91, groupCount: 50 },
    { number: 2, available: true, itemCount: 79, groupCount: 59 },
    { number: 3, available: true, itemCount: 78, groupCount: 58 },
    { number: 4, available: true, itemCount: 79, groupCount: 56 },
    { number: 5, available: true, itemCount: 98, groupCount: 66 },
    { number: 6, available: true, itemCount: 109, groupCount: 66 },
    { number: 7, available: true, itemCount: 133, groupCount: 75 },
    { number: 8, available: true, itemCount: 104, groupCount: 59 },
    { number: 9, available: true, itemCount: 125, groupCount: 64 },
    { number: 10, available: false, itemCount: 0, groupCount: 0 },
    { number: 11, available: false, itemCount: 0, groupCount: 0 }
  ]
};

export async function fetchAmyVocabulary() {
  const response = await fetch(AMY_VOCABULARY_CONTENT_URL, { cache: "force-cache" });
  if (!response.ok) throw new Error("无法加载词汇资料（" + response.status + "）");
  return response.json();
}

export async function fetchAmyVocabularySession(number) {
  const url = `${import.meta.env.BASE_URL}data/books/${AMY_VOCABULARY_BOOK_ID}/sessions/session-${number}.json?v=${AMY_VOCABULARY_DATA_VERSION}`;
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`无法加载第 ${number} 次词汇资料（${response.status}）`);
  return response.json();
}

export function normalize(value = "") {
  return String(value).toLowerCase().replace(/[\p{P}\p{S}\s]/gu, "");
}

const chineseDigits = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9
};

function convertChineseNumber(token) {
  if (!/[十百千]/.test(token)) {
    return [...token].map((character) => chineseDigits[character]).join("");
  }
  const units = { 十: 10, 百: 100, 千: 1000 };
  let total = 0;
  let digit = 0;
  [...token].forEach((character) => {
    if (character in chineseDigits) {
      digit = chineseDigits[character];
    } else {
      total += (digit || 1) * units[character];
      digit = 0;
    }
  });
  return String(total + digit);
}

function normalizeChineseNumbers(value) {
  return value.replace(/[零〇一二两三四五六七八九十百千]+/g, convertChineseNumber);
}

function normalizeMonths(value) {
  const months = [
    ["十二月", "12月"],
    ["十一月", "11月"],
    ["十月", "10月"],
    ["九月", "9月"],
    ["八月", "8月"],
    ["七月", "7月"],
    ["六月", "6月"],
    ["五月", "5月"],
    ["四月", "4月"],
    ["三月", "3月"],
    ["二月", "2月"],
    ["一月", "1月"]
  ];
  return months.reduce((text, [chinese, arabic]) => text.replaceAll(chinese, arabic), value);
}

function normalizeMeaning(value = "") {
  const canonical = normalizeMonths(normalize(value))
    .replaceAll("阿拉伯数字", "")
    .replaceAll("可以", "能")
    .replaceAll("一个人", "某人")
    .replaceAll("去干", "做")
    .replaceAll("某件事情", "某事")
    .replaceAll("一件事情", "某事")
    .replaceAll("干某事", "做某事")
    .replaceAll("那边", "那里")
    .replaceAll("将要", "会")
    .replaceAll("将会", "会")
    .replaceAll("试一试", "尝试")
    .replaceAll("试一下", "尝试")
    .replaceAll("试试", "尝试");
  return normalizeChineseNumbers(canonical);
}

export function gradeMeaning(answer, expected) {
  const actual = normalizeMeaning(answer);
  if (!actual) return false;
  const values = Array.isArray(expected) ? expected : [expected];
  const candidates = values.flatMap((value) => String(value).split(/[，,、；;]/)).map(normalizeMeaning).filter(Boolean);
  return candidates.some((candidate) => actual === candidate
    || (actual.length >= 4 && candidate.length >= 4
      && Math.min(actual.length, candidate.length) / Math.max(actual.length, candidate.length) >= 0.62
      && (actual.includes(candidate) || candidate.includes(actual))));
}

export function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return minutes + ":" + seconds;
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

export function createAmyExam(session, previousSignature = "") {
  const meanings = shuffle(session.entries).map((entry) => ({ ...entry, answer: "" }));
  const clozePool = meanings
    .map((entry) => ({ entry, prompt: createClozePrompt(entry.example, entry.term) }))
    .filter(({ entry, prompt }) => entry.term.length >= 2 && prompt);
  const cloze = shuffle(clozePool).slice(0, Math.min(12, clozePool.length)).map(({ entry, prompt }) => ({
    ...entry,
    prompt,
    choices: shuffle([
      entry.term,
      ...shuffle([...new Map(meanings
        .filter((item) => item.id !== entry.id && item.term.toLowerCase() !== entry.term.toLowerCase())
        .map((item) => [item.term.toLowerCase(), item.term])).values()]).slice(0, 3)
    ]),
    answer: ""
  }));
  const signature = meanings.map((item) => item.id).join(",") + "|" + cloze.map((item) => item.id + ":" + item.choices.join(",")).join("|");
  if (signature === previousSignature && meanings.length > 3) return createAmyExam(session, "");
  return { meanings, cloze, signature };
}

export function createClozePrompt(example, term) {
  const source = String(example || "").trim();
  const target = String(term || "").trim();
  if (!source || !target) return "";

  const lowerSource = source.toLowerCase();
  const lowerTarget = target.toLowerCase();
  let index = lowerSource.indexOf(lowerTarget);
  while (index >= 0) {
    const before = source[index - 1] || "";
    const after = source[index + target.length] || "";
    if (!/[A-Za-z]/.test(before) && !/[A-Za-z]/.test(after)) {
      const prompt = source.slice(0, index) + "_____" + source.slice(index + target.length);
      const context = prompt.replace("_____", "").match(/[A-Za-z]+/g) || [];
      return context.length >= 2 ? prompt : "";
    }
    index = lowerSource.indexOf(lowerTarget, index + 1);
  }
  return "";
}

export function hideTermInExample(example, term) {
  return createClozePrompt(example, term) || String(example || "").trim();
}
