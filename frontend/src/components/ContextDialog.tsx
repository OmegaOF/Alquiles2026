import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { confirmFormDiscard } from "./Form";

export function ContextDialog({
  label,
  children,
  onCancel,
}: {
  label: string;
  children: ReactNode;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      if (typeof dialog.close === "function") dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="context-dialog"
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (confirmFormDiscard(ref.current?.querySelector("form") ?? null)) onCancel();
      }}
    >
      <h2 id={id} className="sr-only">{label}</h2>
      {children}
    </dialog>
  );
}
