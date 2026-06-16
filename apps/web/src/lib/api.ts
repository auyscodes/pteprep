let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(handler: () => void): void {
  onUnauthorized = handler;
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const { supabase } = await import("./supabase");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = await getAuthHeaders();
  const mergedHeaders = { ...headers, ...options.headers };

  const response = await fetch(path, {
    ...options,
    headers: mergedHeaders,
  });

  if (response.status === 401) {
    if (onUnauthorized) {
      onUnauthorized();
    }
    throw new ApiError("Unauthorized", 401);
  }

  if (!response.ok) {
    throw new ApiError(
      `Request failed: ${response.statusText}`,
      response.status
    );
  }

  return response.json() as Promise<T>;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
