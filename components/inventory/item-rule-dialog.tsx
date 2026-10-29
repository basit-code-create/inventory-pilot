"use client";

import { useState, type FormEvent } from "react";
import type { DashboardItem } from "@/lib/inventory/dashboard";
import { calculateReorder, calculateReorderPoint, type ReorderOptions } from "@/lib/inventory/reorder";
import {
  draftToOverride,
  hasRuleErrors,
  resolveRule,
  ruleToDraft,
  validateRule,
  type RuleDraft,
  type RuleField,
} from "@/lib/inventory/rules";
import { formatDemand, formatUnits, formatVariantTitle, plural } from "@/lib/inventory/format";
import type { DataSource, ReorderRule, ReorderRuleOverride } from "@/lib/inventory/types";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { NumberField } from "@/components/ui/number-field";
import { DemoBadge, LiveBadge } from "./status-badge";

interface ItemRuleDialogProps {
  item: DashboardItem | null;
  source: DataSource;
  defaults: ReorderRule;
  override: ReorderRuleOverride | undefined;
  /** This item's sales-based demand, or null without sales history. */
  salesDemand: number | null;
  salesWindowDays: number | null;
  options: ReorderOptions;
  /** An empty override means "use the default rule". */
  onSave: (levelId: string, override: ReorderRuleOverride) => void;
  onClose: () => void;
}

export function ItemRuleDialog({ item, onClose, ...formProps }: ItemRuleDialogProps) {
  return (
    <Modal
      open={item !== null}
      title="Reorder rule"
      description={
        item &&
        `${item.level.productTitle} · ${formatVariantTitle(item.level.variantTitle)} · ${item.level.locationName}`
      }
      onClose={onClose}
    >
      {item && <ItemRuleForm key={item.level.id} item={item} onClose={onClose} {...formProps} />}
    </Modal>
  );
}

function ResultRow({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">
        <span className="font-semibold tabular-nums">{value}</span>{" "}
        <span className="text-xs text-muted">{detail}</span>
      </dd>
    </div>
  );
}

function ItemRuleForm({
  item,
  source,
  defaults,
  override,
  salesDemand,
  salesWindowDays,
  options,
  onSave,
  onClose,
}: Omit<ItemRuleDialogProps, "item"> & { item: DashboardItem }) {
  const [draft, setDraft] = useState<RuleDraft>(() => ruleToDraft(override ?? {}));
  const { level } = item;

  const draftOverride = draftToOverride(draft);
  const rule = resolveRule(defaults, draftOverride, salesDemand);
  const errors = validateRule(rule);
  const valid = !hasRuleErrors(errors);
  const result = valid && !item.stockError ? calculateReorder(level, rule, options) : null;
  const calculatedPoint = calculateReorderPoint(rule);
  const countsIncoming = options.incomingStock === "include";
  const demandFallback =
    salesDemand !== null
      ? `${formatDemand(salesDemand)} per day from the last ${salesWindowDays ?? 30} days of sales`
      : `${formatDemand(defaults.averageDailyDemand)} per day (default rule)`;

  const field = (name: RuleField, defaultValue: string) => ({
    id: `item-${name}`,
    value: draft[name],
    onChange: (value: string) => setDraft((current) => ({ ...current, [name]: value })),
    placeholder: defaultValue,
    error: errors[name],
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (valid) onSave(level.id, draftOverride);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-col">
      <div className="space-y-4 overflow-y-auto px-5 py-4">
        <div className="rounded-lg bg-surface-muted px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-muted">Current stock</h3>
            {source === "demo" ? <DemoBadge /> : <LiveBadge />}
          </div>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
            <div>
              <dt className="text-xs text-muted">Available</dt>
              <dd className="font-semibold tabular-nums">{formatUnits(level.available)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Incoming</dt>
              <dd className="font-semibold tabular-nums">{formatUnits(level.incoming)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">SKU</dt>
              <dd className="truncate font-mono text-xs leading-5">{level.sku ?? "No SKU"}</dd>
            </div>
          </dl>
        </div>

        <p className="text-xs text-muted">Leave a field blank to use the default rule for it.</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            {...field("averageDailyDemand", formatDemand(salesDemand ?? defaults.averageDailyDemand))}
            label="Average daily demand"
            suffix="per day"
            allowDecimal
            hint={`Blank uses ${demandFallback}.`}
          />
          <NumberField
            {...field("leadTimeDays", String(defaults.leadTimeDays))}
            label="Lead time"
            suffix="days"
            hint={`Default: ${plural(defaults.leadTimeDays, "day")}`}
          />
          <NumberField
            {...field("safetyStock", String(defaults.safetyStock))}
            label="Safety stock"
            suffix="units"
            hint={`Default: ${plural(defaults.safetyStock, "unit")}`}
          />
          <NumberField
            {...field("targetStock", String(defaults.targetStock))}
            label="Target stock"
            suffix="units"
            hint={`Default: ${plural(defaults.targetStock, "unit")}`}
          />
          <div className="sm:col-span-2">
            <NumberField
              {...field("reorderPointOverride", "Calculated")}
              label="Reorder point"
              suffix="units"
              hint={
                Number.isFinite(calculatedPoint)
                  ? `Blank calculates it from demand × lead time + safety stock (${plural(calculatedPoint, "unit")}).`
                  : "Blank calculates it from demand × lead time + safety stock."
              }
            />
          </div>
        </div>

        <div aria-live="polite" className="rounded-lg border border-border px-4 py-3">
          <h3 className="text-xs font-semibold text-muted">Result with these settings</h3>
          {result ? (
            <dl className="mt-2 space-y-1.5 text-sm">
              <ResultRow
                label="Reorder point"
                value={plural(result.reorderPoint, "unit")}
                detail={
                  result.reorderPointSource === "manual"
                    ? "set manually"
                    : `${formatDemand(rule.averageDailyDemand)} × ${rule.leadTimeDays} + ${rule.safetyStock}`
                }
              />
              <ResultRow
                label="Inventory position"
                value={plural(result.inventoryPosition, "unit")}
                detail={
                  countsIncoming
                    ? `${formatUnits(level.available)} available + ${formatUnits(level.incoming)} incoming`
                    : `${formatUnits(level.available)} available, incoming not counted`
                }
              />
              <ResultRow
                label="Recommendation"
                value={
                  result.shouldReorder
                    ? `Order ${plural(result.recommendedQuantity, "unit")}`
                    : "No reorder needed"
                }
                detail={
                  result.shouldReorder
                    ? `to reach ${formatUnits(rule.targetStock)}`
                    : "position is above the reorder point"
                }
              />
            </dl>
          ) : (
            <p className="mt-2 text-sm text-muted">
              {item.stockError ?? "Fix the highlighted fields to see a recommendation."}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        {item.hasCustomRule ? (
          <Button variant="plain" onClick={() => onSave(level.id, {})} className="self-start sm:self-auto">
            Use default rule
          </Button>
        ) : (
          <span />
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!valid}>
            Save rule
          </Button>
        </div>
      </div>
    </form>
  );
}
