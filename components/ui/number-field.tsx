import type { ReactNode } from "react";
import { inputClass } from "./styles";

interface NumberFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  suffix?: string;
  placeholder?: string;
  hint?: ReactNode;
  error?: string;
  allowDecimal?: boolean;
}

/**
 * A text input rather than type="number", so invalid text reaches validation
 * and gets a clear message instead of the browser silently clearing it.
 */
export function NumberField({
  id,
  label,
  value,
  onChange,
  onBlur,
  suffix,
  placeholder,
  hint,
  error,
  allowDecimal = false,
}: NumberFieldProps) {
  const messageId = `${id}-message`;
  const message = error ?? hint;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="relative mt-1.5">
        <input
          id={id}
          type="text"
          inputMode={allowDecimal ? "decimal" : "numeric"}
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          className={`${inputClass} tabular-nums ${suffix ? "pr-20" : ""} ${error ? "border-critical-fg bg-critical-bg/25" : ""}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">
            {suffix}
          </span>
        )}
      </div>
      {message && (
        <p id={messageId} className={`mt-1.5 text-xs ${error ? "text-critical-fg" : "text-muted"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
