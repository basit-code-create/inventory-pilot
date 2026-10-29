"use client";

import { useState, type FormEvent } from "react";
import { calculateReorderPoint, type ReorderOptions } from "@/lib/inventory/reorder";
import {
  draftToDefaultRule,
  hasRuleErrors,
  ruleToDraft,
  validateRule,
  type RuleDraft,
  type RuleField,
} from "@/lib/inventory/rules";
import { formatDemand, plural } from "@/lib/inventory/format";
import type { ReorderRule } from "@/lib/inventory/types";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { NumberField } from "@/components/ui/number-field";

interface DefaultRuleDialogProps {
  open: boolean;
  rule: ReorderRule;
  options: ReorderOptions;
  usesSalesDemand: boolean;
  /** True when rules are saved to the database (live data); demo rules live only in the browser tab. */
  persisted: boolean;
  customRules: number;
  onSave: (rule: ReorderRule, options: ReorderOptions) => void;
  onResetRules: () => void;
  resetLabel: string;
  onClose: () => void;
}

export function DefaultRuleDialog({ open, onClose, ...formProps }: DefaultRuleDialogProps) {
  return (
    <Modal
      open={open}
      title="Default reorder rule"
      description="Used wherever an item doesn't set its own value."
      onClose={onClose}
    >
      <DefaultRuleForm onClose={onClose} {...formProps} />
    </Modal>
  );
}

function DefaultRuleForm({
  rule,
  options,
  usesSalesDemand,
  persisted,
  customRules,
  onSave,
  onResetRules,
  resetLabel,
  onClose,
}: Omit<DefaultRuleDialogProps, "open">) {
  const [draft, setDraft] = useState<RuleDraft>(() => ruleToDraft(rule));
  const [countIncoming, setCountIncoming] = useState(options.incomingStock === "include");

  const candidate = draftToDefaultRule(draft);
  const errors = validateRule(candidate);
  const valid = !hasRuleErrors(errors);
  const canPreview = !errors.averageDailyDemand && !errors.leadTimeDays && !errors.safetyStock;

  const field = (name: RuleField) => ({
    id: `default-${name}`,
    value: draft[name],
    onChange: (value: string) => setDraft((current) => ({ ...current, [name]: value })),
    error: errors[name],
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (valid) onSave(candidate, { incomingStock: countIncoming ? "include" : "exclude" });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-col">
      <div className="space-y-4 overflow-y-auto px-5 py-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            {...field("averageDailyDemand")}
            label="Average daily demand"
            suffix="per day"
            allowDecimal
            hint={
              usesSalesDemand
                ? "Used only for items without sales data; the rest use their recent sales."
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
              Default reorder point:{" "}
              <span className="font-semibold">{plural(calculateReorderPoint(candidate), "unit")}</span>{" "}
              <span className="text-muted">
                ({formatDemand(candidate.averageDailyDemand)} × {candidate.leadTimeDays} days +{" "}
                {candidate.safetyStock}, rounded up)
              </span>
            </>
          ) : (
            <span className="text-muted">Enter valid values to see the reorder point.</span>
          )}
        </p>

        <label className="flex items-start gap-3 rounded-lg border border-border px-4 py-3 text-sm">
          <input
            type="checkbox"
            checked={countIncoming}
            onChange={(event) => setCountIncoming(event.target.checked)}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            <span className="font-medium">Count incoming stock</span>
            <span className="mt-0.5 block text-xs text-muted">
              Treat stock on its way (transfers and purchase orders) as already in stock. Turn this off if incoming
              deliveries are often late or uncertain.
            </span>
          </span>
        </label>

        <p className="text-xs text-muted">
          {customRules > 0 && `${plural(customRules, "item")} with a custom rule keep the values they set. `}
          {persisted
            ? "Rules are saved for your store and used for every sync and stock-change update."
            : "Demo rules are kept in this browser tab only and reset when the page reloads."}
        </p>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="plain" onClick={onResetRules} className="self-start sm:self-auto">
          {resetLabel}
        </Button>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!valid}>
            Save defaults
          </Button>
        </div>
      </div>
    </form>
  );
}
