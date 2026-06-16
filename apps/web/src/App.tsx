import { useAuth } from "./lib/AuthContext";
import { SignInForm } from "./components/SignInForm";
import { UserBadge } from "./components/UserBadge";
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
      <p>Welcome to the Read Aloud Player</p>
    </div>
  );
}

export default App;
