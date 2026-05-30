import { LoadingOverlay } from "@/components/ui/LoadingOverlay";

export default function LoadingNoteResearchPage() {
  return (
    <div className="relative min-h-[72vh]">
      <LoadingOverlay active label="Loading note canvas..." fullScreen={false} zIndexClass="z-20" />
    </div>
  );
}
