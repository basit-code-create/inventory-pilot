import type { InventoryLevel, SalesHistory } from "./types";

/**
 * Average daily demand for each stock level (`${variantId}@${locationId}`) over the sales window.
 *
 * Units fulfilled from a location count for that location. Units with no location (orders not
 * fulfilled yet), and units fulfilled from locations that no longer stock the variant, are shared
 * out in proportion to where the variant was fulfilled from, or evenly if it never was. A tracked
 * variant with no sales gets 0, because no sales is real data too.
 */
export function demandByLevel(levels: readonly InventoryLevel[], sales: SalesHistory): Record<string, number> {
  const locationsByVariant = new Map<string, string[]>();
  for (const level of levels) {
    if (!level.tracked) continue;
    const locations = locationsByVariant.get(level.variantId) ?? [];
    locations.push(level.locationId);
    locationsByVariant.set(level.variantId, locations);
  }

  const demand: Record<string, number> = {};
  for (const [variantId, locationIds] of locationsByVariant) {
    const variantSales = sales.variants[variantId];
    const stocked = new Set(locationIds);

    let unassigned = variantSales?.unassigned ?? 0;
    for (const [locationId, units] of Object.entries(variantSales?.byLocation ?? {})) {
      if (!stocked.has(locationId)) unassigned += units;
    }
    const assigned = locationIds.map((locationId) => variantSales?.byLocation[locationId] ?? 0);
    const assignedTotal = assigned.reduce((sum, units) => sum + units, 0);

    locationIds.forEach((locationId, index) => {
      const share = assignedTotal > 0 ? assigned[index] / assignedTotal : 1 / locationIds.length;
      demand[`${variantId}@${locationId}`] = (assigned[index] + unassigned * share) / sales.windowDays;
    });
  }
  return demand;
}
