import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LogoutButton from "./LogoutButton";

async function getUser() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("sessionid");

  if (!sessionCookie) return null;

  try {
    const res = await fetch(`${process.env.API_URL}/api/auth/me/`, {
      headers: { Cookie: `sessionid=${sessionCookie.value}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json() as Promise<{ display_name: string; spotify_user_id: string }>;
  } catch {
    return null;
  }
}

export default async function MePage() {
  const user = await getUser();

  if (!user) redirect("/");

  return (
    <div className="flex flex-col min-h-screen">
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <span className="font-semibold tracking-tight">Spocity</span>
        <LogoutButton />
      </header>

      <main className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
        <h1 className="text-4xl font-bold">Hello, {user.display_name}</h1>
        <p className="text-zinc-500">
          Your city is coming in Week 4. Hang tight.
        </p>

        {/* Placeholder for the Week 4 <CityCanvas /> */}
        <div className="mt-8 w-full max-w-2xl h-64 rounded-xl border border-zinc-800 flex items-center justify-center text-zinc-700 text-sm">
          3D city renders here
        </div>
      </main>
    </div>
  );
}
