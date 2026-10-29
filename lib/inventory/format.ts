import type { Money } from "./types";

const unitsFormat = new Intl.NumberFormat("en-US");
const demandFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function formatUnits(value: number): string {
  return unitsFormat.format(value);
}

export function formatDemand(value: number): string {
  return demandFormat.format(value);
}

/** "3 units", "1 day" */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatUnits(count)} ${count === 1 ? singular : pluralForm}`;
}

/** Shopify names the only variant of a single-variant product "Default Title". */
export function formatVariantTitle(title: string): string {
  return title === "Default Title" ? "Default variant" : title;
}

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

export function formatMoney({ amount, currencyCode }: Money): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(amount);
  } catch {
    // An unknown currency code would throw; show the number with its code instead.
    return `${demandFormat.format(amount)} ${currencyCode}`;
  }
}

const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

/** "in 12 days (Nov 10)", "today", or "out now". */
export function formatRunsOut(daysOfCover: number, now = new Date()): string {
  if (daysOfCover <= 0) return "Out now";
  const days = Math.floor(daysOfCover);
  if (days === 0) return "Runs out today";
  const date = new Date(now.getTime() + days * 86_400_000);
  return `Runs out in ${plural(days, "day")} (${dateFormat.format(date)})`;
}
