"use client";

export function OpenCreateButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("open-create-modal"))}
      className="btn-primary rounded-[6px] px-3 py-2 text-sm font-medium"
    >
      {label}
    </button>
  );
}
