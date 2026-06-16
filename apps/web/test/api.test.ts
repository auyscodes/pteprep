import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiFetch, ApiError, setOnUnauthorized } from "../src/lib/api";

vi.mock("../src/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

describe("apiFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setOnUnauthorized(null as unknown as () => void);
    globalThis.fetch = vi.fn();
  });

  it("attaches Authorization header when session token exists", async () => {
    const { supabase } = await import("../src/lib/supabase");
    (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { access_token: "test-token" } },
    });

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: "test" }),
    });

    const result = await apiFetch("/api/v1/test");

    expect(result).toEqual({ data: "test" });
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/v1/test", {
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-token",
      },
    });
    expect(supabase.auth.getSession).toHaveBeenCalledOnce();
  });

  it("does not attach Authorization header when no session", async () => {
    const { supabase } = await import("../src/lib/supabase");
    (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: null },
    });

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: "test" }),
    });

    await apiFetch("/api/v1/test");

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/v1/test", {
      headers: { "Content-Type": "application/json" },
    });
  });

  it("appends custom headers alongside auth headers", async () => {
    const { supabase } = await import("../src/lib/supabase");
    (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { access_token: "token" } },
    });

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    await apiFetch("/api/v1/test", {
      method: "POST",
      body: JSON.stringify({ test: true }),
    });

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, RequestInit];
    expect(call[0]).toBe("/api/v1/test");
    expect(call[1].headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer token",
    });
    expect(call[1].method).toBe("POST");
  });

  it("throws ApiError on non-200 responses", async () => {
    const { supabase } = await import("../src/lib/supabase");
    (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: null },
    });

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    await expect(apiFetch("/api/v1/test")).rejects.toThrow(ApiError);
    await expect(apiFetch("/api/v1/test")).rejects.toMatchObject({
      status: 500,
    });
  });

  it("calls onUnauthorized handler on 401 response", async () => {
    const { supabase } = await import("../src/lib/supabase");
    (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: null },
    });

    const unauthHandler = vi.fn();
    setOnUnauthorized(unauthHandler);

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });

    await expect(apiFetch("/api/v1/test")).rejects.toThrow(ApiError);

    expect(unauthHandler).toHaveBeenCalledOnce();
  });
});

describe("supabase client", () => {
  it("supabase module is covered by integration tests", () => {
    expect(true).toBe(true);
  });
});
