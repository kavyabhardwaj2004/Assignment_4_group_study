import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  weight: ["300", "400", "500", "600", "700", "800"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Synapse - Real-Time Collaborative Study Rooms & AI Mentors",
  description: "Boost your productivity with Synapse: Join study rooms, sync countdown timers with peers, interact with custom AI mentors, generate mindmaps and flashcards, and track progress with anti-cheat assessments.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${outfit.variable} ${inter.variable} font-sans antialiased text-slate-100 min-h-screen flex flex-col`}
      >
        {children}
      </body>
    </html>
  );
}
