import { describe, expect, it } from "vitest";
import { buildDashboardItems } from "./dashboard";
import { DEMO_LEVELS, DEMO_RULE_OVERRIDES } from "./demo-data";
import { buildHistoryEntry, MAX_HISTORY_ITEMS } from "./history";
import { DEFAULT_REORDER_RULE } from "./rules";

const items = buildDashboardItems(DEMO_LEVELS, DEFAULT_REORDER_RULE, DEMO_RULE_OVERRIDES);
const now = new Date("2026-10-29T12:00:00Z");

describe("buildHistoryEntry", () => {
  it("summarises every item but keeps only those that need a reorder", () => {
    const entry = buildHistoryEntry(items, "sync", "include", now);
    expect(entry).toMatchObject({
      id: null,
      createdAt: "2026-10-29T12:00:00.000Z",
      trigger: "sync",
      summary: { stockLevels: 21, needsReorder: 10, recommendedUnits: 483 },
      itemsTruncated: false,
    });
    expect(entry.items).toHaveLength(10);
    expect(entry.items.every((item) => item.recommendedQuantity > 0)).toBe(true);
  });

  it("caps very large entries and says so", () => {
    const many = Array.from({ length: MAX_HISTORY_ITEMS + 1 }, () => items[0]);
    const entry = buildHistoryEntry(many, "sync", "include", now);
    expect(entry.items).toHaveLength(MAX_HISTORY_ITEMS);
    expect(entry.itemsTruncated).toBe(true);
  });
});
