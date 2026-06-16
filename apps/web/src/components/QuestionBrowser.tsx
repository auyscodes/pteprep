import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import type { Question } from "../lib/types";

interface QuestionsResponse {
  questions: Question[];
  count: number;
  offset: number;
  limit: number;
}

export function QuestionBrowser(): React.ReactNode {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<QuestionsResponse>("/api/v1/questions")
      .then((data) => {
        setQuestions(data.questions);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <p role="status">Loading questions...</p>;
  }

  if (error) {
    return <p role="alert">{error}</p>;
  }

  if (questions.length === 0) {
    return <p>No questions available</p>;
  }

  const difficultyLabel = (d: number): string => {
    if (d <= 3) return "Easy";
    if (d <= 6) return "Medium";
    return "Hard";
  };

  return (
    <section aria-label="Question Browser">
      <h2>Read Aloud Questions</h2>
      <ul data-testid="question-list" role="list">
        {questions.map((q) => (
          <li key={q.id} data-testid="question-card">
            <h3>{q.topic_title}</h3>
            <span data-testid="difficulty-badge">
              {difficultyLabel(q.difficulty)}
            </span>
            <span data-testid="word-count">{q.word_count} words</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
