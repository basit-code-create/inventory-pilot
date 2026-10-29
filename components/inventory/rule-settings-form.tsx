"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { formatDemand, plural } from "@/lib/inventory/format";
import {
  calculateReorderPoint,
  DEMAND_WINDOWS,
  type DemandWindowDays,
  type ReorderOptions,
} from "@/lib/inventory/reorder";
import {
  draftToDefaultRule,
  hasRuleErrors,
  ruleToDraft,
  validateRule,
  type RuleDraft,
  type RuleField,
} from "@/lib/inventory/rules";
import type { ReorderRule } from "@/lib/inventory/types";
import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/number-field";
import { cardClass, inputClass } from "@/components/ui/styles";

interface RuleSettingsFormProps {
  rule: ReorderRule;
  options: ReorderOptions;
  usesSalesDemand: boolean;
  /** Live data: rules are saved for the store, and demand can come from sales. */
  persisted: boolean;
  customRules: number;
  onSave: (rule: ReorderRule, options: ReorderOptions) => void;
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className={`${cardClass} grid gap-4 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-8`}>
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** The store-wide reorder settings, edited in place like a Shopify admin settings page. */
export function RuleSettingsForm({ rule, options, usesSalesDemand, persisted, customRules, onSave }: RuleSettingsFormProps) {
  const [draft, setDraft] = useState<RuleDraft>(() => ruleToDraft(rule));
  const [countIncoming, setCountIncoming] = useState(options.incomingStock === "include");
  const [demandWindowDays, setDemandWindowDays] = useState<DemandWindowDays>(options.demandWindowDays);

  const candidate = draftToDefaultRule(draft);
  const errors = validateRule(candidate);
  const valid = !hasRuleErrors(errors);
  const canPreview = !errors.averageDailyDemand && !errors.leadTimeDays && !errors.safetyStock;
  const nextOptions: ReorderOptions = { incomingStock: countIncoming ? "include" : "exclude", demandWindowDays };
  const dirty =
    JSON.stringify(ruleToDraft(rule)) !== JSON.stringify(draft) ||
    nextOptions.incomingStock !== options.incomingStock ||
    nextOptions.demandWindowDays !== options.demandWindowDays;

  const field = (name: RuleField) => ({
    id: `settings-${name}`,
    value: draft[name],
    onChange: (value: string) => setDraft((current) => ({ ...current, [name]: value })),
    error: errors[name],
  });

  function discard() {
    setDraft(ruleToDraft(rule));
    setCountIncoming(options.incomingStock === "include");
    setDemandWindowDays(options.demandWindowDays);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (valid && dirty) onSave(candidate, nextOptions);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <Section
        title="Default reorder rule"
        description={`Used for every item that doesn't set its own value.${
          customRules > 0 ? ` ${plural(customRules, "item")} with a custom rule keep the values they set.` : ""
        }`}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            {...field("averageDailyDemand")}
            label={usesSalesDemand ? "Demand without sales data" : "Average daily demand"}
            suffix="per day"
            allowDecimal
            hint={
              usesSalesDemand
                ? "Only for items with no sales history; the rest use their recent sales."
                : "Expected units sold per day."
            }
          />
          <NumberField
            {...field("leadTimeDays")}
            label="Lead time"
            suffix="days"
            hint="Days from placing an order to stock arriving."
          />
          <NumberField
            {...field("safetyStock")}
            label="Safety stock"
            suffix="units"
            hint="Buffer for demand spikes and late deliveries."
          />
          <NumberField
            {...field("targetStock")}
            label="Target stock"
            suffix="units"
            hint="A reorder brings stock back up to this level."
          />
        </div>
        <p aria-live="polite" className="rounded-lg bg-surface-muted px-4 py-3 text-sm">
          {canPreview ? (
            <>
              Reorder point: <span className="font-semibold">{plural(calculateReorderPoint(candidate), "unit")}</span>{" "}
              <span className="text-muted">
                ({formatDemand(candidate.averageDailyDemand)} × {candidate.leadTimeDays} days + {candidate.safetyStock},
                rounded up)
              </span>
            </>
          ) : (
            <span className="text-muted">Enter valid values to see the reorder point.</span>
          )}
        </p>
      </Section>

      <Section
        title="Demand and incoming stock"
        description="How demand is measured and whether stock on its way counts toward the reorder point."
      >
        {persisted && (
          <div>
            <label htmlFor="settings-demand-window" className="block text-sm font-medium">
              Sales period for demand
            </label>
            <select
              id="settings-demand-window"
              value={demandWindowDays}
              onChange={(event) => {
                const days = DEMAND_WINDOWS.find((option) => String(option) === event.target.value);
                if (days) setDemandWindowDays(days);
              }}
              className={`${inputClass} mt-1.5 sm:max-w-xs`}
            >
              {DEMAND_WINDOWS.map((days) => (
                <option key={days} value={days}>
                  Last {days} days
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-muted">
              Shorter reacts faster to changes; longer is steadier. Shopify allows up to 60 days.
            </p>
          </div>
        )}
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={countIncoming}
            onChange={(event) => setCountIncoming(event.target.checked)}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            <span className="font-medium">Count incoming stock</span>
            <span className="mt-0.5 block text-xs text-muted">
              Treat stock on its way (transfers and purchase orders) as already in stock. Turn this off if deliveries
              are often late.
            </span>
          </span>
        </label>
      </Section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <p className="text-xs text-muted sm:mr-auto">
          {persisted
            ? "Saved for your store and used for every sync and stock-change update."
            : "Demo settings last until the page reloads."}
        </p>
        <Button onClick={discard} disabled={!dirty}>
          Discard
        </Button>
        <Button type="submit" variant="primary" disabled={!dirty || !valid}>
          Save
        </Button>
      </div>
    </form>
  );
}
