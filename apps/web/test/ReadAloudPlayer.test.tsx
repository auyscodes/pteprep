import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ReadAloudPlayer } from "../src/components/ReadAloudPlayer";

const mockApiFetch = vi.fn();

vi.mock("../src/lib/api", () => ({
  apiFetch: mockApiFetch,
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  },
}));

const sampleQuestion = {
  id: "q-123",
  passage_text:
    "Climate change is a pressing global issue that requires immediate action.",
};

const sampleSession = {
  id: "s-456",
  user_id: "user-1",
  created_at: "2026-01-01T00:00:00Z",
};

const sampleAttempt = {
  id: "a-789",
  session_id: "s-456",
  question_id: "q-123",
  status: "pending",
};

const sampleUploadUrl = {
  uploadUrl: "https://upload.example.com/signed-put",
  key: "recordings/user-1/a-789.webm",
};

const sampleSubmitted = {
  id: "a-789",
  status: "uploaded",
  session_id: "s-456",
  question_id: "q-123",
};

const sampleCompleted = {
  id: "a-789",
  session_id: "s-456",
  question_id: "q-123",
  status: "completed",
  score: { fluency: 75, pronunciation: 72, content: 80 },
  duration_ms: 5000,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("ReadAloudPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it("renders the passage text", () => {
    render(<ReadAloudPlayer question={sampleQuestion} />);

    expect(screen.getByText(sampleQuestion.passage_text)).toBeDefined();
  });

  it("shows the Record button initially", () => {
    render(<ReadAloudPlayer question={sampleQuestion} />);

    expect(
      screen.getByRole("button", { name: /start recording/i })
    ).toBeDefined();
  });

  it("toggles between Start and Stop Recording", async () => {
    render(<ReadAloudPlayer question={sampleQuestion} />);

    const startBtn = screen.getByRole("button", { name: /start recording/i });

    fireEvent.click(startBtn);

    expect(
      screen.getByRole("button", { name: /stop recording/i })
    ).toBeDefined();
  });

  it("calls API to create session and attempt when recording starts", async () => {
    mockApiFetch
      .mockResolvedValueOnce(sampleSession)
      .mockResolvedValueOnce(sampleAttempt);

    render(<ReadAloudPlayer question={sampleQuestion} />);

    const startBtn = screen.getByRole("button", { name: /start recording/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith("/v1/sessions", {
        method: "POST",
      });
    });

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/v1/sessions/s-456/attempts",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ question_id: "q-123" }),
        })
      );
    });
  });

  it("shows upload progress during upload", async () => {
    mockApiFetch
      .mockResolvedValueOnce(sampleSession)
      .mockResolvedValueOnce(sampleAttempt)
      .mockResolvedValueOnce(sampleUploadUrl);

    // Mock fetch for the PUT upload
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    globalThis.fetch = mockFetch;

    render(<ReadAloudPlayer question={sampleQuestion} />);

    // Start recording
    const startBtn = screen.getByRole("button", { name: /start recording/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledTimes(2);
    });

    // Stop recording
    const stopBtn = screen.getByRole("button", { name: /stop recording/i });
    fireEvent.click(stopBtn);

    await waitFor(() => {
      expect(screen.getByText(/uploading/i)).toBeDefined();
    });
  });

  it("enables submit button after upload completes", async () => {
    mockApiFetch
      .mockResolvedValueOnce(sampleSession)
      .mockResolvedValueOnce(sampleAttempt)
      .mockResolvedValueOnce(sampleUploadUrl);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    globalThis.fetch = mockFetch;

    render(<ReadAloudPlayer question={sampleQuestion} />);

    const startBtn = screen.getByRole("button", { name: /start recording/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledTimes(2);
    });

    // Stop recording triggers upload
    const stopBtn = screen.getByRole("button", { name: /stop recording/i });
    fireEvent.click(stopBtn);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /submit for scoring/i })
      ).toBeDefined();
    });
  });

  it("submits and polls for scoring results", async () => {
    mockApiFetch
      .mockResolvedValueOnce(sampleSession)
      .mockResolvedValueOnce(sampleAttempt)
      .mockResolvedValueOnce(sampleUploadUrl)
      .mockResolvedValueOnce(sampleSubmitted)
      .mockResolvedValueOnce({ ...sampleSubmitted, status: "scoring" })
      .mockResolvedValueOnce(sampleCompleted);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    globalThis.fetch = mockFetch;

    render(<ReadAloudPlayer question={sampleQuestion} />);

    // Start recording
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledTimes(2);
    });

    // Stop recording (triggers upload)
    fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));

    await waitFor(() => {
      const submitBtn = screen.getByRole("button", {
        name: /submit for scoring/i,
      });
      expect(submitBtn).toBeDefined();
    });

    // Submit
    fireEvent.click(
      screen.getByRole("button", { name: /submit for scoring/i })
    );

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/v1/attempts/a-789/submit",
        expect.objectContaining({ method: "POST" })
      );
    });

    // Advance timers for polling
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith("/v1/attempts/a-789");
    });
  });

  it("displays score when scoring completes", async () => {
    mockApiFetch
      .mockResolvedValueOnce(sampleSession)
      .mockResolvedValueOnce(sampleAttempt)
      .mockResolvedValueOnce(sampleUploadUrl)
      .mockResolvedValueOnce(sampleSubmitted)
      .mockResolvedValueOnce(sampleCompleted);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    globalThis.fetch = mockFetch;

    render(<ReadAloudPlayer question={sampleQuestion} />);

    // Start -> stop -> submit
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));

    await waitFor(() => {
      const submitBtn = screen.getByRole("button", {
        name: /submit for scoring/i,
      });
      expect(submitBtn).toBeDefined();
    });

    fireEvent.click(
      screen.getByRole("button", { name: /submit for scoring/i })
    );

    await waitFor(() => {
      expect(screen.getByText(/fluency/i)).toBeDefined();
      expect(screen.getByText(/pronunciation/i)).toBeDefined();
      expect(screen.getByText(/content/i)).toBeDefined();
    });
  });

  it("shows error message when API calls fail", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("Network error"));

    render(<ReadAloudPlayer question={sampleQuestion} />);

    const startBtn = screen.getByRole("button", { name: /start recording/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(screen.getByText(/failed to create session/i)).toBeDefined();
    });
  });
});
