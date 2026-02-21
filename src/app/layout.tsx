import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "OpenClap",
    template: "%s | OpenClap",
  },
  description:
    "OpenClap is a local-first orchestration system for high-volume AI task execution across projects and subprojects.",
  keywords: [
    "OpenClap",
    "AI orchestration",
    "local-first task manager",
    "Codex task management",
    "project automation",
    "subproject orchestration",
    "parallel task pipelines",
  ],
  icons: {
    icon: [{ url: "/openclap-clap.svg", type: "image/svg+xml" }],
    shortcut: "/openclap-clap.svg",
    apple: "/openclap-clap.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
