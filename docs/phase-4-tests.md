# Fase 4 — Pruebas y evidencias

7 de noviembre de 2026. Rama local `phase-4-payments-finances`, base `8b5e3d1`. Python 3.12, Node 24, MySQL 8.4 y Chromium del sistema. Exclusivamente datos ficticios en bases nuevas descartables.

## Ejecución definitiva

| Comprobación | Resultado |
| --- | --- |
| Backend completo | **276 aprobadas**, ninguna omisión, 58 avisos; 291,89 s |
| Casos nuevos de finanzas | 52 incluidos: periodos, integración SQLite/MySQL y tres carreras en MySQL |
| Migración nueva | 3 incluidos, con base limpia, 25 tablas pobladas y restricciones SQL |
| Regresión backend 0–3 | 221 incluidas y aprobadas |
| Alembic `upgrade head` y `check` | Correctos; sin operaciones pendientes |
| React | **34 aprobadas**, incluidas 6 nuevas |
| TypeScript y producción | `tsc --noEmit` y Vite correctos; 51 módulos |
| Navegador | **38 aprobados**, ninguna omisión; 28 anteriores y 10 financieros nuevos en escritorio/móvil |

Evidencias de las últimas ejecuciones: [backend, React, Alembic y compilación](verification/phase-4-check.txt), [navegador](verification/phase-4-browser.txt). Los avisos son de deprecación del cliente Starlette/httpx y de configuración heredada de Alembic; no se cuentan como fallos ni se añadieron dependencias para ocultarlos.

Los diez recorridos financieros y las 34 pruebas React/compilación se repitieron tras la última aclaración visual, con resultado correcto. [Registro de los diez recorridos y capturas definitivas](verification/phase-4-financial-browser.txt). No se suman estas repeticiones como casos únicos adicionales.

## Los 46 criterios solicitados

Los nombres abreviados son funciones de `backend/tests/test_finances.py`, salvo indicación. Una prueba puede cubrir varias filas; esta matriz no aumenta el número de casos ejecutados.

| Nº | Caso | Evidencia |
| --- | --- | --- |
| 1 | Diario inclusivo | `test_contract_price_rules`: 3×100 = 300 |
| 2 | Diario por noches | Mismo parametrizado: 2×100 = 200 |
| 3 | Semanas completas | Mismo parametrizado: 14 días, 200 |
| 4 | Parcial semanal acordado | Mismo parametrizado: 10 días, 142,86; sin regla se rechaza en `test_generation_idempotence_and_missing_conditions` |
| 5 | Mensual aniversario | `test_contract_price_rules`, periodo 10 enero–9 febrero |
| 6 | Mensual calendario | Mismo parametrizado y generación integrada |
| 7 | Primer periodo proporcional | `test_contract_price_rules`, valor contractual real `prorated` |
| 8 | 28/29/30/31 días | `test_real_month_proportional`, 14 días de base 150 |
| 9 | Un periodo no duplica obligación | `test_generation_idempotence_and_missing_conditions` |
| 10 | Servicios confirmados | `test_provider_payment_and_recovery_are_separate`, sustitución y navegador 70+150 |
| 11 | Diario sin extra | `test_services_exemptions_and_owner_part`, diario 20 días; regresión fase 3 |
| 12 | Servicios incluidos | Mismo parametrizado mensual/anticrético y regresión semanal fase 3 |
| 13 | Propietario no se vuelve deudor inquilino | Mismo caso y ejemplo real navegador con parte del propietario 80 |
| 14 | Pago completo | `test_surplus_explicit_and_no_overapplication`, aplicación 500 |
| 15 | Pago parcial | `test_partial_multiple_payments_advance_and_void` y navegador |
| 16 | Un pago, varios conceptos | Mismo caso: alquiler y servicio separados |
| 17 | Varios pagos, una obligación | Mismo caso: 200 + 300 al alquiler |
| 18 | Sobrante explícito | `test_surplus_explicit_and_no_overapplication`, 600 recibidos/500 aplicados/100 disponibles |
| 19 | No superar saldos | Mismo caso y carreras; 409/422 sin movimiento parcial persistido |
| 20 | Anticipo sin nueva entrada | Mismo caso y navegador: aplicación posterior mantiene dinero recibido |
| 21 | Recibir/devolver garantía | `test_guarantee_apply_refund_and_duplicate` |
| 22 | Aplicar parte de garantía | Mismo caso, autorización explícita y mismo contrato |
| 23 | Devolución de garantía duplicada | Mismo caso: repetición devuelve original; operación nueva sin saldo se rechaza |
| 24 | Gasto no pagado | `test_expense_and_partial_disbursements` y navegador |
| 25 | Gasto y desembolso posterior | Mismo caso, dos hechos separados |
| 26 | Parcialidades de gasto | Mismo caso: 100 + 150 para gasto 250 |
| 27 | Pago al proveedor | `test_provider_payment_and_recovery_are_separate`; también antes del reparto |
| 28 | Recuperación posterior de servicio | Mismo caso y navegador con 220 recibidos después de pagar 300 |
| 29 | No contar movimiento dos veces | Casos de anticipo/garantía/pago directo, referencia y misma solicitud |
| 30 | Anular restaura saldos | `test_partial_multiple_payments_advance_and_void` |
| 31 | Corregir sin borrar | `test_payment_correction_retains_original_and_avoids_duplicate_reference`: 800 anulado/600 válido |
| 32 | Distribución sustituta | `test_substituted_distribution_adjusts_without_changing_payment` |
| 33 | Respetar fuentes ya aplicadas | Mismo caso; `test_reduce_paid_obligation_releases_credit_without_new_cash`; garantía vuelve a garantía |
| 34 | Doble clic/reenvío | Repetición de clave en pagos/devoluciones; React conserva clave al reintentar |
| 35 | Cobros simultáneos | `test_mysql_independent_concurrent_money[receive]`: 201/409 contra saldo 500 con dos pagos 400 |
| 36 | Devoluciones simultáneas | Mismo parametrizado `refund`: 201/409 y saldo de garantía 100 |
| 37 | Permisos entre casas | `test_currency_owner_scope_and_operator_limits`, propietario de solo consulta y regresión de IDOR |
| 38 | Monedas separadas | Mismo caso rechaza USD→BOB; React muestra dos resúmenes independientes |
| 39 | Contrato finalizado conserva finanzas | `test_early_finish_and_changed_contract_preserve_finance_history`: original/pago 500 conservados, exigible 225,81, disponible 274,19 |
| 40 | Normalización/relaciones | Inspección MySQL en `test_migration_4.py`, FK, únicos, precisión y columnas no duplicadas; prueba formal en informe |
| 41 | Migración limpia | `test_clean_mysql_finance_migration`: 41 tablas y catálogos |
| 42 | Migración con datos de 0005 | `test_populated_upgrade_downgrade_preserves_25_previous_tables`, comparación completa ida/vuelta/ida |
| 43 | Regresión fases previas | 221 backend, 28 React y 28 recorridos de navegador incluidos |
| 44 | Pantallas escritorio/móvil | Cinco recorridos financieros por cada tamaño, más regresión completa |
| 45 | Ausencia de procesos fiscales | `test_no_tax_routes_or_anticretic_capital` y revisión de rutas, modelos, interfaz y dependencias nuevas |
| 46 | Capital anticrético excluido | Mismo caso rechaza generación ordinaria desde modalidad sin tarifa; solo servicios/garantía diferenciada |

Casos adicionales: pago directo documentado al proveedor sin caja del propietario; gasto/pago del recibo **antes de confirmar reparto**, reutilizado después sin duplicación; referencias externas duplicadas; reintento con igual clave; anulación de aplicaciones; liberación de cobertura a su misma fuente; historial de correcciones de aplicaciones mediante `replaces_id`.

Las tres carreras usan dos `TestClient`/sesiones/conexiones independientes, sincronizados antes de bloquear la propiedad. No se sustituyeron bloqueos por mocks de saldos. En el tercer caso dos reenvíos idénticos obtienen 201/201, el mismo resultado y una sola entrada. Esto no se extrapola a certificación de carga.

## Bases de prueba y conservación

Se crearon **`alquiles-phase4-test`**, puerto 3313, base `alquiles_phase4_test`, y **`alquiles-migration4-test`**, puerto 3314, base `alquiles_migration4_test`. Son MySQL 8.4 nuevos con contraseñas aleatorias fuera del repositorio. Los contenedores previos y bases reales no se usaron para operaciones destructivas.

La base principal sirve para integración y, **después** de los fixtures destructivos, para el navegador con una cuenta temporal. La segunda sirve secuencialmente para migraciones de todas las fases. Cada URL destructiva exige nombre terminado en `_test`.

La prueba poblada coloca registros en cada una de las 25 tablas anteriores, incluyendo nombres y contactos, propietarios, usuarios/hashes, permisos, sesiones, auditoría, contratos/ocupantes/firmantes/reservas, catálogo/suministros, medidores/lecturas, configuraciones, recibos, revisiones, distribución confirmada/asignaciones/responsabilidades/referencia vigente. Todas sus filas deben coincidir antes/después de `0006`, descenso a `0005` y nueva subida a `0006`.

La comprobación SQL rechaza contextos duplicados, FK huérfanas, movimientos negativos, aplicaciones huérfanas y obligaciones sin origen. Los saldos agregados y exclusividad de subtipos son invariantes de los servicios transaccionales, no restricciones SQL entre tablas que se pretendan inexistentes.

## Repetir las comprobaciones

Preparar bases aisladas descartables; configurar de forma segura `DATABASE_URL`, `PHASE1_TEST_DATABASE_URL`, `PHASE11_MIGRATION_DATABASE_URL`, `PHASE2_MIGRATION_DATABASE_URL`, `PHASE3_MIGRATION_DATABASE_URL` y `PHASE4_MIGRATION_DATABASE_URL`. Las cuatro últimas pueden compartir una base si las suites se ejecutan secuencialmente.

```bash
# Desde la raíz, con todas las variables de pruebas configuradas:
bash scripts/check.sh
```

El script ejecuta Alembic `upgrade head`, pytest con MySQL habilitado, Alembic `check`, Vitest y TypeScript/Vite. Si falta una URL específica puede haber omisiones; la ejecución definitiva documentada no tuvo ninguna. No apuntar los fixtures a una base que deba conservarse.

Después de los fixtures: preparar catálogos y administrador temporal, iniciar backend y React, configurar `E2E_USERNAME` y `E2E_PASSWORD` fuera de Git:

```bash
cd frontend
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
CAPTURE_PHASE4_SCREENSHOTS=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e -- finances.spec.ts
```

Los recorridos usan 1440×1000 y 390×844, locale es-BO y zona America/La_Paz. Crean sus propias casas, personas, contratos y movimientos ficticios. Los catálogos iniciales se generan por migración; si un fixture los vació, se restauran en la base de navegador. Nunca ejecutar fixtures destructivos mientras el navegador utiliza esa misma base.

## Incidencias y correcciones

- Se alineó el primer periodo mensual con el valor existente `prorated`; no se introdujo otra modalidad en fase 2. Las pruebas usan ese valor real.
- Una importación faltante del fixture `home` causó errores de preparación iniciales. Se corrigió y se repitieron las suites.
- El caso de finalización anticipada inicialmente llamaba una ruta/campo que no existe. Se corrigió la prueba para usar `/contracts/{id}/actions`, acción `finish` y `end_date`; no se alteró la API anterior para acomodar la prueba.
- TypeScript detectó un cierre JSX faltante y opciones de localizador propias de Playwright usadas en pruebas React. Se corrigieron; compilación y todas las pruebas React pasan.
- La revisión de aplicaciones reducidas añadió `replaces_id`, conservando su linaje para que un pago inicial corregido no se clasifique incorrectamente como crédito aplicado.
- La revisión del flujo proveedor/reparto detectó la necesidad de pagar un recibo antes de confirmar responsabilidades. Se añadió el registro independiente y pruebas específicas que comprueban ausencia de deudas prematuras y reutilización del gasto.
- Se revisó manualmente el resultado de autogeneración de Alembic: importación de `MEDIUMTEXT`, orden de dependencias, catálogos y descenso sin eliminar índices necesarios antes de las tablas. Solo se editó la migración nueva aún no publicada.
- Se inspeccionaron capturas reales y se compactó la navegación del módulo a dos columnas en móvil, manteniendo texto/botones grandes.

## Capturas y límites

Las capturas se enlazan desde el informe y se guardan en `docs/screenshots/phase-4-*`. Se inspeccionaron visualmente muestras de escritorio/móvil, además de los recorridos y comprobación de desbordamiento horizontal.

No se realizaron pruebas con producción, bancos/proveedores externos, subida de archivos, navegadores físicos de personas mayores, carga masiva ni certificaciones integrales de seguridad/accesibilidad. Las devoluciones reales de proveedores externos y los traslados de saldo entre contextos no se entregan como automatizados: las cantidades pendientes se distinguen sin inventar efectivo.
