export default function NotesLoading() {
  return (
    <div className="space-y-10 pb-16">
      <div className="grid gap-6 border-b border-[var(--border)] pb-8 md:grid-cols-[1fr_10rem] md:items-end">
        <div className="space-y-4">
          <div className="h-5 w-36 animate-pulse bg-[var(--muted)]" />
          <div className="h-14 w-full max-w-md animate-pulse bg-[var(--muted)]" />
          <div className="h-5 w-full max-w-xl animate-pulse bg-[var(--muted)]" />
        </div>
        <div className="h-10 animate-pulse bg-[var(--muted)]" />
      </div>
      <div className="grid gap-4">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="border border-[var(--border)] bg-white p-7"
          >
            <div className="h-6 w-2/5 animate-pulse bg-[var(--muted)]" />
            <div className="mt-4 h-4 w-3/5 animate-pulse bg-[var(--muted)]" />
            <div className="mt-6 h-20 animate-pulse bg-[var(--muted)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
