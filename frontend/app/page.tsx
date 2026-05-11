import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center gap-8 px-6 py-24 text-center">
        <div className="flex flex-col items-center gap-4 max-w-2xl">
          <h1 className="text-6xl font-bold tracking-tight">Spocity</h1>
          <p className="text-xl text-zinc-400 max-w-md">
            Your Spotify listening history as a living 3D voxel city. Every
            artist you love becomes a building. Play more, build higher.
          </p>
        </div>

        <Link
          href="/api/auth/login"
          className="rounded-full bg-green-500 px-8 py-4 text-base font-semibold text-white hover:bg-green-400 transition-colors"
        >
          Build your city
        </Link>

        {/* Feature bullets */}
        <ul className="mt-4 flex flex-col gap-2 text-sm text-zinc-500">
          <li>🏙 One building per artist — height driven by how much you listen</li>
          <li>🎵 Genre districts group your taste into neighbourhoods</li>
          <li>📈 Decay algorithm means your city evolves week by week</li>
        </ul>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-zinc-600 border-t border-zinc-800">
        Spocity is not affiliated with Spotify AB.{" "}
        <span className="text-zinc-700">Built by Ege Yesilyurt.</span>
      </footer>
    </div>
  );
}
