const base = (
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");
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
