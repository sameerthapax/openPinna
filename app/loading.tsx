export default function GlobalRouteLoading() {
  return (
    <div className="space-y-10 pb-16" aria-busy="true" aria-live="polite">
      <section className="grid gap-6 border-b border-[var(--border)] pb-8 md:grid-cols-[1fr_14rem] md:items-end">
        <div className="space-y-4">
          <div className="h-4 w-36 animate-pulse bg-[var(--muted)]" />
          <div className="h-14 w-full max-w-3xl animate-pulse bg-[var(--muted)]" />
          <div className="h-5 w-full max-w-2xl animate-pulse bg-[var(--muted)]" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="h-10 animate-pulse bg-[var(--muted)]" />
          <div className="h-10 animate-pulse bg-[var(--muted)]" />
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-[1.25fr_0.75fr]">
        <div className="border border-[var(--border)] bg-[var(--surface)] p-7 md:p-9">
          <div className="h-6 w-1/3 animate-pulse bg-[var(--muted)]" />
          <div className="mt-4 h-4 w-5/6 animate-pulse bg-[var(--muted)]" />
          <div className="mt-2 h-4 w-2/3 animate-pulse bg-[var(--muted)]" />
          <div className="mt-8 grid gap-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-14 animate-pulse border border-[var(--border)] bg-[var(--surface-soft)]" />
            ))}
          </div>
        </div>

        <div className="border border-[var(--border)] bg-[var(--surface)] p-7 md:p-9">
          <div className="h-5 w-24 animate-pulse bg-[var(--muted)]" />
          <div className="mt-5 h-24 animate-pulse bg-[var(--muted)]" />
          <div className="mt-3 h-24 animate-pulse bg-[var(--muted)]" />
        </div>
      </section>
    </div>
  );
}
