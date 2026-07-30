import { useState } from "react";
import AmyVocabularyApp from "./AmyVocabularyApp.jsx";
import RewardApp from "./RewardApp.jsx";

export default function App() {
  const [section, setSection] = useState("study");

  return section === "rewards"
    ? <RewardApp onBack={() => setSection("study")} />
    : <AmyVocabularyApp onOpenRewards={() => setSection("rewards")} />;
}
