import { plural } from "@/lib/inventory/format";
import type { DataSource } from "@/lib/inventory/types";
import { Button } from "@/components/ui/button";
import { AlertIcon, BoxIcon, RefreshIcon, SearchIcon } from "@/components/ui/icons";
import { cardClass } from "@/components/ui/styles";

function Bone({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-skeleton ${className}`} />;
}

export function DashboardSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-5">
      <span className="sr-only">Loading inventory…</span>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className={`${cardClass} p-4`}>
            <Bone className="h-4 w-24" />
            <Bone className="mt-3 h-8 w-14" />
            <Bone className="mt-2 h-3 w-36" />
          </div>
        ))}
      </div>
      <div className={`${cardClass} p-4 sm:p-5`}>
        <Bone className="h-4 w-40" />
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <Bone key={index} className="h-12" />
          ))}
        </div>
      </div>
      <div className={cardClass}>
        <div className="flex gap-2 border-b border-border p-4">
          <Bone className="h-9 flex-1" />
          <Bone className="h-9 w-40" />
        </div>
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex items-center gap-4 border-b border-border px-4 py-4 last:border-0">
            <div className="flex-1">
              <Bone className="h-4 w-44" />
              <Bone className="mt-2 h-3 w-24" />
            </div>
            <Bone className="hidden h-4 w-20 sm:block" />
            <Bone className="hidden h-4 w-24 md:block" />
            <Bone className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className={`${cardClass} flex flex-col items-center px-6 py-14 text-center`}>
      <span className="flex size-11 items-center justify-center rounded-full bg-critical-bg text-critical-fg">
        <AlertIcon width={22} height={22} />
      </span>
      <h2 className="mt-4 text-base font-semibold">Couldn&apos;t load inventory</h2>
      <p className="mt-1 max-w-md text-sm text-muted">{message}</p>
      <Button variant="primary" className="mt-5" onClick={onRetry}>
        <RefreshIcon />
        Try again
      </Button>
    </div>
  );
}

export function EmptyState({ source, untrackedCount }: { source: DataSource; untrackedCount: number }) {
  return (
    <div className={`${cardClass} flex flex-col items-center px-6 py-14 text-center`}>
      <span className="flex size-11 items-center justify-center rounded-full bg-surface-selected text-muted">
        <BoxIcon width={22} height={22} />
      </span>
      <h2 className="mt-4 text-base font-semibold">No tracked inventory yet</h2>
      <p className="mt-1 max-w-md text-sm text-muted">
        Variants show up here once inventory tracking is turned on for them in Shopify.
        {untrackedCount > 0 && ` ${plural(untrackedCount, "untracked variant")} hidden.`}
      </p>
      {source === "demo" && (
        <p className="mt-3 text-xs text-muted">
          This is the empty preview. Switch “Preview state” to “Sample inventory” to see demo data.
        </p>
      )}
    </div>
  );
}

export function NoResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-surface-selected text-muted">
        <SearchIcon width={22} height={22} />
      </span>
      <h3 className="mt-4 text-base font-semibold">No items match these filters</h3>
      <p className="mt-1 text-sm text-muted">Try a different search, status or location.</p>
      <Button className="mt-5" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  );
}
