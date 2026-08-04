import { lazy, Suspense, useState } from "react";
import AmyVocabularyApp from "./AmyVocabularyApp.jsx";

const RewardApp = lazy(() => import("./RewardApp.jsx"));
const HomeworkApp = lazy(() => import("./HomeworkApp.jsx"));

export default function App() {
  const [section, setSection] = useState("study");

  if (section === "rewards") return <Suspense fallback={<main className="app-section-loading">正在打开奖励系统</main>}><RewardApp onBack={() => setSection("study")} /></Suspense>;
  if (section === "homework") return <Suspense fallback={<main className="app-section-loading">正在打开作业记录</main>}><HomeworkApp onBack={() => setSection("study")} /></Suspense>;
  return <AmyVocabularyApp onOpenRewards={() => setSection("rewards")} onOpenHomework={() => setSection("homework")} />;
}
