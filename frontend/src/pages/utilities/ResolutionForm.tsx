import { useState } from "react";
import { api } from "../../api";
import { SearchSelect, personOption } from "../../components/SearchSelect";
import type { Person } from "../../types";
import type { Distribution } from "../../utilities";
import { money } from "../../utilities";
import { Field, ErrorMessage, errorText } from "../../components/Form";
import { showDate } from "../../tenancy";

type Row = {
  allocation_id: number;
  person_id: number;
  contract_id: number | null;
  kind: "owner" | "occupant";
  amount: string;
};
export function ResolutionForm({
  distribution: d,
  people,
  onCancel,
  onSaved,
}: {
  distribution: Distribution;
  people: Person[];
  onCancel: () => void;
  onSaved: (d: Distribution) => Promise<void>;
}) {
  const [rows, setRows] = useState<Row[]>(
      d.allocations.flatMap((a) =>
        a.responsibilities.map((r) => ({
          allocation_id: a.id,
          person_id: r.person_id || 0,
          contract_id: r.contract_id,
          kind: r.kind,
          amount: r.amount,
        })),
      ),
    ),
    [amounts, setAmounts] = useState<Record<number, string>>(
      Object.fromEntries(d.allocations.map((a) => [a.id, a.amount])),
    ),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  function update(index: number, change: Partial<Row>) {
    setRows(rows.map((r, i) => (i === index ? { ...r, ...change } : r)));
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (
      !window.confirm(
        "¿Guardar este reparto manual y su motivo? Se verificará el total de cada espacio.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const result = await api<Distribution>(
        `/utility-distributions/${d.id}/resolve`,
        "POST",
        {
          expected_version: d.version,
          expected_receipt_version: d.receipt_version,
          reason,
          allocation_amounts: d.allocations.map((a) => ({
            allocation_id: a.id,
            amount: amounts[a.id],
          })),
          responsibilities: rows,
        },
      );
      await onSaved(result);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel" onSubmit={save}>
      <h3>Revisar importes manualmente</h3>
      <p>
        Total del recibo:{" "}
        <strong>{money(d.receipt.amount, d.receipt.currency)}</strong>. Los
        importes de cada espacio y sus personas deben coincidir exactamente. Las
        estancias diarias o con servicios incluidos no admiten gastos
        adicionales.
      </p>
      <ErrorMessage message={error} />
      {d.allocations.map((a) => {
        const sources =
          d.evidence.spaces
            .find((s) => s.unit_id === a.unit_id)
            ?.contracts.filter((c) => c.eligible) || [];
        return (
          <fieldset key={a.id}>
            <legend>{a.unit_label}</legend>
            <Field label={`Importe asignado a ${a.unit_label}`}>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={amounts[a.id]}
                onChange={(e) =>
                  setAmounts({ ...amounts, [a.id]: e.target.value })
                }
              />
            </Field>
            {rows.map((r, index) =>
              r.allocation_id !== a.id ? null : (
                <fieldset key={index}>
                  <legend>Responsabilidad {index + 1}</legend>
                  <div className="form-grid">
                    <Field label={`Parte del gasto ${index + 1}`}>
                      <select
                        value={r.kind}
                        onChange={(e) =>
                          update(index, {
                            kind: e.target.value as Row["kind"],
                            contract_id:
                              e.target.value === "owner"
                                ? null
                                : sources[0]?.id || null,
                            person_id:
                              e.target.value === "owner"
                                ? d.configuration.owner_person_id || 0
                                : sources[0]?.responsible_person_id || 0,
                          })
                        }
                      >
                        <option value="owner">
                          Propietario o responsable acordado
                        </option>
                        <option value="occupant" disabled={!sources.length}>
                          Ocupante de contrato
                        </option>
                      </select>
                    </Field>
                    {r.kind === "occupant" && (
                      <SearchSelect
                        label={`Contrato de origen ${index + 1}`}
                        required
                        value={r.contract_id || ""}
                        options={sources.map((contract) => ({
                          value: contract.id,
                          label: `${people.find((person) => person.id === contract.responsible_person_id)?.full_name || "Persona responsable"} · ${showDate(contract.start_date)} al ${showDate(contract.end_date)} · ${contract.occupied_days} días`,
                        }))}
                        onChange={(id) => {
                          const contract = sources.find(
                            (item) => item.id === Number(id),
                          );
                          update(index, {
                            contract_id: contract?.id || null,
                            person_id: contract?.responsible_person_id || 0,
                          });
                        }}
                      />
                    )}
                    <SearchSelect
                      label={`Persona responsable ${index + 1}`}
                      required
                      value={r.person_id || ""}
                      onChange={(id) =>
                        update(index, { person_id: Number(id) })
                      }
                      options={people
                        .filter(
                          (person) =>
                            r.kind === "owner" ||
                            sources
                              .find((contract) => contract.id === r.contract_id)
                              ?.people.includes(person.id),
                        )
                        .map(personOption)}
                    />
                    <Field label={`Importe de responsabilidad ${index + 1}`}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={r.amount}
                        onChange={(e) =>
                          update(index, { amount: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setRows(rows.filter((_, i) => i !== index))}
                  >
                    Quitar responsabilidad {index + 1}
                  </button>
                </fieldset>
              ),
            )}
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setRows([
                  ...rows,
                  {
                    allocation_id: a.id,
                    kind: "owner",
                    person_id: d.configuration.owner_person_id || 0,
                    contract_id: null,
                    amount: "0.00",
                  },
                ])
              }
            >
              Añadir responsable a {a.unit_label}
            </button>
          </fieldset>
        );
      })}
      <Field label="Motivo del reparto revisado">
        <textarea
          required
          minLength={3}
          maxLength={2000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <div className="actions">
        <button disabled={busy}>
          {busy ? "Guardando…" : "Guardar revisión manual"}
        </button>
        <button
          className="secondary"
          type="button"
          disabled={busy}
          onClick={onCancel}
        >
          Volver al resumen
        </button>
      </div>
    </form>
  );
}
