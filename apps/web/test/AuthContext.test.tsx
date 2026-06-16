import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "../src/lib/AuthContext";

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignUp = vi.fn();
const mockSignInWithOAuth = vi.fn();
const mockSignOut = vi.fn();

vi.mock("../src/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        mockOnAuthStateChange(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      signInWithPassword: (...args: unknown[]) =>
        mockSignInWithPassword(...args),
      signUp: (...args: unknown[]) => mockSignUp(...args),
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
      signOut: () => mockSignOut(),
    },
  },
}));

vi.mock("../src/lib/api", () => ({
  setOnUnauthorized: vi.fn(),
  apiFetch: vi.fn(),
}));

function TestConsumer(): React.ReactNode {
  const { user, loading, signIn, signUp, signInWithGoogle, signOut } =
    useAuth();

  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user?.email ?? "no-user"}</span>
      <button
        data-testid="sign-in"
        onClick={() => signIn("test@test.com", "password")}
      >
        Sign In
      </button>
      <button
        data-testid="sign-up"
        onClick={() => signUp("new@test.com", "password")}
      >
        Sign Up
      </button>
      <button data-testid="google" onClick={() => signInWithGoogle()}>
        Google
      </button>
      <button data-testid="sign-out" onClick={() => signOut()}>
        Sign Out
      </button>
    </div>
  );
}

function renderWithAuth(): ReturnType<typeof render> {
  return render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with loading=true and no user", () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    renderWithAuth();

    expect(screen.getByTestId("loading").textContent).toBe("true");
    expect(screen.getByTestId("user").textContent).toBe("no-user");
  });

  it("sets user and loading=false after session is loaded", async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { email: "test@test.com" },
          access_token: "token",
        },
      },
    });

    renderWithAuth();

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    expect(screen.getByTestId("user").textContent).toBe("test@test.com");
  });

  it("sets loading=false when no session is found", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    renderWithAuth();

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });
  });

  it("calls signInWithPassword when signIn is invoked", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSignInWithPassword.mockResolvedValue({ error: null });

    renderWithAuth();

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("sign-in"));

    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: "test@test.com",
      password: "password",
    });
  });

  it("returns error from signIn when sign-in fails", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSignInWithPassword.mockResolvedValue({
      error: { message: "Invalid credentials" },
    });

    renderWithAuth();

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("sign-in"));

    expect(mockSignInWithPassword).toHaveBeenCalled();
  });

  it("calls signUp when signUp is invoked", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSignUp.mockResolvedValue({ error: null });

    renderWithAuth();

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("sign-up"));

    expect(mockSignUp).toHaveBeenCalledWith({
      email: "new@test.com",
      password: "password",
    });
  });

  it("calls signInWithOAuth when signInWithGoogle is invoked", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    renderWithAuth();

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("google"));

    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: expect.any(String) },
    });
  });

  it("calls signOut when signOut is invoked", async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { email: "test@test.com" },
          access_token: "token",
        },
      },
    });

    renderWithAuth();

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("sign-out"));

    expect(mockSignOut).toHaveBeenCalled();
  });

  it("throws error if useAuth is used outside AuthProvider", () => {
    expect(() => render(<TestConsumer />)).toThrow(
      "useAuth must be used within an AuthProvider"
    );
  });
});
