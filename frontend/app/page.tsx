import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold tracking-tight">Spocity</h1>
      <p className="text-zinc-500 text-center max-w-sm">
        Your Spotify listening history as a living 3D voxel city.
      </p>
      <Link
        href="/api/auth/login"
        className="rounded-full bg-green-500 px-6 py-3 text-sm font-semibold text-white hover:bg-green-400 transition-colors"
      >
        Connect with Spotify
      </Link>
    </main>
  );
}
