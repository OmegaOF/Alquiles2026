import type { Page } from "@playwright/test";

export const apiBase = process.env.E2E_API_BASE || "http://127.0.0.1:8000";
export function credentials() {
  const username = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  if (!username || !password)
    throw new Error(
      "Configura E2E_USERNAME y E2E_PASSWORD de una cuenta de pruebas antes de ejecutar E2E.",
    );
  return { username, password };
}
export async function authenticate(page: Page) {
  const response = await page.request.post(`${apiBase}/api/v1/auth/login`, {
    data: credentials(),
  });
  if (!response.ok())
    throw new Error(
      `No se pudo autenticar la cuenta de pruebas (${response.status()}).`,
    );
}
