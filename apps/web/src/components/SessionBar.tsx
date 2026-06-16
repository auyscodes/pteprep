import { useState } from "react";
import { apiFetch } from "../lib/api";
import type { Session } from "../lib/types";

interface SessionBarProps {
  attemptCount?: number;
}

function pluraliseAttempts(n: number): string {
  return n === 1 ? "1 attempt" : `${n} attempts`;
}

export function SessionBar({
  attemptCount = 0,
}: SessionBarProps): React.ReactNode {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startSession = (): void => {
    setLoading(true);
    setError(null);

    apiFetch<Session>("/api/v1/sessions", { method: "POST" })
      .then((data) => {
        setSession(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  };

  const endSession = (): void => {
    if (!session) return;

    setLoading(true);
    setError(null);

    apiFetch<Session>(`/api/v1/sessions/${session.id}/end`, {
      method: "PATCH",
    })
      .then((data) => {
        setSession(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  };

  if (loading) {
    return <p role="status">Updating session...</p>;
  }

  return (
    <section aria-label="Session">
      {error && <p role="alert">{error}</p>}
      {session && !session.ended_at ? (
        <div>
          <p data-testid="session-status">
            Session active &mdash; {pluraliseAttempts(attemptCount)}
          </p>
          <button
            type="button"
            data-testid="end-session"
            onClick={endSession}
          >
            End Session
          </button>
        </div>
      ) : (
        <div>
          <p data-testid="session-status">No active session</p>
          <button
            type="button"
            data-testid="start-session"
            onClick={startSession}
          >
            Start Session
          </button>
        </div>
      )}
    </section>
  );
}
