import { resolveReorderPoint } from "./reorder";
import type { ReorderRule, ReorderRuleOverride } from "./types";

export const DEFAULT_REORDER_RULE: ReorderRule = {
  averageDailyDemand: 1,
  leadTimeDays: 7,
  safetyStock: 10,
  targetStock: 60,
  reorderPointOverride: null,
};

export type RuleField = keyof ReorderRule;
export type RuleErrors = Partial<Record<RuleField, string>>;

const RULE_FIELDS = [
  "averageDailyDemand",
  "leadTimeDays",
  "safetyStock",
  "targetStock",
  "reorderPointOverride",
] as const satisfies readonly RuleField[];

const MAX_UNITS = 1_000_000;
const MAX_LEAD_TIME_DAYS = 365;

/** Where an item's average daily demand came from. */
export type DemandSource = "manual" | "sales" | "default";

/** A demand the merchant typed in always wins; then sales history; then the default rule. */
export function demandSourceFor(override: ReorderRuleOverride | undefined, salesDemand: number | null): DemandSource {
  if (override?.averageDailyDemand !== undefined) return "manual";
  return salesDemand !== null ? "sales" : "default";
}

/** Applies a variant-location override, and sales-based demand when there is some, on top of the default rule. */
export function resolveRule(
  defaults: ReorderRule,
  override: ReorderRuleOverride = {},
  salesDemand: number | null = null,
): ReorderRule {
  return {
    averageDailyDemand: override.averageDailyDemand ?? salesDemand ?? defaults.averageDailyDemand,
    leadTimeDays: override.leadTimeDays ?? defaults.leadTimeDays,
    safetyStock: override.safetyStock ?? defaults.safetyStock,
    targetStock: override.targetStock ?? defaults.targetStock,
    reorderPointOverride: override.reorderPointOverride ?? defaults.reorderPointOverride,
  };
}

function isNumberInRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function isWholeNumberInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Range check per field, returning an error message or null. Shared by forms and the server.
 * Only the reorder point may be null (meaning "calculate it").
 */
const FIELD_CHECKS: Record<RuleField, (value: number | null) => string | null> = {
  averageDailyDemand: (value) =>
    value !== null && isNumberInRange(value, 0, MAX_UNITS) ? null : "Enter a number from 0 to 1,000,000.",
  leadTimeDays: (value) =>
    value !== null && isWholeNumberInRange(value, 0, MAX_LEAD_TIME_DAYS) ? null : "Enter whole days from 0 to 365.",
  safetyStock: (value) =>
    value !== null && isWholeNumberInRange(value, 0, MAX_UNITS) ? null : "Enter whole units from 0 to 1,000,000.",
  targetStock: (value) =>
    value !== null && isWholeNumberInRange(value, 1, MAX_UNITS) ? null : "Enter whole units from 1 to 1,000,000.",
  reorderPointOverride: (value) =>
    value === null || isWholeNumberInRange(value, 0, MAX_UNITS)
      ? null
      : "Enter whole units from 0 to 1,000,000, or leave blank.",
};

export function validateRule(rule: ReorderRule): RuleErrors {
  const errors: RuleErrors = {};
  for (const field of RULE_FIELDS) {
    const error = FIELD_CHECKS[field](rule[field]);
    if (error) errors[field] = error;
  }

  if (!errors.targetStock && !hasRuleErrors(errors)) {
    // A target at or below the reorder point would leave stock still due for reorder after the order arrives.
    const reorderPoint = resolveReorderPoint(rule);
    if (rule.targetStock <= reorderPoint) {
      errors.targetStock = `Must be above the reorder point (${reorderPoint} units).`;
    }
  }

  return errors;
}

export function hasRuleErrors(errors: RuleErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Form state for a rule: the raw text of each field, where "" means "not set". */
export type RuleDraft = Record<RuleField, string>;

export function ruleToDraft(rule: ReorderRuleOverride): RuleDraft {
  const text = (value: number | null | undefined) =>
    value === null || value === undefined ? "" : String(value);

  return {
    averageDailyDemand: text(rule.averageDailyDemand),
    leadTimeDays: text(rule.leadTimeDays),
    safetyStock: text(rule.safetyStock),
    targetStock: text(rule.targetStock),
    reorderPointOverride: text(rule.reorderPointOverride),
  };
}

/** "" becomes undefined (not set); anything else becomes a number, which may be NaN for validation to reject. */
export function parseRuleInput(raw: string): number | undefined {
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : Number(trimmed);
}

/** Keeps only the fields that were filled in, so blank fields keep following the defaults. */
export function draftToOverride(draft: RuleDraft): ReorderRuleOverride {
  const override: ReorderRuleOverride = {};
  for (const field of RULE_FIELDS) {
    const value = parseRuleInput(draft[field]);
    if (value !== undefined) override[field] = value;
  }
  return override;
}

/** The default rule has no fallback, so every field except the reorder point is required. */
export function draftToDefaultRule(draft: RuleDraft): ReorderRule {
  return {
    averageDailyDemand: parseRuleInput(draft.averageDailyDemand) ?? NaN,
    leadTimeDays: parseRuleInput(draft.leadTimeDays) ?? NaN,
    safetyStock: parseRuleInput(draft.safetyStock) ?? NaN,
    targetStock: parseRuleInput(draft.targetStock) ?? NaN,
    reorderPointOverride: null,
  };
}

/**
 * Checks an override that arrived from outside (an API request): only known fields, each a number
 * within its range. Whether the combined rule is sensible depends on the defaults at the time, so
 * the dashboard reports that per item instead of rejecting the save.
 */
export function parseOverride(input: unknown): ReorderRuleOverride | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const override: ReorderRuleOverride = {};
  for (const [key, value] of Object.entries(input)) {
    if (!(RULE_FIELDS as readonly string[]).includes(key)) return null;
    const field = key as RuleField;
    if (value !== null && typeof value !== "number") return null;
    if (FIELD_CHECKS[field](value)) return null;
    // FIELD_CHECKS only accepts null for the reorder point, so this assignment is safe.
    (override as Record<RuleField, number | null>)[field] = value;
  }
  return override;
}

/** Checks a default rule that arrived from outside; it must be complete and pass validateRule. */
export function parseDefaultRule(input: unknown): ReorderRule | null {
  const override = parseOverride(input);
  if (!override) return null;
  const rule: ReorderRule = {
    averageDailyDemand: override.averageDailyDemand ?? NaN,
    leadTimeDays: override.leadTimeDays ?? NaN,
    safetyStock: override.safetyStock ?? NaN,
    targetStock: override.targetStock ?? NaN,
    reorderPointOverride: null,
  };
  return hasRuleErrors(validateRule(rule)) ? null : rule;
}
