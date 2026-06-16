import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SessionBar } from "../src/components/SessionBar";

const mockApiFetch = vi.fn();

vi.mock("../src/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

describe("SessionBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("no active session", () => {
    it("shows 'No active session' with a Start Session button", () => {
      render(<SessionBar />);

      expect(screen.getByTestId("session-status").textContent).toBe(
        "No active session"
      );
      expect(
        screen.getByRole("button", { name: "Start Session" })
      ).toBeDefined();
    });

    it("shows loading state while starting session", () => {
      mockApiFetch.mockReturnValue(new Promise(() => {}));

      render(<SessionBar />);

      fireEvent.click(screen.getByRole("button", { name: "Start Session" }));
      expect(screen.getByRole("status").textContent).toBe(
        "Updating session..."
      );
    });

    it("creates session on Start Session click", async () => {
      mockApiFetch.mockResolvedValue({
        id: "s-1",
        user_id: "u-1",
        created_at: "2026-06-16T00:00:00Z",
      });

      render(<SessionBar />);

      fireEvent.click(screen.getByRole("button", { name: "Start Session" }));

      expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/sessions", {
        method: "POST",
      });

      await waitFor(() => {
        expect(screen.getByTestId("session-status").textContent).toContain(
          "Session active"
        );
      });
    });

    it("shows error when session creation fails", async () => {
      mockApiFetch.mockRejectedValue(new Error("Failed to create session"));

      render(<SessionBar />);

      fireEvent.click(screen.getByRole("button", { name: "Start Session" }));

      await waitFor(() => {
        expect(screen.getByRole("alert").textContent).toBe(
          "Failed to create session"
        );
      });
    });
  });

  describe("active session", () => {
    it("shows session status with attempt count", () => {
      render(<SessionBar attemptCount={3} />);

      expect(screen.getByTestId("session-status").textContent).toBe(
        "No active session"
      );
    });

    it("shows '1 attempt' singular when attempt count is 1 after session starts", async () => {
      mockApiFetch.mockResolvedValue({
        id: "s-1",
        user_id: "u-1",
        created_at: "2026-06-16T00:00:00Z",
      });

      render(<SessionBar attemptCount={1} />);

      fireEvent.click(screen.getByRole("button", { name: "Start Session" }));

      await waitFor(() => {
        expect(screen.getByTestId("session-status").textContent).toContain(
          "1 attempt"
        );
      });
    });

    it("shows 'N attempts' plural when attempt count is not 1 after session starts", async () => {
      mockApiFetch.mockResolvedValue({
        id: "s-1",
        user_id: "u-1",
        created_at: "2026-06-16T00:00:00Z",
      });

      render(<SessionBar attemptCount={5} />);

      fireEvent.click(screen.getByRole("button", { name: "Start Session" }));

      await waitFor(() => {
        expect(screen.getByTestId("session-status").textContent).toContain(
          "5 attempts"
        );
      });
    });

    it("renders End Session button when session is active", async () => {
      mockApiFetch.mockResolvedValue({
        id: "s-1",
        user_id: "u-1",
        created_at: "2026-06-16T00:00:00Z",
      });

      render(<SessionBar />);

      fireEvent.click(screen.getByRole("button", { name: "Start Session" }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "End Session" })
        ).toBeDefined();
      });
    });

    it("ends session on End Session click", async () => {
      mockApiFetch
        .mockResolvedValueOnce({
          id: "s-1",
          user_id: "u-1",
          created_at: "2026-06-16T00:00:00Z",
        })
        .mockResolvedValueOnce({
          id: "s-1",
          user_id: "u-1",
          created_at: "2026-06-16T00:00:00Z",
          ended_at: "2026-06-16T01:00:00Z",
        });

      render(<SessionBar />);

      fireEvent.click(screen.getByRole("button", { name: "Start Session" }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "End Session" })
        ).toBeDefined();
      });

      fireEvent.click(screen.getByRole("button", { name: "End Session" }));

      expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/sessions/s-1/end", {
        method: "PATCH",
      });

      await waitFor(() => {
        expect(screen.getByTestId("session-status").textContent).toBe(
          "No active session"
        );
      });
    });

    it("shows error when session end fails", async () => {
      mockApiFetch
        .mockResolvedValueOnce({
          id: "s-1",
          user_id: "u-1",
          created_at: "2026-06-16T00:00:00Z",
        })
        .mockRejectedValueOnce(new Error("Failed to end session"));

      render(<SessionBar />);

      fireEvent.click(screen.getByRole("button", { name: "Start Session" }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "End Session" })
        ).toBeDefined();
      });

      fireEvent.click(screen.getByRole("button", { name: "End Session" }));

      await waitFor(() => {
        expect(screen.getByRole("alert").textContent).toBe(
          "Failed to end session"
        );
      });
    });

    it("does nothing on End Session if session is null", () => {
      render(<SessionBar />);

      expect(screen.queryByRole("button", { name: "End Session" })).toBeNull();
    });
  });

  describe("component structure", () => {
    it("renders section with accessible label", () => {
      render(<SessionBar />);

      expect(screen.getByLabelText("Session")).toBeDefined();
    });
  });
});
