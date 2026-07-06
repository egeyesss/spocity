import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk, VT323 } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display font for headings / artist names (brand decision §4).
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

// Pixel font — in-city HUD only, never on marketing surfaces.
const vt323 = VT323({
  variable: "--font-vt323",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "spocity — your listening, as a city",
  description:
    "A living voxel city built from your Spotify listening. Every artist is a building; your taste shapes the skyline.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${vt323.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
          <AuthProvider>{children}</AuthProvider>
        </body>
    </html>
  );
}
