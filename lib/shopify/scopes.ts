/** Must match the scopes in the app version released in the Dev Dashboard. */
export const REQUIRED_SCOPES = ["read_products", "read_inventory", "read_locations", "read_orders"] as const;

/** Granted scopes beyond the required ones. The app only recommends, so any write scope is more access than it needs. */
export function findExtraScopes(granted: readonly string[], required: readonly string[] = REQUIRED_SCOPES): string[] {
  const needed = new Set(required);
  return granted.filter((scope) => !needed.has(scope));
}

/** A write scope also grants its read scope, so write_products covers read_products. */
export function findMissingScopes(
  granted: string | readonly string[],
  required: readonly string[] = REQUIRED_SCOPES,
): string[] {
  const list = typeof granted === "string" ? granted.split(",") : granted;
  const grantedSet = new Set(list.map((scope) => scope.trim()).filter(Boolean));

  return required.filter((scope) => {
    if (grantedSet.has(scope)) return false;
    return !(scope.startsWith("read_") && grantedSet.has(`write_${scope.slice("read_".length)}`));
  });
}
