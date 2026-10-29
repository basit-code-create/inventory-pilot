import type { ReactNode } from "react";
import { AlertIcon, InfoIcon } from "./icons";

export type BannerTone = "critical" | "warning" | "info" | "caution";

const TONE_CLASSES: Record<BannerTone, string> = {
  critical: "border-critical-bg bg-critical-bg/60 text-critical-fg",
  warning: "border-warning-bg bg-warning-bg/40 text-warning-fg",
  info: "border-info-bg bg-info-bg/40 text-info-fg",
  caution: "border-caution-border bg-caution-bg text-caution-fg",
};

interface BannerProps {
  tone: BannerTone;
  title: string;
  children?: ReactNode;
  /** Buttons or controls shown beside the message on wide screens, below it on narrow ones. */
  actions?: ReactNode;
}

/** One banner style for the whole app, like the Shopify admin's: icon, title, message, actions. */
export function Banner({ tone, title, children, actions }: BannerProps) {
  const Icon = tone === "critical" || tone === "warning" ? AlertIcon : InfoIcon;
  return (
    <section
      role={tone === "critical" ? "alert" : undefined}
      className={`flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between ${TONE_CLASSES[tone]}`}
    >
      <div className="flex min-w-0 gap-3">
        <Icon width={20} height={20} className="mt-px shrink-0" />
        <div className="min-w-0 text-sm">
          <h2 className="font-semibold">{title}</h2>
          {children && <div className="mt-0.5">{children}</div>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 pl-8 md:pl-0">{actions}</div>}
    </section>
  );
}
