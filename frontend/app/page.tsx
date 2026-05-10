import { fetchAPI } from "@/lib/api";

// This component runs on the server — fetch goes through Docker internal DNS
// (http://backend:8000). Proves SSR → Django works before we build real pages.
export default async function Home() {
  let backendStatus = "unreachable";
  try {
    const data = await fetchAPI<{ status: string }>("/api/health/");
    backendStatus = data.status;
  } catch {
    backendStatus = "error";
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">Spocity</h1>
      <p className="text-zinc-500">
        Backend:{" "}
        <span className={backendStatus === "ok" ? "text-green-500" : "text-red-500"}>
          {backendStatus}
        </span>
      </p>
      <p className="text-xs text-zinc-400">
        (This page will become the landing page in a later task.)
      </p>
    </main>
  );
}
