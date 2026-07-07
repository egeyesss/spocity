"use client";

import { useState } from "react";

// Top-right owner controls on your own city, styled to match the demo/public
// pages' floating pixel panels: copy your public share link + log out.
const BTN =
  "border-2 border-[#0a0812] bg-[rgba(15,12,24,0.7)] px-3 py-2 font-pixel text-sm uppercase tracking-[0.1em] text-zinc-200 shadow-[3px_3px_0_0_rgba(0,0,0,0.55)] backdrop-blur transition-all hover:-translate-y-0.5 hover:text-[#4ADE80]";

export default function CityControls({
  username,
}: {
  username: string | null;
}) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    if (!username) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/${username}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked — no-op
    }
  };

  const onLogout = () => {
    // Clear the client-side cache before the form navigates away.
    localStorage.removeItem("spocity_user");
  };

  return (
    <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
      {username && (
        <button type="button" onClick={share} className={BTN}>
          {copied ? "Link copied ✓" : "Share city"}
        </button>
      )}
      <form action="/api/auth/logout" method="post" onSubmit={onLogout}>
        <button type="submit" className={BTN}>
          Log out
        </button>
      </form>
    </div>
  );
}
