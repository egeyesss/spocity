import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import CityCanvas from "./city/CityCanvas";
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
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <div className="flex items-baseline gap-3">
          <span className="font-semibold tracking-tight">Spocity</span>
          <span className="text-sm text-zinc-500">
            Hello, {user.display_name}
          </span>
        </div>
        <LogoutButton />
      </header>

      <main className="relative flex-1 overflow-hidden">
        <CityCanvas />
      </main>
    </div>
  );
}
