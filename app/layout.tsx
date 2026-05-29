import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "openPinna",
  description: "Browser-first research note capture for solo researchers.",
  icons: {
    icon: "/icons/openPinnaLogo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="paper-depth min-h-[100dvh]">
          <header className="px-4 pt-5 md:pt-7">
            <div className="mx-auto flex max-w-7xl items-center justify-between border border-[var(--border)] bg-white/90 px-4 py-3 shadow-[0_12px_32px_-28px_rgba(17,17,17,0.28)] backdrop-blur-md md:px-5">
              <Link href="/" className="flex items-center gap-3">
                <span className="grid h-9 w-9 overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--muted)]">
                  <img
                    src="/icons/openPinnaLogo.png"
                    alt=""
                    aria-hidden="true"
                    className="h-full w-full object-cover"
                  />
                </span>
                <span className="font-editorial text-xl font-semibold tracking-[-0.03em]">
                  openPinna
                </span>
              </Link>
              <nav className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                <Link
                  href="/notes"
                  className="rounded-[6px] px-3 py-2 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  Notes
                </Link>
                <Link
                  href="/notes/new"
                  className="btn-primary rounded-[6px] px-3 py-2 font-medium transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]"
                >
                  New note
                </Link>
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-16">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
