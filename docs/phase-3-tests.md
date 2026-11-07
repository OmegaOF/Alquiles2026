# Fase 3 — Registro de pruebas

Ejecución real del 7 de noviembre de 2026, rama `phase-3-utilities-billing`, sobre MySQL 8.4 descartable, Python 3.12, Node 24 y Chromium del sistema. No se usaron datos reales.

## Resultado definitivo

| Comprobación | Resultado |
| --- | --- |
| Backend completo, SQLite y MySQL real | **221 aprobadas**, 49 avisos, ninguna omisión; 127,35 s |
| Casos nuevos de servicios | 77 incluidos en el total, con casos financieros repetidos en SQLite/MySQL y tres carreras solo en MySQL |
| Migración `0005_utilities` | 3 pruebas nuevas incluidas: base limpia, datos anteriores y restricciones SQL |
| Regresión backend anterior | 141 incluidas y aprobadas |
| Alembic `upgrade head` y `check` | Correctos; “No new upgrade operations detected” |
| React/Vitest | **28 aprobadas** en 6 archivos, incluidas 7 nuevas |
| TypeScript `tsc --noEmit` y Vite | Correctos, 48 módulos compilados |
| Playwright completo | **28 aprobadas**, ninguna omisión; 33,4 s |
| Navegador: distribución | 14 recorridos por perfil de pantalla: escritorio 1440×1000 y móvil 390×844; locale es-BO y zona America/La_Paz |
| Regresión navegador anterior | 22 incluidas y aprobadas, más 6 nuevas de servicios |
| Capturas | 14 PNG de suministros, lecturas, medidores, reparto, revisión, confirmación e historial |

Registros de las últimas ejecuciones completas: [backend, React, Alembic y build](verification/phase-3-check.txt) y [Playwright](verification/phase-3-browser.txt). No se cuentan como aprobados casos no ejecutados.

## Matriz de los 34 criterios solicitados

Los nombres abreviados siguientes corresponden a funciones de `backend/tests/test_utilities.py`, salvo indicación expresa. El mismo caso puede cubrir varios criterios; esta tabla no suma pruebas adicionales.

| Nº | Caso | Evidencia automatizada y resultado |
| --- | --- | --- |
| 1 | Recibo de agua individual | `test_individual_water_and_fixed_service_without_meter`: aprobado |
| 2 | Electricidad compartida | `test_required_300_example_two_rooms_14_and_15` y navegador: aprobado |
| 3 | Servicio sin medidor | `test_individual_water_and_fixed_service_without_meter`: aprobado |
| 4 | Lecturas válidas/inválidas | `test_meter_readings_distribution_fixed_and_variable`, reemplazo y recorrido de lecturas: aprobado |
| 5 | Partes iguales | `test_equal_distribution_fifteen_day_threshold`: aprobado |
| 6 | Porcentajes | `test_percentages_and_configuration_history`: aprobado; validación de suma e historial |
| 7 | Ocupantes | `test_occupants_use_explicit_person_days`: aprobado |
| 8 | Lecturas | `test_meter_readings_distribution_fixed_and_variable`: aprobado; bases 90/210 |
| 9 | Manual | `test_manual_base_allocation`, resolución y navegador: aprobado |
| 10 | 14 días | Umbral parametrizado y ejemplo Bs 300: aprobado |
| 11 | 15 días | Umbral parametrizado y ejemplo Bs 300: aprobado |
| 12 | 16 días | Umbral parametrizado: aprobado |
| 13 | Periodo de 28 días | `test_real_period_days`: aprobado |
| 14 | Periodo de 29 días | `test_real_period_days`, febrero bisiesto: aprobado |
| 15 | Periodo de 30 días | `test_real_period_days`: aprobado |
| 16 | Periodo de 31 días | `test_real_period_days`: aprobado |
| 17 | Diario de 20 días | `test_daily_long_and_included_contracts`: aprobado, ocupante cero |
| 18 | Semanal/mensual con servicios incluidos | `test_daily_long_and_included_contracts`: aprobado, incluye también anticrético con servicios incluidos |
| 19 | Cuarto vacío | `test_owner_service_and_vacancy_never_becomes_tenant_responsibility`: aprobado |
| 20 | Ocupación parcial y resto al propietario | Ejemplo 70/80/150 y periodos reales: aprobado |
| 21 | Sucesivos sin exceso | `test_successive_contracts_theoretical_and_review`, caso 10+10 días: aprobado |
| 22 | Sucesivos con exceso | Mismo caso parametrizado, 15+15 días: aprobado |
| 23 | Revisión obligatoria | `test_manual_resolution_audited_and_daily_cannot_be_charged`, lecturas faltantes, cambios históricos de personas y navegador: aprobado |
| 24 | Casa completa sin duplicar cuartos | `test_whole_house_is_a_single_space`: aprobado |
| 25 | Total igual al recibo | Aserciones de bases/responsabilidades en cálculos y revisión manual: aprobado |
| 26 | Redondeo | `test_cent_rounding_is_deterministic_and_exact`, 0,03 → 0,02+0,01, y React con importe máximo: aprobado |
| 27 | Recibo sin aprobación | `test_edit_unconfirmed_receipt_and_duplicates`: aprobado |
| 28 | Corrección con historia | `test_receipt_corrections_and_approved_history` y navegador: aprobado |
| 29 | Recalcular sin sobrescribir aprobado | Mismo caso: rechazado sin ajuste explícito; aprobado con historial |
| 30 | Dos confirmaciones simultáneas | `test_mysql_concurrent_confirmation_has_one_current`: un 200, un 409 y una referencia vigente |
| 31 | Alcance de permisos | `test_utility_permission_scope`, operador, propietario ajeno y regresión de usuarios: aprobado |
| 32 | Conservación de datos/migraciones | `test_migration_3.py`: comparación completa de 13 tablas anteriores, subida/bajada/subida: aprobado |
| 33 | Regresión fases 0–2 | Suites completas anteriores: 141 backend, 21 React y 22 navegador aprobadas |
| 34 | Escritorio/móvil | 28 recorridos Playwright y 14 capturas: aprobado |

Casos adicionales ejecutados: reemplazo físico y reinicio de lectura, lectura faltante sin inventar consumo, finalización anticipada de 14 días, cambio histórico de personas y reparto entre dos personas de un contrato, copropietarios sin reparto automático por participación, prohibición de superar el proporcional manual, contrato nuevo después de calcular que invalida confirmación, operación diaria no asignable manualmente y política económica del propietario.

Otras carreras MySQL: dos registros del mismo recibo producen 201/409 y una fila lógica; dos cálculos con el mismo `request_key` producen 201/201 y la misma distribución. No se extrapola esto a una prueba de carga.

## Bases y migraciones verificadas

Se crearon dos contenedores independientes, `alquiles-phase3-test` (puerto 3311) y `alquiles-migration3-test` (3312), ambos MySQL 8.4. Bases `alquiles_phase3_test` y `alquiles_migration3_test`, terminadas en `_test`; contraseñas aleatorias fuera de Git. No se iniciaron ni alteraron contenedores anteriores para ejecutar pruebas destructivas.

La primera base se usó para integración/regresión y después para datos ficticios del navegador. La segunda se usó secuencialmente para migraciones:

1. Base limpia → `0005_utilities`: 25 tablas de aplicación y seis tipos iniciales.
2. Base en `0004_tenancy` con datos en sus 13 tablas → `0005_utilities`.
3. Comparación de filas completas, incluidos personas, titulares, usuarios, hashes, sesiones, accesos, auditoría, contratos, ocupantes, firmantes, reservas y contactos.
4. `0005_utilities → 0004_tenancy → 0005_utilities`, preservando todas las filas anteriores.
5. Comprobación de columnas normalizadas, precisión monetaria, FK, PK/únicos de referencia vigente y rechazo SQL de lecturas negativas/huérfanas/duplicadas y suministro repetido.

Las migraciones anteriores se comparan con `d0334b8`; no se editaron para hacer pasar las pruebas. La estrategia de recuperación sobre una base que deba conservarse está en [phase-3.md](phase-3.md#migración-y-recuperación).

## Comandos para repetir

Preparar dos bases descartables con nombres terminados en `_test`. Configurar de forma segura `DATABASE_URL`, `PHASE1_TEST_DATABASE_URL`, `PHASE11_MIGRATION_DATABASE_URL`, `PHASE2_MIGRATION_DATABASE_URL` y `PHASE3_MIGRATION_DATABASE_URL`. Las tres últimas pueden apuntar a la misma base solo si se ejecutan secuencialmente. Nunca usar datos que deban conservarse: los fixtures borran/recrean tablas.

Desde la raíz:

```bash
bash scripts/check.sh
```

Equivale a Alembic `upgrade head`, `pytest -q` con integración real activada, Alembic `check`, Vitest y TypeScript/Vite. Si faltan variables específicas, algunas pruebas se omiten; se debe revisar el resumen. La ejecución documentada tuvo todas configuradas y no tuvo omisiones.

Después de terminar los fixtures destructivos, migrar la base del navegador, crear el administrador temporal por `app.bootstrap --password-stdin` o su modo interactivo, iniciar backend/frontend y configurar `E2E_USERNAME`/`E2E_PASSWORD` fuera de Git. El catálogo se crea por migración; los E2E nuevos también se aseguran de que exista Electricidad si la base se vació mediante fixtures.

```bash
cd frontend
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
CAPTURE_PHASE3_SCREENSHOTS=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e -- utilities.spec.ts
```

No ejecutar fixtures destructivos a la vez que las pruebas de navegador contra la misma base. Las pruebas crean datos ficticios y requieren una base aislada del uso habitual.

## Incidencias encontradas y corregidas

- Una primera aplicación de la migración nueva detectó que la generación automática había omitido la importación del tipo MySQL `MEDIUMTEXT`. Se corrigió en **0005, aún no publicada**, se reconstruyó únicamente la base nueva descartable y se ejecutaron las pruebas limpias/pobladas completas. No se modificaron migraciones anteriores ni se ocultó la aplicación parcial.
- Las relaciones de reemplazo/historial con FK `RESTRICT` detectaron dos errores de limpieza de fixtures SQLite. Se ajustó solo su desmontaje para desactivar FK durante `drop_all`, restaurándolas antes de crear/usar las tablas de cada prueba. La integridad permanece activada durante los casos y las FK de aplicación conservan `RESTRICT`. La suite completa posterior pasó.
- La revisión formal de 3FN detectó columnas propuestas derivadas por contrato en el detalle por persona. Se eliminaron antes de finalizar 0005 y se adaptaron respuestas/pruebas; la comprobación MySQL exige las cinco columnas finales de `utility_responsibilities`.
- La primera ejecución de los seis recorridos nuevos tuvo cuatro aprobados y dos fallos de selector en el alta de suministro. Se cambió el localizador de “Tipo de servicio” al rol accesible `combobox`, sin alterar la funcionalidad para ocultar un error. Se repitió el caso y luego la suite completa: 28 aprobados.
- Se revisó el formato monetario para evitar aproximaciones en la interfaz, incluso con el máximo importe admitido y entradas de notación científica. Los siete casos React nuevos y TypeScript pasan.

Los 49 avisos finales del backend corresponden al cliente de pruebas de Starlette/httpx y a la configuración heredada `prepend_sys_path` de Alembic, no a casos fallidos. No se añadieron dependencias para silenciarlos.

## Límites de la verificación

No hubo pruebas con datos reales, navegadores físicos de personas mayores, servicios externos, carga masiva ni certificación completa de accesibilidad/seguridad. No hay procesos fiscales o pagos que probar. La revisión manual funcional de capturas y los recorridos automatizados permiten validar las pantallas entregadas, sin atribuirles esas certificaciones.
