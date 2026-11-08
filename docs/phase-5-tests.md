# Verificación de fase 5

Datos exclusivamente ficticios. Bases MySQL 8.4 descartables creadas para esta fase, separadas de cualquier base real; las pruebas de migración utilizan otra base. Python 3.12, React 18/TypeScript, Chromium y dos tamaños de navegador: escritorio 1440×1000, móvil 390×844, idioma es-BO y zona America/La_Paz.

## Ejecución definitiva

Ejecución de cierre: 8 de noviembre de 2026 (UTC). Las pruebas que recrean tablas finalizaron antes de preparar el navegador.

| Comprobación | Resultado real |
| --- | --- |
| Backend completo, SQLite y MySQL | **339 aprobadas**, ninguna fallida/omitida, 438,96 s. Incluye las 276 anteriores y 63 nuevas (60 de capital/rutas y 3 de migración). |
| Migración 0007 limpia, 41 tablas pobladas y restricciones SQL | 3 aprobadas dentro de la suite completa. |
| Concurrencia nueva MySQL independiente | 3 aprobadas: entregas, devoluciones y repetición de la misma clave. |
| Alembic current/check | `0007_anticreticos (head)`; `No new upgrade operations detected.` |
| React | **42 aprobadas** en 8 archivos: 34 anteriores y 8 nuevas. |
| TypeScript y build de producción | `tsc --noEmit` y Vite aprobados; sin nuevas dependencias. |
| Playwright completo | **48 aprobadas**, ninguna fallida/omitida, 1,6 min: 38 recorridos anteriores y 10 nuevos (cinco en cada tamaño). |
| Capturas | **22 imágenes** nuevas, once pantallas por tamaño. |
| Migraciones anteriores | 0001–0006 idénticas byte a byte a la base `b4450db`. |

Las 67 advertencias del backend son deprecaciones de herramientas: una de Starlette/httpx y 66 de Alembic por `path_separator` ausente en la configuración anterior. No son pruebas omitidas ni fallos, y permanecen documentadas sin cambiar dependencias ajenas al alcance.

Black comprobó los nueve archivos Python nuevos o integrados y Prettier los doce archivos TypeScript/React revisados. `git diff --check` no detectó errores de espacios. La [revisión de entrega](verification/phase-5-review.txt) conserva la comprobación de credenciales, migraciones anteriores y enlaces locales; no se incluyeron `.env` privados ni datos reales.

Registros completos de las ejecuciones aprobadas: [backend, Alembic, React y build](verification/phase-5-check.txt) y [navegador completo](verification/phase-5-browser.txt). Las ejecuciones interrumpidas o con fallos preliminares no se usan para contabilizar aprobaciones. **Las funcionalidades de las fases 0 a 4 mantienen su regresión aprobada sobre el código final de fase 5.**

## Cobertura de aceptación

`A` identifica `backend/tests/test_anticreticos.py`; `M`, `backend/tests/test_migration_5.py`; `R`, `frontend/tests/Anticreticos.test.tsx`; `E`, `frontend/e2e/anticreticos.spec.ts`. Los casos de negocio de A se repiten con SQLite y MySQL, salvo el control de rutas sin base y las tres carreras exclusivas de MySQL.

| N.º | Criterio solicitado | Evidencia automatizada |
| --- | --- | --- |
| 1 | Casa completa | A `existing_contract_and_agreement_do_not_imply_money`, variante whole; E flujo de capital de casa completa. |
| 2 | Cuarto | A mismo caso variante unidad; E titulares y correcciones en cuarto. |
| 3 | Vincular contrato existente | A `existing_contract_and_agreement_do_not_imply_money`; POST conditions no crea otro contrato. |
| 4 | Anticrético anterior sin capital | M `upgrade_downgrade_preserve_all_41_tables_and_legacy_contract`; R formulario vacío y E información pendiente. |
| 5 | Acordado sin entrega | A `existing_contract_and_agreement_do_not_imply_money`; R conditions sin `amount`; E saldos cero al guardar. |
| 6 | Entrega completa | A `return_limits_and_idempotence`; E acumulado de 70.000. |
| 7 | Entregas parciales | A `partial_deliveries_returns_and_reconciliation`; E 20.000 + 30.000 + 20.000. |
| 8 | Pendiente de recibir | A `partial_receipt_remains_separate_from_restitution_and_overpayment_blocked`. |
| 9 | Pendiente de devolución | A `partial_deliveries_returns_and_reconciliation`; E saldo 45.000. |
| 10 | Límite acordado y ampliación autorizada | A `partial_receipt_remains_separate_from_restitution_and_overpayment_blocked`. |
| 11 | Devolución parcial | A `partial_deliveries_returns_and_reconciliation`; R revisión antes/después. |
| 12 | Devolución completa | A `return_limits_and_idempotence`; E restitución total conservando deuda de servicios. |
| 13 | Varias devoluciones | A `partial_deliveries_returns_and_reconciliation`; E 10.000 + 15.000. |
| 14 | Límite de saldo | A `return_limits_and_idempotence`, `wrong_beneficiary_early_return_and_chronology_are_checked`. |
| 15 | Devolución duplicada | A `return_limits_and_idempotence`, carrera return. |
| 16 | Varios titulares | A `explicit_multiple_holders_responsibles_and_payer_distinction`; E partes expresas. |
| 17 | Varios responsables | A mismo caso y `responsibility_reassignment_is_explicit_and_preserves_total`. |
| 18 | Sumas de partes | A `incomplete_parties_and_wrong_sums_require_review`; E importes por pareja que suman una entrega. |
| 19 | Aportante, titular, responsable y pagador distintos | A `explicit_multiple_holders_responsibles_and_payer_distinction`; R devolución con pagador diferente; E entrega efectuada por otra persona. |
| 20 | Otra persona devuelve | A mismo caso; E devolución con otro pagador físico. |
| 21 | Ocupación finalizada con pendiente | A `occupation_finish_and_capital_dates_are_independent`; E cierre y servicios. |
| 22 | Restituir no finaliza ocupación | A `return_limits_and_idempotence`, `overdue_and_settled_by_agreement_are_distinct_from_cash`; E mantiene active. |
| 23 | Prórroga/disponibilidad | A `extend_uses_existing_availability_and_conditions_history`, incluido solapamiento rechazado; E prórroga hasta 29/02/2032. |
| 24 | Fecha de restitución histórica | A mismo caso; E conserva dos revisiones. |
| 25 | Cambio de capital autorizado | A `partial_receipt_remains_separate_from_restitution_and_overpayment_blocked`; E cambia 70.000 a 80.000 con motivo. |
| 26 | Cambio no altera efectivo | A `reduced_agreement_does_not_change_received_capital`; E histórico y saldos. |
| 27 | Corregir entrega | A `correction_and_void_guards_preserve_history`; E 20.000 anulado → 15.000 válido. |
| 28 | Corregir devolución | A mismo caso; E 10.000 anulado → 5.000 válido. |
| 29 | Anulación con historia | A mismo caso y `adjustments_are_explicit_non_cash_and_do_not_pay_services`; E dos originales anulados. |
| 30 | Anulación inconsistente bloqueada | A `correction_and_void_guards_preserve_history`; presupuestos y cronología por pareja. |
| 31 | Capital separado de alquiler | A `partial_deliveries_returns_and_reconciliation`, `capital_cannot_be_applied_refunded_or_voided_as_ordinary_funds`; no subtipo incoming/aplicación ordinaria. |
| 32 | Capital separado de garantía | A mismos casos; conteo finance_guarantees cero y disponible ordinario cero. |
| 33 | Servicios independientes | A `capital_cannot_be_applied_refunded_or_voided_as_ordinary_funds`; E devuelve capital con servicio 150 pendiente. |
| 34 | Regla de 15 días | A `anticretic_services_keep_fifteen_day_rule`: 14→70, 15→150, 16→150 para una parte de 150 sobre 30 días. Regresión de meses reales en test_utilities. |
| 35 | Servicios incluidos | A `anticretic_included_or_owner_services_never_reduce_capital`, variantes incluido y a cargo del propietario. |
| 36 | Sin descuento automático | A mismos casos y `adjustments_are_explicit_non_cash_and_do_not_pay_services`; E pendiente de servicios intacto después de restitución. |
| 37 | Doble clic | A `delivery_replay_external_reference_and_audit`, carrera same_key; R reintento conserva clave. |
| 38 | Resultado idempotente original | A mismos casos y `return_limits_and_idempotence`; no nueva auditoría/dinero en reintento. |
| 39 | Entregas concurrentes | A `mysql_independent_capital_races[delivery]`, conexiones independientes MySQL. |
| 40 | Devoluciones concurrentes | A `mysql_independent_capital_races[return]`, un presupuesto compartido MySQL. |
| 41 | Monedas | A `currency_scope_and_operator_permissions`, `capital_summary_keeps_currency_separate_and_excludes_void_cash`; R dos monedas separadas. |
| 42 | Propiedad ajena | A `capital_scope_nested_ids_and_sensitive_permissions`, `currency_scope_and_operator_permissions`; 404 para casa/contrato incompatible. |
| 43 | Roles | A casos anteriores para property_admin/owner/operator; R propietario/operador; E cuentas reales de prueba. |
| 44 | Historia contractual/económica | A `extend_uses_existing_availability_and_conditions_history`, `correction_and_void_guards_preserve_history`; E condiciones y movimientos previos. |
| 45 | Normalización | M estructura y restricciones; análisis formal de claves/DF por cada tabla en [informe](phase-5.md#demostración-de-normalización). Un test no demuestra DF no declaradas: se justifica el dominio. |
| 46 | Migración limpia | M `clean_mysql_0007_and_normalized_structure`. |
| 47 | 41 tablas con datos | M `upgrade_downgrade_preserve_all_41_tables_and_legacy_contract`: todas no vacías, comparación completa de filas, up/down/up. |
| 48 | Regresión 0–4 | Suite backend completa, 34 pruebas React previas y 38 E2E previos. |
| 49 | Escritorio y móvil | R componentes y E cinco flujos en ambos proyectos Playwright; capturas abajo. |
| 50 | Sin procesos tributarios | A `phase5_has_no_fiscal_legal_or_messaging_routes`, regresión de rutas fase 4 y revisión del diff. |
| 51 | Sin WhatsApp ni avisos automáticos | A mismo caso, R consulta de vencimientos sin botón de envío, revisión de código/dependencias. |
| 52 | Resumen y movimientos válidos | A `partial_deliveries_returns_and_reconciliation`, `capital_summary_keeps_currency_separate_and_excludes_void_cash`; E compara resumen económico, cero ingresos ordinarios y saldo 45.000. |

Casos adicionales: condición incompleta bloquea efectivo; beneficiario no autorizado; restitución anticipada no permitida; devolución anterior a entrega; rebaja por debajo de lo recibido exige reconocimiento; no retirar responsables con saldo; reasignación conserva total y permite entregar bajo el cupo nuevo; acuerdo adicional habilita otra restitución sin inventar ingreso; propietario no escribe y administrador de propiedad sí restituye.

## Concurrencia real

Las tres variantes de `test_mysql_independent_capital_races` crean dos clientes/sesiones con conexiones distintas, los sincronizan con `Barrier` antes de bloquear la misma fila de propiedad y esperan ambas respuestas. Entregas de 40.000 contra acuerdo de 70.000: una 201 y otra 409. Restituciones de 40.000 contra saldo de 50.000: una 201 y otra 409. Dos solicitudes idénticas: ambas 201, mismo resultado/operation_id y una sola fila de dinero. No se sustituyen estas pruebas por SQLite ni por llamadas secuenciales.

## Migraciones e integridad

La prueba de conservación incorpora anticrético previo sin capital y registros en todas las relaciones financieras anteriores: cuentas, operaciones, obligaciones de renta/servicio, ajustes, gasto, pago, garantía, devolución, aplicación y enlace/importación de servicios. Incluye identidad, sesiones, propietarios, permisos e historia de las fases 1–3. Up 0006→0007, down→0006 y up→0007 conservan cada fila previa. La bajada se prueba antes de usar capital nuevo; la recuperación tras uso real requiere respaldo coherente, como explica el informe.

Se comprueban 49 tablas más Alembic, PK del complemento por contrato, ausencia de moneda/casa duplicada, tipo monetario y subtipo sin importe repetido. MySQL rechaza FK huérfana, pareja duplicada, importe negativo, persona inexistente y delta cero. Alembic check comprueba correspondencia de modelos y esquema.

## Incidencias y correcciones

- Los ensayos iniciales detectaron que el presupuesto de una nueva entrega debía considerar capital reasignado; se corrigió y se añadió una entrega posterior al traslado con comprobación del total.
- Una prueba de servicios incluidos cambiaba condiciones de un contrato histórico y activaba correctamente revisión del reparto. Se corrigió su preparación para crear el contrato incluido desde el inicio; el control histórico sigue activo.
- Se corrigió la expectativa de auditoría para usar las acciones reales `anti-*` y verificar dos eventos (condiciones y una entrega), sin contar reintentos como dinero nuevo.
- TypeScript detectó `exact` no admitido por Testing Library en dos pruebas y un destinatario opcional al tipar correctamente movimientos con varios titulares. Se corrigieron ambos casos; la compilación y las 42 pruebas React posteriores finalizaron correctamente.
- Los primeros E2E repetían al responsable dentro de ocupantes adicionales; el backend rechazó correctamente el contrato. Se corrigió el fixture. También se cambiaron selectores exactos por etiqueta a selectores de rol/nombre accesible para los desplegables: el texto de sus opciones impedía la coincidencia de Playwright. No se cambió la regla contractual para acomodar la prueba.
- Dos ejecuciones largas sin cierre fueron interrumpidas por el entorno. No se contaron como aprobadas; se repitió la suite con salida continua y registro de resultado final.

## Capturas y revisión visual

Capturas de la ejecución completa aprobada, exclusivamente con datos ficticios:

| Pantalla | Escritorio | Móvil |
| --- | --- | --- |
| Contrato anterior sin capital | [Ver](screenshots/phase-5-escritorio-detalle-pendiente.png) | [Ver](screenshots/phase-5-movil-detalle-pendiente.png) |
| Condiciones y varias personas | [Ver](screenshots/phase-5-escritorio-condiciones.png) | [Ver](screenshots/phase-5-movil-condiciones.png) |
| Entrega real | [Ver](screenshots/phase-5-escritorio-entrega.png) | [Ver](screenshots/phase-5-movil-entrega.png) |
| Devolución y revisión del saldo | [Ver](screenshots/phase-5-escritorio-devolucion.png) | [Ver](screenshots/phase-5-movil-devolucion.png) |
| Titulares y responsables | [Ver](screenshots/phase-5-escritorio-personas.png) | [Ver](screenshots/phase-5-movil-personas.png) |
| Listado | [Ver](screenshots/phase-5-escritorio-listado.png) | [Ver](screenshots/phase-5-movil-listado.png) |
| Consulta de vencimientos | [Ver](screenshots/phase-5-escritorio-vencimientos.png) | [Ver](screenshots/phase-5-movil-vencimientos.png) |
| Historial y correcciones | [Ver](screenshots/phase-5-escritorio-historial.png) | [Ver](screenshots/phase-5-movil-historial.png) |
| Resumen del capital | [Ver](screenshots/phase-5-escritorio-resumen.png) | [Ver](screenshots/phase-5-movil-resumen.png) |
| Capital y cierre | [Ver](screenshots/phase-5-escritorio-cierre.png) | [Ver](screenshots/phase-5-movil-cierre.png) |
| Servicios pendientes independientes | [Ver](screenshots/phase-5-escritorio-servicios.png) | [Ver](screenshots/phase-5-movil-servicios.png) |

Se inspeccionaron visualmente devolución/resumen de escritorio y cierre/devolución móvil: texto legible, controles amplios, cantidades diferenciadas y disposición vertical adaptable. Los E2E verifican además ausencia de desbordamiento en el flujo de consulta. No se presenta esta revisión como certificación WCAG ni como prueba con personas mayores; esa evaluación permanece en fase 8.

## Reproducir

1. Configurar `DATABASE_URL`, `PHASE1_TEST_DATABASE_URL` y las cinco variables `PHASE11/2/3/4/5_MIGRATION_DATABASE_URL` únicamente hacia MySQL descartable con nombre terminado en `_test`.
2. Desde raíz: `bash scripts/check.sh`. No iniciar navegador mientras los fixtures recrean tablas.
3. Crear administrador de prueba por bootstrap, iniciar FastAPI y Vite, configurar `E2E_USERNAME`, `E2E_PASSWORD` y Chromium sin versionar secretos.
4. Desde frontend: `npm run test:e2e`; capturas nuevas: `CAPTURE_PHASE5_SCREENSHOTS=1 npm run test:e2e -- anticreticos.spec.ts`.

No se requieren nuevas dependencias de aplicación. Ninguna prueba usa datos reales o instala el sistema en la computadora del usuario.
