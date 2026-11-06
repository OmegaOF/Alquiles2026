# Entrega de fase 1.1 · Normalización

## Cierre definitivo tras recuperación — 6 de noviembre de 2026

Se recuperó el workspace anterior en la rama `phase-1-properties-users`, todavía sobre `2348bc1`. Estaban presentes todos los cambios de código, la migración `0003_identity` y los tres documentos de fase 1.1. **No faltó ningún archivo ni se reimplementó el trabajo.** Se reiniciaron únicamente las dos instancias MySQL descartables que habían quedado detenidas; se reutilizó la cuenta de pruebas existente sin cambiar su contraseña.

Esta revisión volvió a ejecutar las comprobaciones completas después de recuperar el entorno. Los resultados de esta sección sustituyen el estado provisional comunicado cuando el ejecutor no estaba disponible:

- `bash scripts/check.sh`, con las tres variables de base configuradas hacia la misma base descartable de migraciones y ejecución secuencial: **66 pruebas backend/MySQL aprobadas, ninguna fallida u omitida**, 29 avisos de las dos deprecaciones ya conocidas; `alembic check` sin diferencias; **14 pruebas frontend aprobadas** y compilación TypeScript/Vite correcta. Se verificó así también el uso compartido secuencial de la base que configura CI.
- Desde `frontend`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`, con la API usando la otra base descartable independiente: **16 pruebas aprobadas en escritorio y móvil**, ninguna fallida u omitida.
- Inspección directa posterior de MySQL: ocho tablas de aplicación más `alembic_version`, **ocho FK con RESTRICT/NO ACTION**, PK compuestas y UNIQUE esperadas, `foreign_key_checks=1` y revisión `0003_identity`.
- `0001_baseline.py` y `0002_phase1.py` coinciden con el commit base; no se modificaron migraciones anteriores. Sintaxis Python y `git diff --check` correctos.

No se modificó `main`, no se conectó con bases reales y no se publicaron cambios. Los resultados son de ejecución local del entorno; no se afirma una ejecución de CI en GitHub.

## Resultado y alcance

Trabajo sobre `phase-1-properties-users`, con base `2348bc1`. No se modificó `main`, no se publicó en GitHub ni se inició fase 2. No se alteraron migraciones anteriores ni datos reales.

El análisis demuestra 1FN, 2FN y 3FN **para los dominios y dependencias funcionales declarados** en [análisis formal](phase-1.1-normalization.md). No se concluye normalización a partir de pruebas que pasan, del número de tablas ni de la mera presencia de claves `id`. La estructura interna del documento histórico JSON de auditoría no se presenta como un conjunto de relaciones normalizadas.

## Tablas originales y resultantes

Se conservan las mismas ocho tablas: `persons`, `properties`, `property_owners`, `units`, `users`, `property_access`, `auth_sessions`, `audit_events`.

| Tabla | Cambio |
| --- | --- |
| persons | Conserva sus columnas y centraliza el nombre personal. Se añaden identidades para cuentas antes no vinculadas. |
| users | Retira full_name almacenado; person_id pasa a NOT NULL; incorpora display_name opcional como alias independiente. |
| audit_events | details pasa a MEDIUMTEXT en MySQL, sin cambiar eventos anteriores. |
| properties, property_owners, units, property_access, auth_sessions | Sin descomposición ni cambios de columnas por normalización. |

La separación de nombre personal y alias elimina la ambigüedad y la necesidad de sincronizar el nombre de una persona en sus cuentas. La obligatoriedad de persona es un refuerzo de integridad de esa decisión, no un teorema que convierta toda FK opcional en una infracción de 3FN. MEDIUMTEXT corrige capacidad de auditoría, no una dependencia transitiva.

No se crean catálogos de roles o tipos, no se duplican roles en property_access y no se agregan vigencias de titularidad sin un requisito funcional aprobado.

## Demostración resumida de claves y dependencias

En esta tabla `R` es el conjunto de atributos de la relación, listado individualmente en el análisis formal. Se omiten las DF triviales y sus consecuencias por las reglas de inferencia.

| Relación | Claves candidatas | Base de DF |
| --- | --- | --- |
| persons | id | id → todos los demás atributos. Document es identificador condicional cuando no es NULL, no clave global. |
| properties | id | id → todos los demás atributos. No se presume zone → city. |
| property_owners | (property_id, person_id) | El par completo → share; ningún componente aislado determina el porcentaje. |
| units | id; (property_id, code) | Cada clave completa → restantes atributos; no hay dependencia parcial de la clave alternativa. |
| users | id; username | Cada clave → restantes atributos de cuenta; person_id no determina el alias independiente, rol o contraseña. El nombre personal ya no es columna de users. |
| property_access | (property_id, user_id) | No tiene atributos fuera de la clave; no hay DF parcial o transitiva no clave. |
| auth_sessions | id; token_hash | Cada clave → restantes atributos de sesión. user_id no determina creación ni vencimiento. |
| audit_events | id | id → restantes atributos del evento; un recurso puede tener varios eventos con documentos diferentes. |

Con esas DF, los determinantes de toda DF no trivial hacia atributos no primos son superclaves. El análisis completo distingue las condiciones originales de fase 1, las anomalías concretas y las decisiones de dominio necesarias para esta demostración. Incluye el diagrama Mermaid actualizado.

## Backend, API y React

- `User.person` es una relación obligatoria; la propiedad Python/API `full_name` deriva de `persons.full_name` y no tiene columna propia en users.
- Las personas siguen pudiendo existir sin cuentas y poseer varias casas. Varias cuentas pueden representar a una persona, con alias distintos.
- Crear una cuenta para persona existente no renombra esa persona. Crear persona y cuenta juntas es atómico y ambas altas quedan auditadas. Las cuentas owner requieren seleccionar una persona propietaria existente.
- El frontend ofrece “Persona vinculada” o “Registrar persona nueva”; el nombre existente se muestra solo lectura y se corrige desde Personas. El alias se edita por separado.
- La API conserva compatibilidad con clientes de fase 1 que envían `full_name`: si difiere del nombre canónico y no se envía `display_name`, se guarda como alias. Nunca renombra implícitamente a la persona compartida. En PATCH, un nombre igual al canónico conserva el alias que ya existía; `display_name:null` es la forma explícita de limpiarlo.
- PATCH rechaza `person_id:null`. Cambiar la persona sigue revocando sesiones. No cambian los cuatro roles ni el alcance por propiedad.
- La auditoría de la fase anterior permanece intacta. Los nuevos eventos admiten documentos antes/después mayores de 64 KiB, sin hashes ni tokens.

## Migración y recuperación

Nueva revisión: [0003_identity](../backend/migrations/versions/0003_identity.py), incremental sobre `0002_phase1`. Se crean personas separadas por cuenta no vinculada, sin unir identidades por igualdad de nombre. Los nombres discrepantes se preservan en alias; los IDs, contraseñas, sesiones, titularidades, unidades, asignaciones y eventos existentes se conservan.

[Procedimiento detallado de migración y recuperación](phase-1.1-migration.md): respaldo verificado y escritores detenidos, particularidades de DDL MySQL, reintentos de etapas interrumpidas y retorno compatible a 0002. El downgrade conserva identidades creadas y no es una restauración exacta de filas o semántica de alias. Si hubiera auditorías demasiado grandes para TEXT, se bloquea antes de modificar el esquema. Restaurar exactamente un estado anterior requiere su respaldo verificado.

## Pruebas realmente ejecutadas

Entorno: Python 3.12, Node 24, MySQL 8.4 y Chromium del sistema. Dos instancias descartables independientes, puertos 3307 y 3308, con claves aleatorias fuera del repositorio. No se utilizó una base real ni se modificó `.env`.

| Suite | Resultado final |
| --- | --- |
| Backend: fases 0/1 y normalización, SQLite y MySQL | **58 aprobadas**, sin omitidas |
| Migración MySQL limpia/con datos y recuperación | **8 aprobadas**, sin omitidas |
| Frontend: componentes y regresión | **14 aprobadas** |
| Navegador: escritorio 1440×1000 y móvil 390×844 | **16 aprobadas** |
| Compilación TypeScript/Vite | Aprobada |
| Alembic check sobre MySQL migrado | Aprobado, sin diferencias |
| Sintaxis Python y git diff --check | Aprobados |

**66 pruebas backend/migración y 30 frontend/navegador** distintas en sus ejecuciones finales. La configuración de CI incluye la suite nueva, pero **no se ejecutó en GitHub** porque no se publicaron cambios.

### Correspondencia con las diez categorías obligatorias

1. Normalización/restricciones: columnas normalizadas, claves candidatas declaradas y nulabilidad; análisis de DF separado de las comprobaciones automatizadas.
2. Migraciones: desde cero y desde 0002 con personas, cuentas con/sin vínculo, nombres iguales/discrepantes, casas, cuartos, sesiones y auditoría.
3. Relaciones/FK: rechazo de unidades huérfanas, persona inexistente/nula en cuentas, FK preservada tras DDL.
4. Integridad/duplicados: documentos, usernames, cuartos, titularidades y accesos; rollback sin personas huérfanas al fallar el alta de cuenta.
5. Roles/permisos: aislamiento entre casas, IDs anidados, propietario/operador/administradores, último administrador activo, rechazo de escalamiento.
6. Autenticación: login correcto/incorrecto, expiración, revocación y rotación; sesión y contraseña PBKDF2 reales conservadas al migrar.
7. Propietarios con varias casas: dos casas por persona y cuartos repetibles solo entre casas distintas; propietarios sin cuenta.
8. Auditoría: valores anteriores/posteriores sin secretos, nombre histórico conservado y documento Unicode mayor de 65.535 bytes sin truncamiento.
9. Backend/frontend: API, formularios, alias y modificación de un nombre compartido por dos cuentas; acceso real por localhost.
10. Regresión 0/1: health/ready, CORS, conexión desde Inicio, pantallas y CRUD previos, autenticación, permisos y compilación.

### Fallos encontrados y resueltos durante la validación

- La prueba de CHECK esperaba IntegrityError, pero PyMySQL clasifica el rechazo 3819 como OperationalError. La restricción sí funcionaba. Se corrigió la prueba verificando además el nombre `ck_user_role`; la suite completa pasó después.
- Dos selectores E2E asumían una etiqueta sin texto de ayuda y alias únicos entre todas las cuentas. Se ajustaron a la etiqueta accesible real y a las cuentas de la persona correspondiente. No se cambió la aplicación ni se impuso unicidad ficticia para aprobarlos; los 16 casos pasaron después.
- Se mantuvieron visibles los avisos previos de Starlette/httpx y Alembic `path_separator`. No hubo errores pendientes ni pruebas omitidas en las ejecuciones finales declaradas.

## Cómo probar la interfaz

1. Seguir README para instalar, usar una base de desarrollo autorizada, aplicar migraciones y crear la primera cuenta si no existe.
2. En Personas, registrar una persona; puede marcarse propietaria sin crearle cuenta.
3. En Usuarios y permisos, crear una cuenta seleccionando esa persona; escribir un alias opcional y conservar el rol/propiedades deseados.
4. Crear una segunda cuenta vinculada a la misma persona y con otro alias.
5. Corregir el nombre desde Personas. Ambas cuentas deben mostrar el nombre nuevo y conservar sus alias.
6. Registrar cuenta con “Registrar persona nueva”: comprobar que aparece en Personas sin marcarla automáticamente como propietaria.
7. Verificar propiedades, cuartos, sesión y operaciones autorizadas como en fase 1.

## Pendientes que siguen fuera de fase 1.1

- Titularidades y permisos con fechas legales de vigencia: el estado actual y la auditoría no sustituyen una historia contractual por periodos.
- Varios roles simultáneos por propiedad y acceso de inquilinos: amplían la semántica funcional y no se necesitan para las DF actuales.
- Tipos/país de documentos; política de zona horaria en escrituras SQL externas; inmutabilidad y consultas avanzadas de auditoría.
- Libro de movimientos económicos, monedas, anticipos, capital y reparto de servicios: pertenecen a sus fases respectivas.
- Límite de intentos de login compartido entre procesos y evaluación completa de accesibilidad/seguridad de fase 8.

Las funcionalidades existentes continúan verificadas. La fase 2 no se ha iniciado; esta entrega queda pendiente de revisión y aprobación.

## Archivos incluidos en el cierre local

Los siguientes 22 archivos contienen los cambios de fase 1.1 respecto de `2348bc1`:

- `.github/workflows/checks.yml`
- `README.md`
- `backend/app/api/registry.py`
- `backend/app/bootstrap.py`
- `backend/app/models/entities.py`
- `backend/app/schemas/registry.py`
- `backend/app/services/registry.py`
- `backend/migrations/versions/0003_identity.py`
- `backend/tests/test_integration.py`
- `backend/tests/test_migration_11.py`
- `backend/tests/test_phase1.py`
- `docs/architecture.md`
- `docs/phase-1.1-migration.md`
- `docs/phase-1.1-normalization.md`
- `docs/phase-1.1.md`
- `frontend/e2e/registry.spec.ts`
- `frontend/src/App.tsx`
- `frontend/src/api.ts`
- `frontend/src/pages/Users.tsx`
- `frontend/src/types.ts`
- `frontend/tests/PhaseOne.test.tsx`
- `frontend/tests/UserIdentity.test.tsx`

El identificador del commit local se comunica en la entrega final. La revisión de archivos excluye `.env`, entornos virtuales, dependencias y resultados generados. Los valores de ejemplo de la base CI son públicos y descartables; no se incorporan credenciales reales.
