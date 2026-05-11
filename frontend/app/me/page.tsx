import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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

  if (!user) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">Hello, {user.display_name}</h1>
      <p className="text-zinc-500">Your city is being built...</p>
      <p className="text-zinc-500">Your city is being built.</p>
    </main>
  );
}
