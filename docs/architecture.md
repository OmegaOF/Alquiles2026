# Arquitectura y alcance

## Fase 0: dependencias y aceptación

Requiere Python 3.11+, Node 22/24 y MySQL 8.4. Aceptación: API FastAPI ejecutable; conexión MySQL real; migración versionada aplicable y reversible en base descartable; React 18 con TypeScript compilable; interfaz en español adaptable; pruebas backend/frontend/integración ejecutadas; configuración de ejemplo sin secretos.

## Separación de responsabilidades

React → API REST `/api/v1` → rutas → servicios → SQLAlchemy → MySQL.

Las rutas validan entradas/salidas mediante Pydantic. Los servicios alojarán transacciones y reglas de negocio; la interfaz no decidirá importes ni permisos. SQLAlchemy conserva modelos persistentes; Alembic será la única vía de evolución de esquema. No se crean tablas automáticamente al arrancar.

El arranque no depende de MySQL para atender `/health`; `/ready` consulta MySQL y devuelve 503 con mensaje seguro si falla. CORS permite únicamente orígenes explícitos. La configuración requiere DATABASE_URL; no se imprimen credenciales ni excepciones de conexión al cliente. No hay operaciones de negocio expuestas.

## Módulos previstos, todavía sin implementar

Propietarios/propiedades/unidades/usuarios/permisos (fase 1); contratos y ocupaciones (fase 2); servicios y distribución (fase 3); obligaciones y movimientos (fase 4); anticréticos (fase 5); recordatorios y adaptador WhatsApp (fase 6); reportes ECharts/PDF (fase 7). No se instalan anticipadamente dependencias de gráficos, PDF, autenticación ni mensajería.

Cada fase deberá declarar dependencias y aceptación antes de implementarse. Se detendrá para revisión del usuario antes de iniciar la siguiente.

## Decisiones para las siguientes fases

- Roles y autorización por propietario se validarán en el backend, con pruebas de acceso cruzado. Autenticación y permisos aún no implementados.
- Dinero con Decimal y columnas Numeric; moneda explícita. Capital de anticrético separado de ingreso ordinario.
- Fechas de ocupación y de factura independientes; reglas de conteo explícitas. Fechas de calendario sin conversión inadvertida de zona; instantes de auditoría en UTC.
- Transacciones e idempotencia respaldada por restricciones únicas para operaciones económicas; auditoría de anulaciones y ajustes.
- Repartos de servicios conservarán factura, versión confirmada y ajustes. Las ambigüedades requieren intervención manual.
- Integración WhatsApp inicial solo Click to Chat con consentimiento, vista previa y confirmación manual; ningún envío automático.
- No hay dependencia del proyecto Pisco Ñawi ni de bases existentes. No se ha recibido su arquitectura detallada; se sigue la tecnología y separación especificadas por el usuario.

## Base visual

Español sencillo, base tipográfica 18 px, botones de al menos 52 px, foco visible, enlace para saltar al contenido, estructura semántica y mensajes con región de estado. Tarjetas futuras identificadas como “Próximamente”, sin acciones simuladas ni cifras ficticias. Paleta verde oscuro, superficies claras y adaptación móvil. La revisión con usuarios mayores y la auditoría completa de accesibilidad quedan para la fase 8; no se afirma conformidad WCAG certificada.

## Trabajo en el entorno

Cada tarea cloud ya está aislada: utilizar el checkout existente y no crear worktrees sin petición explícita. Procesos y conexiones no sobreviven necesariamente a una restauración: iniciar MySQL y ambas aplicaciones según README. No ejecutar `docker compose down -v` en bases que deban conservarse.
