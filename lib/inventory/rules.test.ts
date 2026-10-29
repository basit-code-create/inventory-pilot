import { describe, expect, it } from "vitest";
import {
  DEFAULT_REORDER_RULE,
  draftToDefaultRule,
  draftToOverride,
  parseDefaultRule,
  parseOverride,
  parseRuleInput,
  resolveRule,
  ruleToDraft,
  validateRule,
} from "./rules";

describe("resolveRule", () => {
  it("fills unset fields from the defaults", () => {
    expect(resolveRule(DEFAULT_REORDER_RULE, { leadTimeDays: 14 })).toEqual({
      ...DEFAULT_REORDER_RULE,
      leadTimeDays: 14,
    });
  });

  it("returns the defaults when there is no override", () => {
    expect(resolveRule(DEFAULT_REORDER_RULE)).toEqual(DEFAULT_REORDER_RULE);
  });
});

describe("validateRule", () => {
  it("accepts the default rule", () => {
    expect(validateRule(DEFAULT_REORDER_RULE)).toEqual({});
  });

  it.each([
    ["averageDailyDemand", { averageDailyDemand: -1 }],
    ["averageDailyDemand", { averageDailyDemand: NaN }],
    ["leadTimeDays", { leadTimeDays: 2.5 }],
    ["leadTimeDays", { leadTimeDays: 400 }],
    ["safetyStock", { safetyStock: -5 }],
    ["safetyStock", { safetyStock: 1.5 }],
    ["targetStock", { targetStock: 0 }],
    ["reorderPointOverride", { reorderPointOverride: -1 }],
  ])("rejects an invalid %s", (field, change) => {
    expect(validateRule({ ...DEFAULT_REORDER_RULE, ...change })).toHaveProperty(field);
  });

  it("rejects a target stock at or below the reorder point", () => {
    // Reorder point = 1 * 7 + 10 = 17.
    expect(validateRule({ ...DEFAULT_REORDER_RULE, targetStock: 17 }).targetStock).toBe(
      "Must be above the reorder point (17 units).",
    );
  });

  it("checks the target against a manual reorder point", () => {
    expect(
      validateRule({ ...DEFAULT_REORDER_RULE, reorderPointOverride: 80, targetStock: 60 }),
    ).toHaveProperty("targetStock");
  });
});

describe("rule drafts", () => {
  it("treats blank input as not set and other input as a number", () => {
    expect(parseRuleInput("  ")).toBeUndefined();
    expect(parseRuleInput("2.5")).toBe(2.5);
    expect(parseRuleInput("abc")).toBeNaN();
  });

  it("keeps only the filled-in fields in an override", () => {
    const draft = { ...ruleToDraft({}), leadTimeDays: "14", targetStock: "90" };
    expect(draftToOverride(draft)).toEqual({ leadTimeDays: 14, targetStock: 90 });
  });

  it("round-trips a rule through a draft", () => {
    expect(draftToDefaultRule(ruleToDraft(DEFAULT_REORDER_RULE))).toEqual(DEFAULT_REORDER_RULE);
  });

  it("makes blank default-rule fields invalid instead of silently keeping old values", () => {
    const draft = { ...ruleToDraft(DEFAULT_REORDER_RULE), safetyStock: "" };
    expect(validateRule(draftToDefaultRule(draft))).toHaveProperty("safetyStock");
  });
});

describe("parseOverride and parseDefaultRule", () => {
  it("accepts known fields within range", () => {
    expect(parseOverride({ leadTimeDays: 14, reorderPointOverride: null })).toEqual({
      leadTimeDays: 14,
      reorderPointOverride: null,
    });
    expect(parseOverride({})).toEqual({});
  });

  it("rejects unknown fields, wrong types and out-of-range values", () => {
    expect(parseOverride({ leadTimeDays: 14, admin: true })).toBeNull();
    expect(parseOverride({ safetyStock: "10" })).toBeNull();
    expect(parseOverride({ targetStock: null })).toBeNull();
    expect(parseOverride({ leadTimeDays: 999 })).toBeNull();
    expect(parseOverride(["leadTimeDays"])).toBeNull();
    expect(parseOverride(null)).toBeNull();
  });

  it("requires a complete, valid default rule", () => {
    expect(parseDefaultRule(DEFAULT_REORDER_RULE)).toEqual(DEFAULT_REORDER_RULE);
    expect(parseDefaultRule({ ...DEFAULT_REORDER_RULE, safetyStock: undefined })).toBeNull();
    expect(parseDefaultRule({ ...DEFAULT_REORDER_RULE, targetStock: 5 })).toBeNull();
  });
});
