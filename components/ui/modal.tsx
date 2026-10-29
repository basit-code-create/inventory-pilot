"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { CloseIcon } from "./icons";
import { focusRingClass } from "./styles";

interface ModalProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  /** Rendered only while open, so forms inside start fresh each time. */
  children: ReactNode;
}

/** Native <dialog>, so focus trapping, Escape and the backdrop come from the browser. */
export function Modal({ open, title, description, onClose, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // A click on the <dialog> element itself (not its content) is a click on the backdrop.
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-2xl bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/45"
    >
      {open && (
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              {description && <div className="mt-0.5 text-sm text-muted">{description}</div>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={`-m-1 rounded-md p-1 text-muted hover:bg-surface-hover hover:text-foreground ${focusRingClass}`}
            >
              <CloseIcon width={20} height={20} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
