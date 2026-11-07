import type { Person } from "../../types";
import { Field } from "../../components/Form";
import { methods } from "../../utilities";
import type { ConfigFields, UtilityMethod } from "../../utilities";

export function ConfigurationFields({
  value,
  onChange,
  units,
  people,
}: {
  value: ConfigFields;
  onChange: (value: ConfigFields) => void;
  units: { id: number; code: string; name: string }[];
  people: Person[];
}) {
  function update(change: Partial<ConfigFields>) {
    onChange({ ...value, ...change });
  }
  return (
    <fieldset>
      <legend>Cómo se reparte este servicio</legend>
      <Field label="Método de reparto">
        <select
          value={value.method}
          onChange={(e) =>
            update({
              method: e.target.value as UtilityMethod,
              percentages:
                e.target.value === "percentage"
                  ? value.unit_ids.map((id) => ({
                      unit_id: id,
                      percentage:
                        value.percentages.find((p) => p.unit_id === id)
                          ?.percentage || "0",
                    }))
                  : [],
            })
          }
        >
          {Object.entries(methods).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <p>
        Selecciona los cuartos que participan. Sin cuartos seleccionados se
        considera un solo espacio: la casa completa.
      </p>
      <fieldset>
        <legend>Cuartos incluidos en el servicio</legend>
        {units.map((u) => (
          <label key={u.id} className="check">
            <input
              type="checkbox"
              checked={value.unit_ids.includes(u.id)}
              onChange={(e) => {
                const ids = e.target.checked
                  ? [...value.unit_ids, u.id].sort((a, b) => a - b)
                  : value.unit_ids.filter((id) => id !== u.id);
                update({
                  unit_ids: ids,
                  percentages:
                    value.method === "percentage"
                      ? ids.map((id) => ({
                          unit_id: id,
                          percentage:
                            value.percentages.find((p) => p.unit_id === id)
                              ?.percentage || "0",
                        }))
                      : [],
                });
              }}
            />
            {u.code} · {u.name}
          </label>
        ))}
      </fieldset>
      {value.method === "percentage" && value.unit_ids.length > 0 && (
        <div className="form-grid">
          {value.unit_ids.map((id) => (
            <Field
              key={id}
              label={`Porcentaje de ${units.find((u) => u.id === id)?.name || id}`}
            >
              <input
                type="number"
                min={0}
                max={100}
                step="0.000001"
                required
                value={
                  value.percentages.find((p) => p.unit_id === id)?.percentage ||
                  ""
                }
                onChange={(e) =>
                  update({
                    percentages: value.unit_ids.map((unit_id) => ({
                      unit_id,
                      percentage:
                        unit_id === id
                          ? e.target.value
                          : value.percentages.find((p) => p.unit_id === unit_id)
                              ?.percentage || "0",
                    })),
                  })
                }
              />
            </Field>
          ))}
          <p>Los porcentajes deben sumar exactamente 100%.</p>
        </div>
      )}
      {value.method === "occupants" && (
        <p>
          Se usa la suma de personas por día de estancia en el periodo. Si
          cambiaron personas o condiciones sin fechas históricas suficientes, se
          pedirá revisión.
        </p>
      )}
      {value.method === "readings" && (
        <p>
          Registra lecturas de apertura y cierre de cada cuarto para las fechas
          exactas del recibo. La parte fija se reparte por igual y la variable
          según consumo.
        </p>
      )}
      <div className="form-grid">
        <Field label="A quién corresponde económicamente el servicio">
          <select
            value={value.economic_policy}
            onChange={(e) =>
              update({
                economic_policy: e.target.value as typeof value.economic_policy,
              })
            }
          >
            <option value="occupant">
              Al ocupante según contrato y días de estancia
            </option>
            <option value="owner">Al propietario o responsable acordado</option>
          </select>
        </Field>
        {(
          [
            "owner_person_id",
            "provider_payer_id",
            "reimbursement_person_id",
          ] as const
        ).map((key, i) => (
          <Field
            key={key}
            label={
              [
                "Persona que asume la parte del propietario",
                "Persona prevista para pagar al proveedor (opcional)",
                "Persona prevista para recibir reintegros (opcional)",
              ][i]
            }
          >
            <select
              value={value[key] || ""}
              onChange={(e) =>
                update({ [key]: Number(e.target.value) || null })
              }
            >
              <option value="">Seleccionar persona</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </Field>
        ))}
      </div>
      <p>
        No se usan automáticamente los porcentajes de copropiedad. Estas
        personas tienen responsabilidades diferentes; su selección no registra
        pagos ni reintegros efectivos.
      </p>
    </fieldset>
  );
}
