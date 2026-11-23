import type { FormEvent, ReactNode } from "react";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <p className="error-message" role="alert">
      {message}
    </p>
  ) : null;
}
export function markFormChanged(event: FormEvent<HTMLFormElement>) {
  if ((event.target as HTMLElement).getAttribute("role") !== "combobox")
    event.currentTarget.dataset.dirty = "true";
}

export function confirmFormDiscard(form: HTMLFormElement | null) {
  return !form?.dataset.dirty || window.confirm("¿Salir y descartar los cambios sin guardar?");
}

export function FormActions({
  saving,
  onCancel,
}: {
  saving: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="actions">
      <button type="submit" disabled={saving}>
        {saving ? "Guardando…" : "Guardar cambios"}
      </button>
      <button
        className="secondary"
        type="button"
        onClick={(event) => { if (confirmFormDiscard(event.currentTarget.form)) onCancel(); }}
        disabled={saving}
      >
        Cancelar
      </button>
    </div>
  );
}
export function value(data: FormData, name: string): string {
  return String(data.get(name) || "").trim();
}
export function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "No se pudo guardar. Vuelve a intentar.";
}
