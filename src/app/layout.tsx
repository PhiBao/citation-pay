import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MotionConfig } from "motion/react";
import { AppShell } from "@/components/app-shell";
import { ToastProvider } from "@/components/toast";
import { SessionProvider } from "@/components/session-provider";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-sans"
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono"
});

export const metadata: Metadata = {
  title: {
    default: "CitationPay — paid citations for AI agents on Arc",
    template: "%s · CitationPay"
  },
  description:
    "CitationPay makes citation a payable event. AI agents search, score, and pay per-citation via x402 nanopayments on Arc. Publishers earn USDC the moment their work grounds an answer.",
  applicationName: "CitationPay",
  keywords: [
    "x402",
    "nanopayments",
    "Arc",
    "Circle",
    "USDC",
    "MCP",
    "Model Context Protocol",
    "agentic payments",
    "creator monetization"
  ],
  openGraph: {
    title: "CitationPay — paid citations for AI agents",
    description:
      "Citation is a payable event. AI agents pay per-citation via x402 on Arc. Publishers earn USDC.",
    type: "website"
  }
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        <MotionConfig reducedMotion="user">
          <ToastProvider>
            <SessionProvider>
              <AppShell>{children}</AppShell>
            </SessionProvider>
          </ToastProvider>
        </MotionConfig>
      </body>
    </html>
  );
}
