const base = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
export async function checkConnection(): Promise<void> {
  const response = await fetch(`${base}/api/v1/ready`, {
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok)
    throw new Error("No se pudo conectar con el sistema. Intente nuevamente.");
  const data: unknown = await response.json();
  if (
    !data ||
    typeof data !== "object" ||
    !("database" in data) ||
    data.database !== "ok"
  )
    throw new Error("La respuesta del sistema no es válida.");
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
const fieldNames: Record<string, string> = {
  username: "usuario",
  password: "contraseña",
  full_name: "nombre completo",
  display_name: "alias de la cuenta",
  document: "documento",
  email: "correo electrónico",
  phone: "teléfono",
  whatsapp: "WhatsApp",
  address: "dirección",
  name: "nombre",
  code: "número de cuarto",
  owners: "propietarios",
  manager_ids: "administradores",
  share: "participación",
  city: "ciudad",
  role: "rol de acceso",
  person_id: "persona vinculada",
  property_ids: "propiedades autorizadas",
  property_id: "casa",
  unit_id: "casa completa o cuarto",
  responsible_person_id: "persona responsable",
  occupant_ids: "ocupantes adicionales",
  owner_parties: "propietarios firmantes",
  start_date: "fecha de entrada",
  end_date: "fecha de salida",
  expires_at: "vencimiento de la reserva",
  price: "precio acordado",
  currency: "moneda",
  due_day: "día de vencimiento",
  due_terms: "vencimientos pactados",
  monthly_period: "periodo mensual",
  first_period: "primer periodo",
  conditions: "condiciones adicionales",
  reason: "motivo del cambio",
  mode: "modalidad de alquiler",
  amount: "importe",
  fixed_amount: "parte fija del recibo",
  period_start: "inicio del consumo",
  period_end: "fin del consumo",
  issued_on: "fecha del recibo externo",
  due_on: "fecha límite de pago",
  value: "valor de la lectura",
  recorded_on: "fecha de la lectura",
  installed_on: "fecha de instalación",
  retired_on: "fecha de retiro",
  serial: "identificación del medidor",
  provider: "empresa proveedora",
  label: "nombre del suministro",
  method: "método de reparto",
  owner_person_id: "responsable de la parte del propietario",
  percentages: "porcentajes de los cuartos",
  responsibilities: "personas e importes del reparto",
};
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}/api/v1${path}`, {
      method,
      credentials: "include",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new ApiError(
      "No se pudo conectar con el sistema. Comprueba tu conexión y vuelve a intentar.",
      0,
    );
  }
  if (!response.ok) {
    let message = "No se pudo completar la operación. Vuelve a intentar.";
    try {
      const data = await response.json();
      if (response.status === 422 && Array.isArray(data.fields)) {
        const fields = data.fields.map(
          (key: unknown) =>
            fieldNames[String(key)] || "los datos del formulario",
        );
        message = `Revisa ${[...new Set(fields)].join(", ")}. Completa los campos obligatorios y respeta el formato y longitud indicados.`;
      } else if (typeof data.detail === "string") message = data.detail;
      else if (Array.isArray(data.detail)) {
        const fields = data.detail.map((e: { loc?: (string | number)[] }) => {
          const key = String(e.loc?.at(-1) || "");
          return fieldNames[key] || "los datos del formulario";
        });
        message = `Revisa ${[...new Set(fields)].join(", ")}. Hay datos incompletos o con un formato incorrecto.`;
      }
    } catch {
      /* Una respuesta inválida conserva el mensaje seguro. */
    }
    if (response.status === 401 && !path.startsWith("/auth/"))
      window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
