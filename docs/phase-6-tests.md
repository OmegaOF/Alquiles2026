# Pruebas y evidencias · Fase 6

Entorno cloud, exclusivamente datos ficticios y bases MySQL 8.4 descartables. Rama `phase-6-reminders-whatsapp`, base `e078aaf64da189657d6435939309fb0f2e0b75ae`. Las credenciales temporales se proporcionaron fuera del repositorio, sin incluirlas en comandos documentados ni capturas.

## Resultados definitivos

Verificación final ejecutada el 2026-11-08T12:00:41-04:00 (America/La_Paz) sobre el commit `685616ad087039800404d32b6c54df197a316ffa`. Código, migraciones y pruebas permanecieron sin modificaciones durante toda la ejecución. [Manifiesto y sumas SHA-256](phase-6-verification/manifest.json).

| Comprobación | Resultado definitivo |
| --- | --- |
| Backend completo, fases 0–6 | **441/441 aprobadas en una única ejecución completa**, 0 fallos, 0 errores, 0 omitidas; 1734.384 segundos |
| Evidencia backend | [Registro íntegro](phase-6-verification/backend.txt) y [JUnit XML](phase-6-verification/backend.xml) |
| MySQL real | 205 casos parametrizados con MySQL y 23 pruebas de migraciones sobre bases descartables |
| Concurrencia de fase 6 | **9/9 aprobadas**: tres carreras de acciones/preparación y seis variantes de lectura simultánea |
| Migración 0008 | **3/3 aprobadas**: base limpia, conservación de las 49 tablas pobladas up/down/up y restricciones SQL |
| React | **54/54 aprobadas** ([registro](phase-6-verification/react.txt)) |
| TypeScript | `tsc --noEmit`, código 0 ([registro](phase-6-verification/typescript.txt)) |
| Compilación | `vite build`, código 0 ([registro](phase-6-verification/build.txt)) |
| Playwright completo | **64/64 aprobadas**: 32 en escritorio y 32 en móvil ([registro](phase-6-verification/playwright.txt)) |
| Alembic | Sin operaciones pendientes ([registro](phase-6-verification/alembic.txt)); 0001–0007 idénticas a main con fase 5 |
| Capturas | **24 incluidas en Git**, doce por dispositivo; sumas verificadas y sin cambios |

La ejecución completa confirma las fases anteriores y los casos de saldos reales, pagos parciales, ajustes, anulaciones, ausencia de dinero creado por avisos/reportes, consentimiento vigente y separación entre apertura y envío manual. El registro de la API durante Playwright no presentó errores 500, interbloqueos ni trazas. El dominio `wa.me` se intercepta en las pruebas; no se realizaron envíos externos.

Los nuevos registros sustituyen el resultado combinado de la entrega anterior. **Los 441 casos aprobaron juntos; no se sumaron ejecuciones parciales ni se modificaron aserciones para aprobar.** Código y pruebas conservan la huella `cb88b2534ca2ca969794c7a065c65858a57a47249c4519cca587a8777dbc150c`.

### Historial de la entrega anterior

El informe original de `685616a` combinaba 438 aprobaciones de una pasada general con una repetición de 102 casos del módulo. Tres casos habían fallado por `BrokenBarrierError` en la instrumentación y se corrigió entonces la barrera para llamadas anidadas. Esa historia se conserva aquí; la nueva verificación ejecuta **todo el conjunto de 441 casos sin fallos**, con la barrera que ya estaba incluida en el commit recibido. No fue necesario modificar código ni pruebas durante esta revisión.

La suite backend repite casos en SQLite con FK activas y MySQL real. Las seis suites de migración se ejecutan secuencialmente en una base independiente. Se habilitaron `RUN_MYSQL_TESTS`, `PHASE1_TEST_DATABASE_URL` y todas las `PHASE*_MIGRATION_DATABASE_URL`, incluida `PHASE6_MIGRATION_DATABASE_URL`. No se presentan omisiones por falta de MySQL como aprobaciones.

Comandos de verificación:

```bash
# Variables apuntando únicamente a bases descartables terminadas en _test.
cd backend
../.venv/bin/alembic upgrade head
../.venv/bin/pytest -v
../.venv/bin/alembic check
cd ..
npm --prefix frontend test
(cd frontend && ./node_modules/.bin/tsc --noEmit)
npm --prefix frontend run build
# Después de las pruebas destructivas y de crear la cuenta temporal:
cd frontend
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
CAPTURE_PHASE6_SCREENSHOTS=1 npm run test:e2e
```

La primera ejecución de navegador comenzó después de las pruebas backend. Para la verificación final se aisló el navegador en una tercera base descartable, distinta de las dos bases de backend/migraciones; ninguna reconstrucción de tablas se ejecuta sobre su base mientras está abierto. Se reproduce el estado posterior a fixtures, con tablas de aplicación vacías y revisión Alembic actual; después se crea únicamente el administrador temporal. **No se cargan catálogos manualmente**. Los E2E preparan Efectivo, Servicios básicos, tipos de suministro y sus datos mediante la API. Se conserva la corrección de fase 5 que creó explícitamente su categoría si faltaba. No se modificaron 0001–0007 ni se retiró la validación de importación del backend.

## Matriz de los 56 criterios

Los nombres siguientes corresponden a funciones reales de `backend/tests/test_reminders.py`, salvo que se indique otro archivo. Las parametrizaciones se ejecutan realmente en los motores indicados.

| Criterios de la solicitud | Evidencia automatizada |
| --- | --- |
| 1–4. Alquiler próximo, vencido, pagado y parcial | `test_live_due_overdue_partial_paid_and_no_duplicate_accounting`; E2E saldo parcial |
| 5–7. Ajuste, anulación de obligación, vencimiento cambiado | `test_adjustment_zero_and_changed_due_use_financial_source`; la anulación económica se representa por el ajuste trazable a cero existente en fase 4 |
| 8–11. Servicio pendiente, pagado por propietario, recuperación y pago parcial | `test_services_owner_payment_recovery_partial_and_single_receipt_notice`; E2E servicios/proveedor |
| 12–13. Parte del propietario y alquiler diario | `test_exempt_services_never_become_tenant_reminders`; regresión de reglas 14/15/16 días y meses de fases 3/5 |
| 14–16. Contrato próximo, prorrogado, cancelado | `test_contract_extension_and_cancellation_update_same_source`; E2E contrato y enlace a origen |
| 17–20. Capital próximo, parcial, liquidado y ocupación terminada con pendiente | `test_capital_deadline_uses_actual_balance_independently_of_occupation`; `test_finished_occupancy_with_future_restitution_still_requests_internal_review`; E2E capital |
| 21–24. Reporte sin caja, verificado, rechazado y verificación repetida | `test_report_does_not_change_money_verified_link_idempotent_and_void_reactivates`; `test_reject_report_and_reject_wrong_cash_context`; E2E reporte y vínculo real |
| 25. Falta de fecha | `test_missing_due_stays_internal_and_does_not_invent_date` |
| 26. Bolivia | `test_bolivia_business_midnight_is_authoritative`: 03:59:59 y 04:00:00 UTC, antes/después de medianoche en La Paz |
| 27. Hitos 7/3/1 | `test_configured_notice_window`; `test_review_reactivates_at_milestones_and_snooze_does_not_change_due` |
| 28–29. Posponer y revisar sin pagar | Prueba de hitos y E2E atención personal; React comprueba que la solicitud no lleva importe ni llama a caja |
| 30. Recargar sin duplicar | Prueba de consulta viva (cero inserts al consultar) y E2E recarga |
| 31–34. Datos reales, saldo cambiado, actualizar texto, edición | `test_consent_current_text_encoding_open_manual_and_correction`; `test_changed_balance_blocks_old_text_and_new_preparation_uses_current_money`; React/E2E de vista obsoleta y edición |
| 35–37. Normalización, extranjero válido, inválido | `test_international_numbers_and_explicit_bolivia_prefix`; `test_invalid_numbers_cannot_create_click_to_chat` |
| 38–40. Sin aceptación, vigente, revocada | `test_consent_required_revoked_and_replayed_open_cannot_bypass`; E2E aceptación desmarcada y revocación |
| 41–44. Apertura sin envío, confirmación, corrección, sin entrega/lectura | Prueba de comunicación completa; React verifica acciones separadas; E2E intercepta `wa.me`, confirma/corrige y comprueba eventos exactos |
| 45. Persona incorrecta | `test_wrong_same_house_recipient_other_purpose_and_changed_number_are_blocked` |
| 46–47. Ámbito y roles | `test_scope_roles_and_no_impersonation_of_manual_confirmation`; `test_operator_can_report_but_cannot_verify_and_internal_assignment_is_enforced`; E2E operador/propietario |
| 48. Dos usuarios/solicitudes simultáneos | `test_mysql_independent_reminder_actions_are_serialized`, tres carreras reales descritas abajo |
| 49. Idempotencia | Carrera con clave compartida, `test_repeated_report_and_message_requests_keep_single_records`; React reintenta autorización con clave y versión originales después de perder respuesta |
| 50. Separación de obligación y aviso | Consultar/revisar/preparar no agrega movimientos ni `FinanceOperation`; se inspecciona la base y se conserva pendiente |
| 51. Capital separado | Pruebas de capital de fase 6 y regresión de fase 5: ingresos/garantías/anticipos ordinarios permanecen en cero |
| 52–53. 0008 y conservación de 49 tablas | Las tres funciones de `test_migration_6.py`: limpia, poblada y restricciones SQL |
| 54. Regresión 0–5 | Suite backend completa, 42 pruebas React anteriores y 48 recorridos Playwright anteriores, dentro de las cifras definitivas |
| 55. Escritorio/celular | Todos los recorridos en 1440×1000 y 390×844, sin desbordamiento horizontal en las doce vistas capturadas |
| 56. Sin envío automático externo | Ruta Click to Chat interceptada, ausencia de endpoints de envío/fiscales, proveedor limitado a preparar enlaces, ninguna acción de apertura crea estado de entrega/lectura |

Pruebas adicionales: autorización renovada conserva el número histórico; aceptación de otro propósito no habilita mensajes de pagos; cambio de número bloquea preparación anterior; plantilla cambiada requiere nueva preparación; plantilla no puede inventar capital en un alquiler; aplicación/anulación de saldo a favor actualiza el mismo aviso; un ingreso no verifica dos reportes; pago de tercero no se presupone pago del propietario; bloqueo de ventanas y dominio manipulado no registran apertura.

## Concurrencia MySQL

`test_mysql_independent_reminder_actions_are_serialized` usa dos `TestClient`, sesiones/conexiones independientes y una barrera antes del bloqueo de propiedad. No se sustituye el motor por SQLite ni se simula la respuesta del servidor.

| Carrera | Resultado exigido |
| --- | --- |
| Dos acciones con versión inicial y claves diferentes | 200/409; una identidad y una acción, sin obligación adicional |
| Misma solicitud y clave simultáneas | 200/200, resultados iguales; una acción, sin doble registro |
| Dos preparaciones desde la misma versión con claves diferentes | 201/409; una comunicación; nada de caja |

La regresión también ejecuta las carreras previas de contratos, confirmación de distribuciones, aplicaciones, pagos y devoluciones de capital. Las operaciones de recordatorio respetan el mismo orden de bloqueo por propiedad.

## Migraciones e integridad

Las pruebas verifican 14 tablas nuevas, 63 de aplicación más `alembic_version`, FK con RESTRICT, claves compuestas, decimales (14,2), ausencia de saldo/fecha/casa copiados en avisos y número no duplicado en comunicaciones.

La base poblada contiene filas en las **49 tablas anteriores**: personas, usuarios, hashes de contraseña, sesiones, permisos, auditoría, contratos, propietarios, ocupantes, reservas, servicios, medidores, lecturas, recibos, repartos, finanzas y las ocho tablas de capital. La comparación de filas completas se repite tras upgrade 0008, downgrade 0007 y upgrade 0008. No se autoriza automáticamente a ningún contacto.

Se rechazan en MySQL real: claves repetidas, FK inexistentes, dos orígenes en un aviso, partes de capital incompletas, reporte con cuenta y obligación simultáneas, importe negativo, verificación sin movimiento, reutilización del ingreso, posposición sin fecha, estado `delivered` y borrado de consentimiento referenciado por historia. Las reglas de ámbito que requieren varias relaciones se prueban en la API, no se atribuyen a FK simples.

## Capturas

Solo personas, números de ejemplo y registros ficticios del entorno descartable. Cada enlace contiene la misma vista en escritorio o móvil; las capturas no se presentan como prueba de envío de WhatsApp.

| Pantalla | Escritorio | Celular |
| --- | --- | --- |
| Resumen | [Ver](screenshots/phase-6/escritorio-resumen.png) | [Ver](screenshots/phase-6/movil-resumen.png) |
| Vencimientos | [Ver](screenshots/phase-6/escritorio-vencimientos.png) | [Ver](screenshots/phase-6/movil-vencimientos.png) |
| Alquileres | [Ver](screenshots/phase-6/escritorio-alquileres.png) | [Ver](screenshots/phase-6/movil-alquileres.png) |
| Servicios | [Ver](screenshots/phase-6/escritorio-servicios.png) | [Ver](screenshots/phase-6/movil-servicios.png) |
| Propietarios | [Ver](screenshots/phase-6/escritorio-propietarios.png) | [Ver](screenshots/phase-6/movil-propietarios.png) |
| Contratos | [Ver](screenshots/phase-6/escritorio-contratos.png) | [Ver](screenshots/phase-6/movil-contratos.png) |
| Anticréticos | [Ver](screenshots/phase-6/escritorio-anticreticos.png) | [Ver](screenshots/phase-6/movil-anticreticos.png) |
| Pagos reportados | [Ver](screenshots/phase-6/escritorio-pagos-reportados.png) | [Ver](screenshots/phase-6/movil-pagos-reportados.png) |
| Preparar WhatsApp | [Ver](screenshots/phase-6/escritorio-preparar-whatsapp.png) | [Ver](screenshots/phase-6/movil-preparar-whatsapp.png) |
| Comunicaciones | [Ver](screenshots/phase-6/escritorio-historial.png) | [Ver](screenshots/phase-6/movil-historial.png) |
| Preferencias | [Ver](screenshots/phase-6/escritorio-preferencias.png) | [Ver](screenshots/phase-6/movil-preferencias.png) |
| Consentimientos | [Ver](screenshots/phase-6/escritorio-consentimientos.png) | [Ver](screenshots/phase-6/movil-consentimientos.png) |

## Interbloqueo detectado y corregido

El navegador detectó MySQL 1213 al consultar a la vez finanzas, reportes y recordatorios. La lectura crítica `finances.state` bloqueaba cuentas/movimientos antes que la propiedad; las proyecciones de recordatorios comenzaban por la propiedad. Las lecturas de capital también podían comenzar por contratos. Ese orden invertido permitía un ciclo de espera.

Se corrigió únicamente el protocolo de bloqueo: `finances.state` y las entradas de lectura `anticreticos.detail/summary/listing` bloquean primero la propiedad. No cambiaron cálculos, saldos ni reglas monetarias. La prueba nueva `test_mysql_parallel_finance_capital_and_reminder_reads_lock_property_first` ejecuta consultas por conexiones independientes, sincronizadas antes de su primera lectura bloqueante: **antes de la corrección fallaron ambos casos reproduciendo 1213; después aprobaron ambos**. Se amplió la comprobación a seis consultas (finanzas, capital, preferencias, plantillas, consentimientos e historial), todas con propiedad como primer bloqueo. La verificación final volvió a ejecutar estas seis variantes dentro de la misma pasada completa de 441 casos; también aprobaron los 64 recorridos de navegador sobre una base aislada.

## Incidencias de desarrollo y límites de la verificación

Se añadió una comprobación entre propuesta y guardado: renovar el número autorizado o cambiar la plantilla no puede sustituir silenciosamente los datos revisados. Se prueba con cambios concurrentes en SQLite y MySQL.

El primer recorrido E2E de preferencias omitió marcar «Usar esta plantilla personalizada»: el sistema conservó correctamente el texto incorporado. Se corrigió la preparación de la prueba para activar expresamente su plantilla antes de comprobarla.

La barrera usada por las tres pruebas de acciones concurrentes también necesitó limitarse al primer ingreso de cada solicitud: la nueva lectura interna reutiliza legítimamente el bloqueo de propiedad en la misma transacción. El fallo se identificó como `BrokenBarrierError`, se corrigió la instrumentación y se repitió todo el módulo. No se eliminaron las aserciones de unicidad, versiones ni conexiones MySQL independientes.

Durante la construcción se corrigieron expectativas de pruebas: 201 en creaciones, renovación que incluye la sustitución en el evento de nueva aceptación, inspección de rutas a través de OpenAPI en la versión actual de FastAPI y un filtro de seguridad que confundía `distributions` con una palabra fiscal por subcadena. Se mantuvieron los controles del backend. TypeScript detectó una opción de Testing Library que no correspondía a esa API; se corrigió la prueba.

Se conservan avisos de deprecación de Starlette/TestClient y de configuración histórica Alembic (`path_separator`); no son errores de datos ni omisiones de pruebas y no se editaron migraciones para ocultarlos. No se certifica WhatsApp real, autenticidad de comprobantes, auditoría externa de seguridad o evaluación con usuarios mayores. No se usaron datos reales, cuentas de WhatsApp ni proveedores activos. [Límites funcionales](phase-6.md#resultados-evidencias-y-límites).
