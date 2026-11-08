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
  request_key: "identificación de esta operación; vuelva a abrir el formulario",
  new_total: "nuevo importe total",
  new_due_on: "nuevo vencimiento",
  occurred_on: "fecha del pago",
  method_id: "método de pago",
  category_id: "categoría del gasto",
  payer_id: "persona que entrega o paga el dinero",
  beneficiary_person_id: "persona que recibe el dinero",
  beneficiary_label: "empresa o destinatario",
  source_movement_id: "pago o saldo de origen",
  obligation_id: "importe por cobrar",
  applications: "conceptos e importes que se cubrirán",
  surplus: "tratamiento del dinero sobrante",
  authorize_guarantee: "autorización para aplicar la garantía",
  through: "fecha hasta la que se generarán periodos",
  weekly_partial_rule: "regla pactada del periodo semanal incompleto",
  last_period_rule: "regla pactada del último periodo mensual",
  expected_distribution_id: "reparto confirmado del servicio",
  expected_contract_version: "contrato actualizado; recargue los datos",
  agreed_capital: "capital acordado",
  restitution_on: "fecha pactada de restitución",
  expected_delivery_on: "fecha prevista de entrega del capital",
  holders: "titulares y sus importes acordados",
  responsibles: "responsables de devolución y sus importes",
  holder_id: "titular con derecho al capital",
  responsible_id: "responsable de restitución",
  assigned_amount: "importe expresamente asignado",
  allocations: "partes del capital y sus responsables",
  effective_on: "fecha efectiva del acuerdo",
  delta: "cambio autorizado de la responsabilidad",
  expected_fingerprint: "datos actualizados del aviso; vuelve a consultarlo",
  expected_proposal_fingerprint:
    "datos revisados del mensaje; vuelve a generar el texto",
  lead_days: "días previos al vencimiento",
  snooze_days: "plazo máximo para posponer",
  recipient_user_ids: "destinatarios internos autorizados",
  purpose: "tipo de comunicación autorizado",
  number: "número internacional",
  accepted_on: "fecha de aceptación",
  explicitly_accepted: "aceptación expresa de la persona",
  recipient_id: "destinatario del aviso",
  reporting_person_id: "persona que informa el pago",
  reported_on: "fecha comunicada del pago",
  authorization_operation_id: "comprobación reciente de la apertura",
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
