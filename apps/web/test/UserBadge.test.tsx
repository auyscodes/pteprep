import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSignOut = vi.fn();

vi.mock("../src/lib/AuthContext", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../src/lib/AuthContext";
import { UserBadge } from "../src/components/UserBadge";

describe("UserBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when user is null", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      session: null,
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
    });

    const { container } = render(<UserBadge />);
    expect(container.innerHTML).toBe("");
  });

  it("renders user email and sign-out button when authenticated", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: "test@test.com" } as ReturnType<typeof useAuth>["user"],
      session: null,
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signInWithGoogle: vi.fn(),
      signOut: mockSignOut,
    });

    render(<UserBadge />);

    expect(screen.getByText("test@test.com")).toBeDefined();
    expect(screen.getByRole("button", { name: "Sign Out" })).toBeDefined();
  });

  it("renders fallback text when user has no email", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: undefined } as ReturnType<typeof useAuth>["user"],
      session: null,
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
    });

    render(<UserBadge />);

    expect(screen.getByText("Authenticated user")).toBeDefined();
  });

  it("calls signOut when sign-out button is clicked", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: "test@test.com" } as ReturnType<typeof useAuth>["user"],
      session: null,
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signInWithGoogle: vi.fn(),
      signOut: mockSignOut,
    });

    render(<UserBadge />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Sign Out" }));

    expect(mockSignOut).toHaveBeenCalled();
  });
});
