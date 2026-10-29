import { DEMO_SCENARIOS, type DemoScenario } from "@/lib/inventory/demo-data";
import { InfoIcon } from "@/components/ui/icons";

interface DemoBannerProps {
  scenario: DemoScenario;
  onScenarioChange: (scenario: DemoScenario) => void;
}

/** Shown only outside the Shopify admin, where there is no store to read from. */
export function DemoBanner({ scenario, onScenarioChange }: DemoBannerProps) {
  return (
    <section
      aria-labelledby="demo-banner-title"
      className="flex flex-col gap-3 rounded-xl border border-caution-border bg-caution-bg p-4 text-caution-fg md:flex-row md:items-center md:justify-between"
    >
      <div className="flex gap-3">
        <InfoIcon width={20} height={20} className="mt-px shrink-0" />
        <div>
          <h2 id="demo-banner-title" className="text-sm font-semibold">
            Demo data, not from Shopify
          </h2>
          <p className="mt-0.5 text-sm">
            Every product, stock level and demand figure on this page is sample data for trying out the
            dashboard. None of it comes from Shopify. To see your store&apos;s inventory, open InventoryPilot from
            your Shopify admin.
          </p>
        </div>
      </div>
      <label className="flex shrink-0 items-center gap-2 pl-8 text-sm font-medium md:pl-0">
        Preview state
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
    </section>
  );
}
