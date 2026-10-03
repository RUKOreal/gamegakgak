import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rider Quiz — Kamen Rider Song Guessing Game",
  description:
    "Test your Kamen Rider knowledge! A real-time multiplayer song guessing game. Create a room, invite friends, and guess the Kamen Rider opening themes.",
  keywords: ["Kamen Rider", "quiz", "song guessing", "multiplayer", "game", "tokusatsu"],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col relative z-10">{children}</body>
    </html>
  );
}
