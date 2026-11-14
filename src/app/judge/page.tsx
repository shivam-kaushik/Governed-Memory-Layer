import { JudgePanel } from "../components/JudgePanel";

// Live checks for the three hackathon questions, plus the demo reset. Identity is the session cookie, as everywhere else.
export default function JudgePage() {
  return (
    <>
      <h2>Judge Q&amp;A</h2>
      <JudgePanel />
    </>
  );
}
