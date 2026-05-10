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
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function fetchAPI<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;

  const res = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    throw new ApiError(res.status, `API ${res.status}: ${url}`);
  }

  return res.json() as Promise<T>;
}
