# Arquitectura y alcance

## Fase 0: dependencias y aceptación

Requiere Python 3.11+, Node 22/24 y MySQL 8.4. Aceptación: API FastAPI ejecutable; conexión MySQL real; migración versionada aplicable y reversible en base descartable; React 18 con TypeScript compilable; interfaz en español adaptable; pruebas backend/frontend/integración ejecutadas; configuración de ejemplo sin secretos.

## Separación de responsabilidades

React → API REST `/api/v1` → rutas → servicios → SQLAlchemy → MySQL.

Las rutas validan entradas/salidas mediante Pydantic. Los servicios alojarán transacciones y reglas de negocio; la interfaz no decidirá importes ni permisos. SQLAlchemy conserva modelos persistentes; Alembic será la única vía de evolución de esquema. No se crean tablas automáticamente al arrancar.

El arranque no depende de MySQL para atender `/health`; `/ready` consulta MySQL y devuelve 503 con mensaje seguro si falla. CORS permite únicamente orígenes explícitos. La configuración requiere DATABASE_URL; no se imprimen credenciales ni excepciones de conexión al cliente. La fase 1 añade recursos autenticados; los endpoints de estado siguen disponibles sin autenticación.

## Módulos y fases

Propietarios/propiedades/unidades/usuarios/permisos implementados en fase 1 e identidad normalizada en 1.1. Contratos, reservas y ocupaciones implementados en fase 2. Servicios básicos, recibos y distribución implementados en fase 3. Obligaciones, pagos, garantías y gastos implementados en fase 4. Pendientes: capital y devoluciones de anticréticos (fase 5); recordatorios y adaptador WhatsApp (fase 6); reportes ECharts/PDF (fase 7). No se instalan anticipadamente dependencias de gráficos, PDF ni mensajería.

Cada fase deberá declarar dependencias y aceptación antes de implementarse. Se detendrá para revisión del usuario antes de iniciar la siguiente.

## Decisiones para las siguientes fases

- Roles y autorización por propietario se validarán en el backend, con pruebas de acceso cruzado. Implementados en fase 1 mediante sesiones opacas y alcance por propiedad.
- Dinero con Decimal y columnas Numeric; moneda explícita. Capital de anticrético separado de ingreso ordinario.
- Fechas de ocupación y de recibo independientes; reglas de conteo explícitas. Fechas de calendario sin conversión inadvertida de zona; instantes de auditoría en UTC.
- Transacciones e idempotencia respaldada por restricciones únicas para operaciones económicas; auditoría de anulaciones y ajustes.
- Repartos de servicios conservan recibo, versión confirmada y ajustes. Las ambigüedades requieren intervención manual.
- Integración WhatsApp inicial solo Click to Chat con consentimiento, vista previa y confirmación manual; ningún envío automático.
- No hay dependencia del proyecto Pisco Ñawi ni de bases existentes. No se ha recibido su arquitectura detallada; se sigue la tecnología y separación especificadas por el usuario.

## Base visual

Español sencillo, base tipográfica 18 px, botones de al menos 52 px, foco visible, enlace para saltar al contenido, estructura semántica y mensajes con región de estado. La fase 0 conserva su componente y pruebas; la aplicación de fase 1 incorpora pantallas reales, sin acciones simuladas ni cifras ficticias. Paleta verde oscuro, superficies claras y adaptación móvil. La revisión con usuarios mayores y la auditoría completa de accesibilidad quedan para la fase 8; no se afirma conformidad WCAG certificada.

## Trabajo en el entorno

Cada tarea cloud ya está aislada: utilizar el checkout existente y no crear worktrees sin petición explícita. Procesos y conexiones no sobreviven necesariamente a una restauración: iniciar MySQL y ambas aplicaciones según README. No ejecutar `docker compose down -v` en bases que deban conservarse.

## Sesiones e historial de fase 1

Las personas se separan de cuentas y titularidades. PropertyOwner conserva copropietarios/porcentaje y PropertyAccess el alcance de administradores/operadores. Los estados de unidad solo expresan habilitación y mantenimiento. No se infiere ocupación.

Cookie HttpOnly SameSite=Strict, Secure fuera de development, token aleatorio cuyo hash queda en AuthSession, vencimiento de ocho horas. El servidor verifica sesión, usuario activo, rol y propiedad en cada operación. Cambiar contraseña, rol, persona o estado invalida sesiones. El frontend usa /api en el mismo origen mediante proxy; CORS autoriza orígenes exactos y las mutaciones rechazan otros Origin.

AuditEvent registra actor, instante UTC, recurso, acción y valores anteriores/posteriores, incluidas titularidades y accesos. Nunca contiene contraseñas, hashes ni tokens. No hay eliminación física por API. El visor de auditoría y los contratos no pertenecen a esta fase.

## Contratos y ocupación en fase 2

Cinco tablas nuevas completan trece tablas de aplicación: `contracts`, `contract_occupants`, `contract_owners`, `reservations` y `property_contacts`. Las ocho tablas anteriores mantienen su esquema. El historial utiliza `audit_events` y la ocupación se deriva de los contratos; no se duplica en otra tabla.

Cada contrato o reserva apunta exactamente a una casa completa **o** a una unidad. La casa de una unidad se resuelve mediante `units.property_id`, sin almacenarla otra vez. El responsable, los ocupantes y los firmantes apuntan a `persons`, sin copiar nombres. Los firmantes contractuales se conservan aunque cambien los titulares actuales. La disponibilidad combina fechas inclusivas, reservas activas y mantenimiento/habilitación; un contrato por noches sigue ocupando la fecha de salida.

Todas las escrituras de contratos/reservas se serializan mediante el bloqueo de la fila de propiedad, compartido con las modificaciones de propiedad/unidad de fase 1. Las comprobaciones críticas usan `FOR UPDATE` para ver las últimas filas confirmadas incluso bajo REPEATABLE READ de MySQL. La conversión reserva→contrato utiliza una única transacción y `UNIQUE(source_reservation_id)`.

La fase 2 conserva condiciones con `DECIMAL(14,2)` y deriva conteos/periodos; no crea recibos, deudas, pagos ni reparto de servicios. Reglas, estados, permisos, dependencias funcionales, migración y límites: [phase-2.md](phase-2.md) y [phase-2-api.md](phase-2-api.md).

## Servicios básicos y distribución en fase 3

Doce tablas nuevas llevan el esquema a 25 tablas de aplicación. Se separan catálogo, suministro, medidor físico/lectura, configuración versionada, identidad/revisión del recibo, distribución, base por espacio y responsabilidades por persona/contrato. Una referencia con PK por recibo conserva la única distribución vigente. La migración `0005_utilities` no altera las cuatro anteriores.

La secuencia es recibo externo → base por espacio → contratos históricos del periodo → condiciones → regla de 15 días → diferencia del propietario → revisión/confirmación. Diario y servicios incluidos siempre excluyen gastos adicionales al ocupante. La casa completa representa un espacio, sin duplicación entre cuartos. Personas-día y lecturas tienen reglas explícitas; los datos insuficientes o incompatibles obligan a revisión.

Los importes usan `Decimal`, residuos de centavos deterministas y comprobación exacta de sumas. La persona responsable, el pagador previsto del proveedor y el beneficiario previsto de reintegros son decisiones independientes. No existen pagos efectivos, deudas ni emisión comercial/tributaria. No se deducen responsabilidades desde participaciones de copropiedad.

Las operaciones comparten bloqueo de propiedad con fase 2 y verifican versiones y fuentes actuales antes de confirmar. Las correcciones crean revisiones/ajustes, conservando datos aprobados y evidencia histórica. Detalle de tablas, claves, dependencias funcionales y frontera del documento de evidencia: [phase-3.md](phase-3.md). Rutas y contratos HTTP: [phase-3-api.md](phase-3-api.md); validación real: [phase-3-tests.md](phase-3-tests.md).

## Identidad normalizada en fase 1.1

El nombre personal se almacena únicamente en `persons.full_name`. Toda cuenta tiene `users.person_id` obligatorio y puede conservar un `display_name` independiente como alias. El `full_name` de la API es una proyección de la persona, sin columna duplicada en users. Las personas pueden seguir existiendo sin cuentas y varias cuentas pueden vincularse a la misma persona.

Se mantienen ocho tablas y los roles/alcances de fase 1. La ampliación de auditoría a MEDIUMTEXT resuelve capacidad y no se confunde con 3FN. La demostración individual de dependencias, claves, dominios y formas normales está en [phase-1.1-normalization.md](phase-1.1-normalization.md); la migración incremental y recuperación en [phase-1.1-migration.md](phase-1.1-migration.md). Las titularidades con vigencia y los roles por propiedad permanecen fuera de esta modificación.

## Dinero y obligaciones en fase 4

Dieciséis tablas nuevas llevan el esquema a 41 tablas de aplicación. Se separan contexto de titular/casa/moneda, obligaciones, ajustes, gastos, movimientos reales y aplicaciones. Entradas/anticipos, garantías, desembolsos y devoluciones usan subtipos del movimiento, sin repetir importes. Los saldos se derivan; no se guarda otra deuda acumulada cada mes.

Los alquileres se generan con vista previa desde los periodos contractuales. Condiciones incompletas requieren decisión explícita. Los servicios proceden de responsabilidades confirmadas e importaciones versionadas; una corrección libera excesos hacia la misma fuente, sin modificar el dinero recibido. Un gasto de proveedor puede registrarse y pagarse antes del reparto; la importación posterior conserva ese gasto.

Las operaciones económicas conservan clave idempotente, huella y resultado histórico; comparten bloqueo por propiedad con fases anteriores y utilizan lecturas actuales para saldos. Cantidades `DECIMAL(14,2)` y precisión de cálculo 48; dinero real, garantías y aplicaciones no se suman como nuevas entradas entre sí. Pagos directos de inquilinos al proveedor se distinguen de caja del propietario.

`0006_finances` no modifica las migraciones 0001–0005. Datos, dependencias funcionales, restricciones, límites y recuperación: [phase-4.md](phase-4.md). HTTP: [phase-4-api.md](phase-4-api.md); evidencia real: [phase-4-tests.md](phase-4-tests.md). No existen procesos fiscales ni capital de anticrético en este módulo.
