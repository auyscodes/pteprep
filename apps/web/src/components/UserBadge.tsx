import { useAuth } from "../lib/AuthContext";

export function UserBadge(): React.ReactNode {
  const { user, signOut } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <div>
      <span>{user.email ?? "Authenticated user"}</span>
      <button type="button" onClick={signOut}>
        Sign Out
      </button>
    </div>
  );
}
