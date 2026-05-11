const getBaseUrl = (): string => {
  if (typeof window === "undefined") {
    // Server-side (SSR / React Server Components): reach Django via Docker
    // internal DNS. The container name "backend" resolves inside the network.
    return process.env.API_URL ?? "http://backend:8000";
  }
  // Client-side (browser): must use a URL reachable from the user's machine.
  return process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseErrorMessage(res: Response): Promise<string> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body = await res.json();
      // DRF uses "detail"; some views use "error" or "message"
      return body?.detail ?? body?.error ?? body?.message ?? res.statusText;
    } catch {
      // JSON parse failed — fall through to statusText
    }
  }
  return res.statusText || `HTTP ${res.status}`;
}

export async function fetchAPI<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "include",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
  } catch (err) {
    // Network failure (no connection, DNS error, etc.)
    throw new ApiError(0, "Network error — could not reach the server", err);
  }

  if (!res.ok) {
    const message = await parseErrorMessage(res);
    throw new ApiError(res.status, message);
  }

  return res.json() as Promise<T>;
}
