import { DEMO_SCENARIOS, type DemoScenario } from "@/lib/inventory/demo-data";
import { Banner } from "@/components/ui/banner";

interface DemoBannerProps {
  scenario: DemoScenario;
  onScenarioChange: (scenario: DemoScenario) => void;
}

/** Shown only outside the Shopify admin, where there is no store to read from. */
export function DemoBanner({ scenario, onScenarioChange }: DemoBannerProps) {
  return (
    <Banner
      tone="caution"
      title="Demo data, not from Shopify"
      actions={
        <label className="flex items-center gap-2 text-sm font-medium">
          Preview
          <select
            value={scenario}
            onChange={(event) => {
              const next = DEMO_SCENARIOS.find((option) => option.value === event.target.value);
              if (next) onScenarioChange(next.value);
            }}
            className="rounded-lg border border-caution-border bg-surface px-2.5 py-1.5 text-sm text-foreground focus:border-focus focus:outline-hidden focus:ring-2 focus:ring-focus/25"
          >
            {DEMO_SCENARIOS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      }
    >
      Every product, stock level and demand figure here is sample data. To see your store&apos;s inventory, open
      InventoryPilot from your Shopify admin.
    </Banner>
  );
}
