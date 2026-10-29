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
