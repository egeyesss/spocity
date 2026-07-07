import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import CityCanvas from "./city/CityCanvas";
import CityControls from "./CityControls";
import { Wordmark } from "@/components/Wordmark";

const PANEL =
  "border-2 border-[#0a0812] bg-[rgba(15,12,24,0.88)] shadow-[3px_3px_0_0_rgba(0,0,0,0.55)] backdrop-blur";

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
    return res.json() as Promise<{
      display_name: string;
      spotify_user_id: string;
      username: string | null;
    }>;
  } catch {
    return null;
  }
}

export default async function MePage() {
  const user = await getUser();

  if (!user) redirect("/");

  // Same full-screen-canvas + floating-pixel-panel layout as the demo and
  // public city pages, so the owner's own city looks identical to the one
  // visitors see (just with owner controls instead of a "build yours" CTA).
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#13101f]">
      <CityCanvas />

      {/* Whose city this is */}
      <div
        className={`absolute left-4 top-4 z-20 flex items-center gap-3 px-3 py-2 ${PANEL}`}
      >
        <Link href="/" aria-label="spocity home">
          <Wordmark size={22} />
        </Link>
        <span className="font-pixel text-sm uppercase tracking-[0.1em] text-zinc-300">
          {user.display_name}&apos;s city
        </span>
      </div>

      {/* Owner controls */}
      <CityControls username={user.username} />
    </div>
  );
}
