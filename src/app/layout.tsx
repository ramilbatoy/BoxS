import type { Metadata } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const sans = Outfit({
  variable: "--font-sans",
  subsets: ["latin"],
});

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3017"),
  title: { default: "BoxS subscriptions", template: "%s · BoxS" },
  description: "A flexible subscription platform for meals, memberships, and services.",
  openGraph: { title: "BoxS subscriptions", description: "Plans, billing, and delivery in one place.", type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} h-full`}>
      <body className="min-h-full bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
