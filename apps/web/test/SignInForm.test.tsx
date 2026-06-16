import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignInForm } from "../src/components/SignInForm";

const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
const mockSignInWithGoogle = vi.fn();

vi.mock("../src/lib/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    session: null,
    loading: false,
    signIn: mockSignIn,
    signUp: mockSignUp,
    signInWithGoogle: mockSignInWithGoogle,
    signOut: vi.fn(),
  }),
}));

describe("SignInForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignIn.mockResolvedValue({ error: null });
    mockSignUp.mockResolvedValue({ error: null });
    mockSignInWithGoogle.mockResolvedValue(undefined);
  });

  it("renders sign-in form by default", () => {
    render(<SignInForm />);

    expect(screen.getByRole("heading", { name: "Sign In" })).toBeDefined();
    expect(screen.getByLabelText("Email")).toBeDefined();
    expect(screen.getByLabelText("Password")).toBeDefined();
    expect(screen.getByText("Need an account? Sign Up")).toBeDefined();
  });

  it("toggles between sign-in and sign-up", async () => {
    render(<SignInForm />);

    const user = userEvent.setup();

    await user.click(screen.getByText("Need an account? Sign Up"));

    expect(screen.getByRole("heading", { name: "Sign Up" })).toBeDefined();
    expect(screen.getByText("Already have an account? Sign In")).toBeDefined();

    await user.click(screen.getByText("Already have an account? Sign In"));

    expect(screen.getByRole("heading", { name: "Sign In" })).toBeDefined();
  });

  it("calls signIn on form submit in sign-in mode", async () => {
    render(<SignInForm />);

    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Email"), "test@test.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(mockSignIn).toHaveBeenCalledWith("test@test.com", "password123");
  });

  it("calls signUp on form submit in sign-up mode", async () => {
    render(<SignInForm />);

    const user = userEvent.setup();

    await user.click(screen.getByText("Need an account? Sign Up"));
    await user.type(screen.getByLabelText("Email"), "new@test.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    expect(mockSignUp).toHaveBeenCalledWith("new@test.com", "password123");
  });

  it("displays error message when signIn fails", async () => {
    mockSignIn.mockResolvedValue({ error: { message: "Invalid credentials" } });

    render(<SignInForm />);

    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Email"), "test@test.com");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(await screen.findByRole("alert")).toBeDefined();
  });

  it("displays success message after sign-up", async () => {
    render(<SignInForm />);

    const user = userEvent.setup();

    await user.click(screen.getByText("Need an account? Sign Up"));
    await user.type(screen.getByLabelText("Email"), "new@test.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    expect(
      await screen.findByText("Check your email for a confirmation link.")
    ).toBeDefined();
  });

  it("renders Google sign-in button", () => {
    render(<SignInForm />);

    expect(screen.getByText("Sign in with Google")).toBeDefined();
  });

  it("calls signInWithGoogle when Google button is clicked", async () => {
    render(<SignInForm />);

    const user = userEvent.setup();
    await user.click(screen.getByText("Sign in with Google"));

    expect(mockSignInWithGoogle).toHaveBeenCalled();
  });
});
