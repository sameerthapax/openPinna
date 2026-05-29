import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { GlobalNavControls } from "@/components/navigation/GlobalNavControls";
import "./globals.css";

export const metadata: Metadata = {
  title: "openPinna",
  description: "Browser-first research note capture for solo researchers.",
  icons: { icon: "/icons/openPinnaLogo.png" },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="paper-depth min-h-[100dvh]">
          <header className="sticky top-0 z-20 px-4 pt-5 md:pt-7">
            <div className="mx-auto flex max-w-7xl items-center justify-between rounded-[22px] border border-white/60 bg-[rgba(247,246,243,0.78)] px-4 py-3 shadow-[0_22px_48px_-36px_rgba(17,17,17,0.45)] backdrop-blur-xl md:px-5">
              <Link href="/" className="flex items-center gap-3">
                <span className="grid h-9 w-9 overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--muted)]">
                  <img src="/icons/openPinnaLogo.png" alt="" aria-hidden="true" className="h-full w-full object-cover" />
                </span>
                <span className="font-editorial text-xl font-semibold tracking-[-0.03em]">openPinna</span>
              </Link>
              <GlobalNavControls />
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-12">{children}</main>
        </div>
      </body>
    </html>
  );
}
