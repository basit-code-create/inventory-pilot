"use client";

import { useCallback, useSyncExternalStore, type KeyboardEvent } from "react";

const subscribeToHash = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

/**
 * The selected tab lives in the URL hash (#inventory), so the browser's back button and reloads
 * keep the merchant's place. Hash changes don't trigger a Next.js navigation, so data stays loaded.
 */
export function useHashTab<T extends string>(tabs: readonly T[], fallback: T): [T, (tab: T) => void] {
  const read = useCallback((): T => {
    const id = window.location.hash.slice(1);
    return (tabs as readonly string[]).includes(id) ? (id as T) : fallback;
  }, [tabs, fallback]);

  const tab = useSyncExternalStore(subscribeToHash, read, () => fallback);
  const select = useCallback(
    (next: T) => {
      if (next !== read()) window.location.hash = next;
      window.scrollTo({ top: 0 });
    },
    [read],
  );
  return [tab, select];
}

export interface TabItem<T extends string> {
  id: T;
  label: string;
  badge?: number;
}

interface TabsProps<T extends string> {
  tabs: readonly TabItem<T>[];
  selected: T;
  onSelect: (tab: T) => void;
  label: string;
}

/** Shopify admin style tabs: underlined, scrolling sideways on small screens, arrow keys move between them. */
export function Tabs<T extends string>({ tabs, selected, onSelect, label }: TabsProps<T>) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    onSelect(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  }

  return (
    // The divider is an inset shadow rather than a border, so the active tab's underline can sit on it without
    // overflowing; overflow-y is hidden so Windows never shows a vertical scrollbar, and the sideways one for
    // narrow screens is hidden too, as in the Shopify admin.
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--border)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab, index) => {
        const active = tab.id === selected;
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${
              active
                ? "border-foreground font-semibold text-foreground"
                : "border-transparent text-muted hover:border-border-strong hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="rounded-full bg-surface-selected px-1.5 text-xs tabular-nums text-foreground">
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
