import { useState } from "react";
import { useAuth } from "./lib/AuthContext";
import { SignInForm } from "./components/SignInForm";
import { UserBadge } from "./components/UserBadge";
import { SessionBar } from "./components/SessionBar";
import { QuestionBrowser } from "./components/QuestionBrowser";
import { ReadAloudPlayer } from "./components/ReadAloudPlayer";
import "./App.css";

const DEMO_QUESTION = {
  id: "demo-1",
  passage_text:
    "Climate change is a pressing global issue that requires immediate action from governments, businesses, and individuals worldwide.",
};

function App() {
  const { user, loading } = useAuth();
  const [showPlayer, setShowPlayer] = useState(false);

  if (loading) {
    return <p>Loading...</p>;
  }

  if (!user) {
    return <SignInForm />;
  }

  return (
    <div>
      <UserBadge />
      <h1>PTE Prep</h1>
      <SessionBar />
      {!showPlayer ? (
        <>
          <QuestionBrowser />
          <button type="button" onClick={() => setShowPlayer(true)}>
            Start Practice
          </button>
        </>
      ) : (
        <ReadAloudPlayer question={DEMO_QUESTION} />
      )}
    </div>
  );
}

export default App;
