"use client";

import { useState, type ReactNode } from "react";
import { calculateReorderPoint } from "@/lib/inventory/reorder";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cardClass } from "@/components/ui/styles";
import { ConnectionDetails } from "@/components/shopify/connection-status";
import { RuleSettingsForm } from "../rule-settings-form";
import type { InventoryData } from "../use-inventory-data";

function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className={`${cardClass} grid gap-4 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-8`}>
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>}
      </div>
      <div>{children}</div>
    </section>
  );
}

/** Store-wide rules, how they work, the connection report, and resetting. */
export function SettingsTab({ data }: { data: InventoryData }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const live = data.mode === "live";
  const { defaults, reorderOptions } = data;

  return (
    <div className="flex flex-col gap-4">
      <RuleSettingsForm
        // Remount after a save or a sync so the form shows the stored values.
        key={JSON.stringify([defaults, reorderOptions])}
        rule={defaults}
        options={reorderOptions}
        usesSalesDemand={data.salesDemand !== null}
        persisted={live}
        customRules={data.summary.customRules}
        onSave={data.saveDefaults}
      />

      <Card title="How recommendations work" description="The same formula for every item and location.">
        <ol className="list-decimal space-y-1.5 pl-4 text-sm">
          <li>
            <span className="font-medium">Reorder point</span> = average daily demand × lead time + safety stock. With
            the defaults: {calculateReorderPoint(defaults)} units.
          </li>
          <li>
            <span className="font-medium">Stock position</span> = available
            {reorderOptions.incomingStock === "include" ? " + incoming" : " (incoming not counted)"}.
          </li>
          <li>
            When the stock position is at or below the reorder point, the recommended order brings it back up to the
            <span className="font-medium"> target stock</span>.
          </li>
        </ol>
        <p className="mt-3 text-xs text-muted">
          Items can override any of these from the Inventory tab. InventoryPilot only recommends: it never changes
          stock or creates orders in Shopify.
        </p>
      </Card>

      <Card title="Shopify connection" description="What InventoryPilot can read from your store.">
        <ConnectionDetails connection={data.connection} />
      </Card>

      <Card title="Reset rules" description="Go back to the built-in defaults and remove every item's own rule.">
        <Button onClick={() => setConfirmReset(true)} className="text-critical-fg">
          {live ? "Reset all rules" : "Reset demo rules"}
        </Button>
      </Card>

      <Modal
        open={confirmReset}
        title="Reset all rules?"
        description="The default rule goes back to the built-in values and every item's own rule is removed. This can't be undone."
        onClose={() => setConfirmReset(false)}
      >
        <div className="flex justify-end gap-2 px-5 py-4">
          <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
          <Button
            variant="primary"
            className="bg-critical-fg hover:bg-critical-fg/90"
            onClick={() => {
              data.resetRules();
              setConfirmReset(false);
            }}
          >
            Reset rules
          </Button>
        </div>
      </Modal>
    </div>
  );
}
