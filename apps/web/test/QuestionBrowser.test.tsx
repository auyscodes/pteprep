import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QuestionBrowser } from "../src/components/QuestionBrowser";

const mockApiFetch = vi.fn();

vi.mock("../src/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const mockQuestions = [
  {
    id: "q-1",
    question_type: "read_aloud",
    topic_title: "Climate Change Effects",
    difficulty: 3,
    word_count: 98,
    passage_text: "Climate change is a pressing global issue...",
    has_audio: false,
    has_image: false,
  },
  {
    id: "q-2",
    question_type: "read_aloud",
    topic_title: "Ocean Conservation",
    difficulty: 7,
    word_count: 120,
    passage_text: "The world's oceans are under threat...",
    has_audio: true,
    has_image: false,
  },
  {
    id: "q-3",
    question_type: "read_aloud",
    topic_title: "Simple Greeting",
    difficulty: 1,
    word_count: 45,
    passage_text: "Hello, how are you today?",
    has_audio: false,
    has_image: false,
  },
];

describe("QuestionBrowser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));

    render(<QuestionBrowser />);

    expect(screen.getByRole("status").textContent).toBe(
      "Loading questions..."
    );
  });

  it("shows error state when fetch fails", async () => {
    mockApiFetch.mockRejectedValue(new Error("Network error"));

    render(<QuestionBrowser />);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("Network error");
    });
  });

  it("shows empty state when no questions returned", async () => {
    mockApiFetch.mockResolvedValue({ questions: [], count: 0 });

    render(<QuestionBrowser />);

    await waitFor(() => {
      expect(screen.getByText("No questions available")).toBeDefined();
    });
  });

  it("renders question cards with title, difficulty badge, and word count", async () => {
    mockApiFetch.mockResolvedValue({
      questions: mockQuestions,
      count: 3,
      offset: 0,
      limit: 20,
    });

    render(<QuestionBrowser />);

    await waitFor(() => {
      expect(screen.getByText("Climate Change Effects")).toBeDefined();
    });

    const cards = screen.getAllByTestId("question-card");
    expect(cards).toHaveLength(3);

    expect(cards[0].textContent).toContain("Climate Change Effects");
    expect(cards[1].textContent).toContain("Ocean Conservation");

    const difficultyBadges = screen.getAllByTestId("difficulty-badge");
    expect(difficultyBadges).toHaveLength(3);
    expect(difficultyBadges[0].textContent).toBe("Easy");
    expect(difficultyBadges[1].textContent).toBe("Hard");
    expect(difficultyBadges[2].textContent).toBe("Easy");

    const wordCounts = screen.getAllByTestId("word-count");
    expect(wordCounts[0].textContent).toBe("98 words");
    expect(wordCounts[1].textContent).toBe("120 words");
    expect(wordCounts[2].textContent).toBe("45 words");
  });

  it("renders section with accessible label", async () => {
    mockApiFetch.mockResolvedValue({
      questions: mockQuestions,
      count: 3,
    });

    render(<QuestionBrowser />);

    await waitFor(() => {
      expect(screen.getByRole("list")).toBeDefined();
    });

    expect(
      screen.getByRole("heading", { name: "Read Aloud Questions" })
    ).toBeDefined();
  });

  it("labels difficulty 7 as Hard", async () => {
    mockApiFetch.mockResolvedValue({
      questions: [
        { ...mockQuestions[1], difficulty: 7 },
      ],
      count: 1,
    });

    render(<QuestionBrowser />);

    await waitFor(() => {
      expect(screen.getByTestId("difficulty-badge").textContent).toBe("Hard");
    });
  });

  it("labels difficulty 6 as Medium", async () => {
    mockApiFetch.mockResolvedValue({
      questions: [
        { ...mockQuestions[0], difficulty: 6 },
      ],
      count: 1,
    });

    render(<QuestionBrowser />);

    await waitFor(() => {
      expect(screen.getByTestId("difficulty-badge").textContent).toBe("Medium");
    });
  });
});
