import { addMoney, needsReorder, orderValue, type DashboardItem } from "./dashboard";
import type { Money } from "./types";

export const NO_VENDOR = "No vendor";

export interface VendorGroup {
  vendor: string;
  items: DashboardItem[];
  units: number;
  value: Money | null;
  itemsWithoutCost: number;
}

/** Items needing a reorder, grouped by the product's vendor so each supplier gets one list. */
export function purchaseListByVendor(items: readonly DashboardItem[]): VendorGroup[] {
  const groups = new Map<string, VendorGroup>();
  for (const item of items) {
    if (!needsReorder(item)) continue;
    const vendor = item.level.vendor?.trim() || NO_VENDOR;
    const group = groups.get(vendor) ?? { vendor, items: [], units: 0, value: null, itemsWithoutCost: 0 };
    group.items.push(item);
    group.units += item.reorder?.recommendedQuantity ?? 0;
    const value = orderValue(item);
    if (value) group.value = addMoney(group.value, value);
    else group.itemsWithoutCost += 1;
    groups.set(vendor, group);
  }
  // Named vendors alphabetically, items without a vendor last.
  return [...groups.values()].sort((a, b) =>
    a.vendor === NO_VENDOR ? 1 : b.vendor === NO_VENDOR ? -1 : a.vendor.localeCompare(b.vendor),
  );
}

/**
 * Quotes a CSV cell. Cells starting with =, +, - or @ get a leading apostrophe so spreadsheet
 * apps show them as text instead of running them as formulas (CSV injection).
 */
export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const CSV_COLUMNS = [
  "Vendor",
  "Product",
  "Variant",
  "SKU",
  "Location",
  "Available",
  "Incoming",
  "Order quantity",
  "Cost per item",
  "Order value",
  "Currency",
];

/** The purchase list as CSV, one row per item to reorder, ready to send to suppliers. */
export function purchaseListCsv(groups: readonly VendorGroup[]): string {
  const rows = groups.flatMap((group) =>
    group.items.map((item) => {
      const value = orderValue(item);
      return [
        group.vendor,
        item.level.productTitle,
        item.level.variantTitle,
        item.level.sku,
        item.level.locationName,
        item.level.available,
        item.level.incoming,
        item.reorder?.recommendedQuantity ?? 0,
        item.level.unitCost?.amount ?? null,
        value ? Number(value.amount.toFixed(2)) : null,
        item.level.unitCost?.currencyCode ?? null,
      ];
    }),
  );
  // CRLF line endings and a byte-order mark help Excel open the file correctly.
  return `﻿${[CSV_COLUMNS, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export interface IdleStock {
  items: DashboardItem[];
  units: number;
  value: Money | null;
}

/**
 * Stock that hasn't sold at all in the sales window, with its value at cost: money tied up on
 * the shelf. Needs real sales data, so it's empty without it.
 */
export function idleStock(items: readonly DashboardItem[], salesDemand: Record<string, number> | null): IdleStock {
  const idle: IdleStock = { items: [], units: 0, value: null };
  if (!salesDemand) return idle;

  for (const item of items) {
    if (item.level.available <= 0 || salesDemand[item.level.id] !== 0) continue;
    idle.items.push(item);
    idle.units += item.level.available;
    const cost = item.level.unitCost;
    if (cost) idle.value = addMoney(idle.value, { amount: cost.amount * item.level.available, currencyCode: cost.currencyCode });
  }

  const valueOf = (item: DashboardItem) => (item.level.unitCost?.amount ?? 0) * item.level.available;
  idle.items.sort((a, b) => valueOf(b) - valueOf(a) || b.level.available - a.level.available);
  return idle;
}
