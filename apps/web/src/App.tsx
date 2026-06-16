import { useState } from "react";
import { useAuth } from "./lib/AuthContext";
import { SignInForm } from "./components/SignInForm";
import { UserBadge } from "./components/UserBadge";
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
      {!showPlayer ? (
        <div>
          <p>Welcome to the Read Aloud Player</p>
          <button type="button" onClick={() => setShowPlayer(true)}>
            Start Practice
          </button>
        </div>
      ) : (
        <ReadAloudPlayer question={DEMO_QUESTION} />
      )}
    </div>
  );
}

export default App;
