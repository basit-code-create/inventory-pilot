import type { ButtonHTMLAttributes } from "react";
import { focusRingClass } from "./styles";

type ButtonVariant = "primary" | "secondary" | "plain";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover",
  secondary: "border border-border-strong bg-surface text-foreground shadow-sm hover:bg-surface-hover",
  plain: "px-1.5 text-link hover:underline",
};

// App Bridge's types add a `variant` attribute to <button> for its title bar; this component's own prop replaces it.
interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "variant"> {
  variant?: ButtonVariant;
}

export function Button({ variant = "secondary", type = "button", className = "", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${focusRingClass} ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
