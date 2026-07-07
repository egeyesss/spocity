import Link from "next/link";
import { CtaButton } from "@/components/CtaButton";
import HeroCityLazy from "@/components/HeroCityLazy";
import { Wordmark } from "@/components/Wordmark";
import { DISTRICTS } from "@/lib/districts";

// Landing page in the same dusk language as the city itself: dark indigo
// sky, district palette accents, hard-edged pixel panels. The hero visual is
// a real slice of the 3D city (same components as /me), not an illustration.

const PANEL =
  "border-2 border-[#0a0812] bg-[rgba(15,12,24,0.7)] shadow-[4px_4px_0_0_rgba(0,0,0,0.45)]";

// Tier ladder for the "listen more, build taller" strip. Voxel counts are
// the real TIER_HEIGHTs; each tier borrows a district palette so the strip
// echoes the city's variety.
const TIERS: { name: string; voxels: number; color: string; dark: string }[] = [
  { name: "Shack", voxels: 1, color: "#22C55E", dark: "#15803D" },
  { name: "House", voxels: 3, color: "#FF69B4", dark: "#C71585" },
  { name: "Apartment", voxels: 6, color: "#F97316", dark: "#9A3412" },
  { name: "Office", voxels: 10, color: "#06B6D4", dark: "#0E7490" },
  { name: "Skyscraper", voxels: 18, color: "#FFC107", dark: "#B8860B" },
  { name: "Landmark", voxels: 30, color: "#6366F1", dark: "#3730A3" },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "Is it free?",
    a: "Yes. Spocity is a portfolio project — no plans, no paywall, no ads.",
  },
  {
    q: "What can Spocity see on my Spotify?",
    a: "Read-only listening data: your top artists and recently played tracks. It can't touch your playlists, can't control playback, and never posts anything. You can disconnect at any time from your Spotify account settings.",
  },
  {
    q: "Why is my city small on day one?",
    a: "Spotify only exposes your ranked top artists, so day one is a seeded sketch of your taste. From then on Spocity records your actual listening — every play adds a point to that artist's building, and the real city grows from what you play.",
  },
  {
    q: "How do districts work?",
    a: "Artists are classified into ten genre neighborhoods — pop, hip-hop, R&B/soul, rock, metal, electronic, folk, classical, jazz and latin — each with its own architecture and palette. Anything unclassifiable settles in the outskirts.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#13101f] text-zinc-100">
      {/* ── Hero (dusk sky) ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-b from-[#161129] via-[#1a1530] to-[#241a35]">
        {/* faint star field */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.16) 1px, transparent 1.5px), radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1.5px)",
            backgroundSize: "120px 120px, 70px 70px",
            backgroundPosition: "0 0, 40px 60px",
          }}
        />

        {/* Nav */}
        <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/" aria-label="spocity home">
            <Wordmark size={30} />
          </Link>
          <nav className="flex items-center gap-6">
            <a
              href="#how"
              className="hidden text-sm text-zinc-400 transition-colors hover:text-zinc-100 sm:block"
            >
              How it works
            </a>
            <a
              href="#districts"
              className="hidden text-sm text-zinc-400 transition-colors hover:text-zinc-100 sm:block"
            >
              Districts
            </a>
            <a
              href="#faq"
              className="hidden text-sm text-zinc-400 transition-colors hover:text-zinc-100 sm:block"
            >
              FAQ
            </a>
            <CtaButton size="sm" signedOutLabel="Sign in with Spotify" />
          </nav>
        </header>

        {/* Hero body */}
        <section className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 px-6 pb-20 pt-10 lg:grid-cols-2 lg:pb-28 lg:pt-16">
          <div>
            <p className="mb-5 font-pixel text-lg uppercase tracking-[0.2em] text-[#4ADE80]">
              — Now in beta
            </p>
            <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              Your listening,{" "}
              <span className="text-[#4ADE80]">built</span> as a city.
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-zinc-400">
              Spocity turns your Spotify history into a 3D voxel city you can
              wander. Each artist is a building. Each genre, a neighborhood.
              The more you listen, the taller it grows.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <CtaButton />
              {process.env.NEXT_PUBLIC_DEMO_ONLY !== "1" && (
                <Link
                  href="/demo"
                  className="inline-flex items-center gap-2 border-2 border-[#0a0812] bg-[rgba(15,12,24,0.7)] px-6 py-3 font-semibold text-zinc-200 shadow-[4px_4px_0_0_rgba(0,0,0,0.55)] transition-all hover:-translate-y-0.5 hover:bg-[rgba(25,20,38,0.85)]"
                >
                  See a sample city <span aria-hidden>→</span>
                </Link>
              )}
            </div>
            <p className="mt-6 font-pixel text-base uppercase tracking-[0.12em] text-zinc-500">
              Free · Read-only Spotify access · Never posts
            </p>
          </div>

          {/* live slice of the actual city */}
          <div className="h-[380px] lg:h-[500px]">
            <HeroCityLazy />
          </div>
        </section>
      </div>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24">
        <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
          From play history to skyline.
        </h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            {
              n: "01",
              title: "Connect",
              body: "Sign in with Spotify. Spocity reads your top artists and recent plays — nothing else, and it never posts on your behalf.",
            },
            {
              n: "02",
              title: "Get your city",
              body: "Your top artists seed a skyline within seconds. Every artist becomes a building, and genres settle into districts with their own architecture.",
            },
            {
              n: "03",
              title: "Watch it grow",
              body: "Spocity keeps listening with you. Every play adds a point, and buildings level up from shack to landmark as artists earn it.",
            },
          ].map((step) => (
            <div key={step.n} className={`${PANEL} p-6`}>
              <p className="font-pixel text-xl tracking-[0.15em] text-[#4ADE80]">
                {step.n}
              </p>
              <h3 className="mt-2 font-display text-xl font-bold">
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Districts ───────────────────────────────────────────────────── */}
      <section
        id="districts"
        className="border-y-2 border-[#0a0812] bg-[#161129]"
      >
        <div className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24">
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            Every genre gets a neighborhood.
          </h2>
          <p className="mt-4 max-w-2xl text-zinc-400">
            Hip-hop brownstones with gold trim. Electronic glasshouse towers.
            Jazz art-deco spires. Your taste decides which districts thrive —
            and how big each one gets.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {DISTRICTS.map((d) => (
              <span
                key={d.slug}
                className="border-2 px-3 py-1.5 font-pixel text-base uppercase tracking-[0.08em] text-[#12100a] shadow-[3px_3px_0_0_rgba(0,0,0,0.45)]"
                style={{
                  backgroundColor: d.color_palette[1],
                  borderColor: d.color_palette[2],
                }}
              >
                {d.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tiers ───────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
          Listen more. Build taller.
        </h2>
        <p className="mt-4 max-w-2xl text-zinc-400">
          One voxel per point. Buildings climb six tiers as you keep an artist
          in rotation — a landmark is years of listening, standing in the
          skyline.
        </p>
        <div className="mt-12 flex items-end gap-4 overflow-x-auto pb-2 sm:gap-8">
          {TIERS.map((t) => (
            <div key={t.name} className="flex shrink-0 flex-col items-center gap-3">
              <div
                className="w-9 border-2 border-[#0a0812] sm:w-11"
                style={{
                  height: t.voxels * 9,
                  background: `repeating-linear-gradient(180deg, ${t.color} 0px, ${t.color} 7px, ${t.dark} 7px, ${t.dark} 9px)`,
                  boxShadow: "4px 4px 0 0 rgba(0,0,0,0.45)",
                }}
              />
              <div className="text-center">
                <p className="font-pixel text-base uppercase tracking-[0.08em] text-zinc-300">
                  {t.name}
                </p>
                <p className="font-pixel text-sm text-zinc-600">
                  {t.voxels} voxel{t.voxels > 1 ? "s" : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────── */}
      <section id="faq" className="border-t-2 border-[#0a0812] bg-[#161129]">
        <div className="mx-auto max-w-3xl scroll-mt-20 px-6 py-24">
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            Questions, answered.
          </h2>
          <div className="mt-8 flex flex-col gap-4">
            {FAQS.map((f) => (
              <details key={f.q} className={`${PANEL} group px-5 py-4`}>
                <summary className="flex cursor-pointer list-none items-center justify-between font-display font-semibold text-zinc-100">
                  {f.q}
                  <span
                    aria-hidden
                    className="ml-4 font-pixel text-xl text-[#4ADE80] transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-b from-[#161129] to-[#241a35]">
        <div className="mx-auto flex max-w-6xl flex-col items-center px-6 py-24 text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-5xl">
            Ready to see your skyline?
          </h2>
          <p className="mt-4 max-w-md text-zinc-400">
            Your city is already in your listening history. It takes about ten
            seconds to build.
          </p>
          <div className="mt-8">
            <CtaButton />
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t-2 border-[#0a0812] bg-[#0f0c18]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <Wordmark size={20} color="#a6a0b8" />
          <p className="text-xs text-zinc-600">
            Not affiliated with Spotify AB · Built by Ege Yesilyurt
          </p>
        </div>
      </footer>
    </div>
  );
}
