import { describe, expect, it } from "vitest";
import { findExtraScopes, findMissingScopes } from "./scopes";

describe("findExtraScopes", () => {
  it("lists granted scopes the app doesn't need", () => {
    expect(
      findExtraScopes(["read_products", "write_inventory", "read_locations", "read_orders", "customer_write_orders"]),
    ).toEqual(["write_inventory", "customer_write_orders"]);
  });

  it("is empty when exactly the required scopes are granted", () => {
    expect(findExtraScopes(["read_products", "read_inventory", "read_locations", "read_orders"])).toEqual([]);
  });
});

describe("findMissingScopes", () => {
  it("finds required scopes that weren't granted", () => {
    expect(findMissingScopes("read_products,read_inventory,read_locations")).toEqual(["read_orders"]);
  });

  it("counts a write scope as covering its read scope", () => {
    expect(findMissingScopes(["write_products", "read_inventory", "read_locations", "read_orders"])).toEqual([]);
  });
});
