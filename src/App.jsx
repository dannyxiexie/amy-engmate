import { useState } from "react";
import AmyVocabularyApp from "./AmyVocabularyApp.jsx";
import RewardApp from "./RewardApp.jsx";
import HomeworkApp from "./HomeworkApp.jsx";

export default function App() {
  const [section, setSection] = useState("study");

  if (section === "rewards") return <RewardApp onBack={() => setSection("study")} />;
  if (section === "homework") return <HomeworkApp onBack={() => setSection("study")} />;
  return <AmyVocabularyApp onOpenRewards={() => setSection("rewards")} onOpenHomework={() => setSection("homework")} />;
}
