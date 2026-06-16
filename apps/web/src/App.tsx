import { useAuth } from "./lib/AuthContext";
import { SignInForm } from "./components/SignInForm";
import { UserBadge } from "./components/UserBadge";
import { SessionBar } from "./components/SessionBar";
import { QuestionBrowser } from "./components/QuestionBrowser";
import "./App.css";

function App() {
  const { user, loading } = useAuth();

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
      <QuestionBrowser />
    </div>
  );
}

export default App;
