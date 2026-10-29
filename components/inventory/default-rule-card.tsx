import { calculateReorderPoint, type ReorderOptions } from "@/lib/inventory/reorder";
import { formatDemand, plural } from "@/lib/inventory/format";
import type { ReorderRule } from "@/lib/inventory/types";
import { Button } from "@/components/ui/button";
import { SlidersIcon } from "@/components/ui/icons";
import { cardClass } from "@/components/ui/styles";

interface DefaultRuleCardProps {
  rule: ReorderRule;
  options: ReorderOptions;
  /** True when items get their demand from sales history, so the default demand is only a fallback. */
  usesSalesDemand: boolean;
  customRules: number;
  totalItems: number;
  onEdit: () => void;
}

export function DefaultRuleCard({ rule, options, usesSalesDemand, customRules, totalItems, onEdit }: DefaultRuleCardProps) {
  const countsIncoming = options.incomingStock === "include";
  const values = [
    {
      label: usesSalesDemand ? "Demand without sales data" : "Avg daily demand",
      value: `${formatDemand(rule.averageDailyDemand)} / day`,
    },
    { label: "Lead time", value: plural(rule.leadTimeDays, "day") },
    { label: "Safety stock", value: plural(rule.safetyStock, "unit") },
    { label: "Target stock", value: plural(rule.targetStock, "unit") },
    { label: "Reorder point", value: plural(calculateReorderPoint(rule), "unit") },
    { label: "Incoming stock", value: countsIncoming ? "Counted" : "Ignored" },
  ];

  return (
    <section aria-labelledby="default-rule-heading" className={`${cardClass} p-4 sm:p-5`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="default-rule-heading" className="text-sm font-semibold">
            Default reorder rule
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Applies wherever an item doesn&apos;t set its own value. {customRules} of {totalItems} items have a
            custom rule.
          </p>
        </div>
        <Button onClick={onEdit} className="self-start">
          <SlidersIcon />
          Edit defaults
        </Button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {values.map((item) => (
          <div key={item.label} className="rounded-lg bg-surface-muted px-3 py-2">
            <dt className="text-xs text-muted">{item.label}</dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-xs leading-relaxed text-muted">
        <span className="font-medium text-foreground">How recommendations work:</span> reorder point = average
        daily demand × lead time + safety stock.
        {usesSalesDemand && " Each item's demand comes from its recent sales unless you set it yourself."} When{" "}
        {countsIncoming ? "available + incoming" : "available"} stock is at or below the reorder point, the recommended
        order brings it back up to the target stock.
      </p>
    </section>
  );
}
