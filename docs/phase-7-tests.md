# Verificación de fase 7

Estado de cierre: **verificación integral terminada el 8 de noviembre de 2026**. Las ejecuciones definitivas incluyen la corrección de escala del PDF. El [manifiesto](phase-7-verification/manifest.json) registra comandos, fechas, resultados y SHA-256 de los 159 archivos de código, configuración, dependencias y pruebas, sin cambios durante estas ejecuciones. Los cambios posteriores son documentación/evidencias y metadatos Git que clasifican los PDF como binarios para preservar sus bytes.

## Recuperación

Se conservó la rama `phase-7-dashboard-reportes-pdf`, HEAD base `967176433c616a5a6378dd44adae00adb03c10c1`, con todo el código local de dashboard, reportes, PDF, pruebas y auditoría. Las huellas recuperadas coinciden con 81 archivos Python y 63 archivos de frontend de las ejecuciones anteriores. No se reconstruyó ni descartó la implementación.

La sesión previa había terminado una ejecución completa con 531 backend, 65 React y 78 Playwright aprobadas. Su backend registró 22 min 21 s, cero fallos/errores/omisiones. Se recuperaron 24 capturas y siete PDF con datos ficticios. Faltaba este informe y reunir la evidencia final en el repositorio; no faltaban módulos de aplicación.

Como pidió la continuación, se repitieron backend completo, React, TypeScript, build y todo Playwright. Los procesos de aplicación anteriores habían quedado detenidos; un primer intento de navegador produjo ECONNREFUSED en los puertos 8000/5173. Se restablecieron los servicios, se verificó `/api/v1/ready` con MySQL y el HTML de React antes de repetir. Este intento fallido de preparación no se cuenta como aprobado ni provocó cambios de lógica/pruebas para ocultarlo. Se conservaron los datos ficticios de la base E2E; las pruebas de migración sí reconstruyen expresamente sus bases descartables limpias y pobladas.

## Resultados definitivos

| Comprobación | Resultado ejecutado | Evidencia |
| --- | --- | --- |
| Backend completo, una sola invocación | **531 aprobadas**, 0 fallos, 0 errores, 0 omitidas; pytest 23 min 9 s | [Salida completa](phase-7-verification/backend.txt), [JUnit](phase-7-verification/backend.xml) |
| Regresión y reportes | 441 casos anteriores + 90 de fase 7, incluidos en las 531: 43 SQLite, 43 MySQL y 4 de calendario nuevos | [Desglose por módulo y casos](phase-7-verification/manifest.json) |
| Migraciones MySQL | 23 casos aprobados de esquema limpio, datos representativos, restricciones, recuperación y conservación histórica | JUnit y módulos `test_migration_11`, `test_migration_2`–`test_migration_6` |
| React | **65 aprobadas**, 11 archivos | [Salida](phase-7-verification/react.txt) |
| TypeScript | `tsc --noEmit`, código de salida 0 | [Salida sin errores](phase-7-verification/typescript.txt), estado explícito en manifiesto |
| Compilación | `tsc --noEmit && vite build`, código de salida 0 | [Salida](phase-7-verification/build.txt) |
| Playwright completo | **78 aprobadas**, 39 escritorio + 39 móvil, sin reintentos; 12 min 23 s | [Salida con los 78 casos](phase-7-verification/playwright.txt) |
| Alembic y esquema | `0008_reminders (head)`, `alembic check` sin operaciones nuevas; 63 tablas, 153 FK, 0 diferencias en atributos/restricciones | [Alembic](phase-7-verification/alembic.txt), [contraste del esquema](phase-7-verification/schema-recheck.json) |
| PDF | 7 archivos leídos, todas las páginas numeradas en A4; **476 pares exactos etiqueta/importe/moneda** coinciden con los reportes autenticados y sus huellas | [Comprobación](phase-7-verification/pdf-verification.json), [ejemplos](pdf/phase-7) |
| Capturas | 24 PNG: 12 a 1440×1000 y 12 a 390×844 | [Capturas](screenshots/phase-7), dimensiones y SHA-256 en comprobación PDF |

El backend definitivo se ejecutó de 20:48:19 a 21:11:47 UTC, con 23 min 28 s de proceso completo. Playwright se ejecutó de 20:48:19 a 21:00:42 UTC. React, TypeScript y build también se repitieron después de la corrección; no se reutilizaron sus resultados previos como cierre. La versión exacta de cada herramienta está en [runtime.json](phase-7-verification/runtime.json).

Se observaron **77 advertencias**, sin suprimirlas: una de Starlette por el uso heredado de httpx en TestClient y 76 de Alembic por `path_separator` ausente en su configuración histórica. No se añadieron dependencias ni cambios ajenos a fase 7 para esconderlas.

## Matriz de aceptación y evidencia

| Solicitud | Casos/fuentes de comprobación |
| --- | --- |
| Normalización 1–12 | Auditoría individual de 63 relaciones con R, candidatas y DF; inventario de MySQL 8.4.13; `test_63_table_inventory_candidates_constraints_models_and_migrations_intact`; migraciones históricas limpias/pobladas/up/down. Cero tablas nuevas, cero migraciones 0001–0008 editadas. |
| Finanzas 13–32 | Pago completo/parcial, mora, ajuste/liberación de exceso, anulación, anticipos/crédito y garantías: `test_finances.py`, `test_reports.py`. Gastos registrados/parciales/pagados y crédito frente al proveedor, recuperación parcial/completa y pago directo: conciliaciones de reportes y regresión financiera. Capital/ajustes sin dinero: `test_anticreticos.py` y reportes. Pago comunicado no es ingreso: prueba específica y `test_reminders.py`. |
| Agrupaciones 33–44 | Propiedades/unidades/contratos; copropietarios y ocupantes múltiples; aplicaciones múltiples; monedas BOB/USD; totales sin multiplicar JOIN. Reporte por propietario sin cuota personal inventada. Casa completa no se atribuye a cuartos. Pruebas de anticrético con múltiples titulares y asignaciones conservadas. |
| Fechas 45–60 | Meses 28/29/30/31, años, rangos y vencimientos de fases anteriores; periodos reales de factura y reglas 14/15/16 días verificadas también en reportes. Diario de más de 15 días sin servicios adicionales. Corte inclusivo boliviano; anulación posterior al corte; operación aún desconocida al corte; contexto original de cargo tras cambiar unidad; titulares anteriores; factura entre dos meses contada una sola vez; recuperaciones pendientes de facturas anteriores al periodo. |
| Interfaz y PDF 61–78 | Mismos resúmenes y huella entre dashboard/reporte/PDF; todos los tipos PDF; BOB/USD sin suma; filtros y cambio consecutivo; ECharts actualiza/libera instancia; estados vacíos/error/reintento. Tabla larga A4/carta con cabeceras repetidas y todas las páginas numeradas. Descarga protegida y denegación de otro ámbito; teclado; escritorio 1440×1000, móvil 390×844, sin desbordamiento. Lectura de ejemplos con pypdf y revisión visual. |
| Regresión 79–90 | Suite completa de fases 0–6 y fase 7. Permisos owner/property_admin/operator y administrador general. Concurrencia MySQL de las fases anteriores y lectura de reporte simultánea con pago desde conexiones reales en Playwright. Consentimiento/apertura manual/confirmación WhatsApp permanecen en su módulo; no se activan mensajes externos automáticos. |

Estas agrupaciones no afirman que una prueba de claves demuestre 3FN ni que una captura certifique accesibilidad con personas mayores. La demostración conceptual está en [phase-7-normalization.md](phase-7-normalization.md).

## Conciliaciones específicas preservadas

- Cargo de 500, aplicación de 200, pendiente de 300, idénticos en JSON/dashboard/PDF.
- Dos copropietarios/ocupantes y varias aplicaciones no duplican cobros o saldos.
- Garantía y anticipo permanecen separados de renta; aplicar fondos ya recibidos no crea otra entrada.
- Un gasto de 300 pagado por 100 conserva pendiente de 200; reducirlo a 50 produce devolución pendiente de proveedor de 50, sin fingir un ingreso o una devolución efectuada.
- Servicio pagado directamente por inquilino aparece en su filtro, aun cuando el gasto esté a nombre del propietario. El pago completo del recibo y la parte filtrada se distinguen.
- Un proveedor parcialmente pagado no produce un cero ficticio de recuperable: el resultado incierto es null/«Sin información».
- Entrega de capital en enero y devolución en febrero se separan de los flujos y saldos acumulados; ajuste no monetario no genera efectivo.
- Titulares sustituidos después de restituir su capital mantienen sus movimientos en el reporte por persona.
- Un reporte informado pendiente de verificar no aumenta dinero recibido.
- Un cambio posterior invalida la huella de PDF y devuelve 409, conservando la consulta original para actualizarla.
- Consultar los diez reportes y PDF no modifica ninguna de las 63 tablas de aplicación.

## Problemas de iteración, corregidos y conservados

La implementación original corrigió el filtro de pago directo por responsable, devolución explícita de garantía en el contrato, estado económico del capital frente a ocupación y conservación de titulares anteriores. El análisis también corrigió el doble conteo de responsabilidad de un recibo entre meses y la diferencia entre flujos del periodo y recuperaciones antiguas pendientes al corte. Estas correcciones siguen presentes y sus casos forman parte de la ejecución definitiva completa.

Se corrigió la carga de selectores: no deben bloquear/reconstruir el libro. El contador reutiliza únicamente filas ya bloqueadas en la misma Session, sin una caché de saldos persistida. La lectura financiera libera bloqueos antes de dibujar el PDF.

Durante la revisión visual del cierre se encontró que ReportLab elegía el importe mínimo como origen de algunos ejes. Por ejemplo, con cargos/aplicaciones/pendiente de 500/200/300, la barra de 200 quedaba oculta. Se configuró la escala para incluir cero, conservando también los valores negativos si existen. El caso de conciliación ahora inspecciona la escala calculada después de dibujar el PDF y comprueba que la aplicación de 200 tenga altura positiva. Se ejecutó en SQLite y MySQL: dos casos aprobados, y ambos volvieron a aprobar dentro de la suite completa. Las repeticiones integrales que estaban en curso se interrumpieron expresamente para incorporar la corrección; no se presentan como aprobadas. El cierre repitió todas las suites sobre el código corregido y regeneró los PDF.

Los escenarios nuevos respetan las validaciones existentes: firmantes explícitos de contratos pasados, vencimiento del recibo no anterior a emisión, condiciones del anticrético y versión de recibo al confirmar. Se acotó el selector Playwright al encabezado de resultados cuando un gráfico comparte el título «Servicios básicos». No se eliminaron validaciones ni se debilitaron las pruebas históricas. Algunas ejecuciones preliminares se interrumpieron para incorporar comprobaciones; el cierre exige una nueva ejecución completa, no la suma de parciales.

## Reproducción

Usar Python 3.11+ (verificado con 3.12.14), Node 24 y MySQL 8.4 descartable. Backend y E2E deben usar bases distintas. Guardar variables fuera de Git; nunca copiar contraseñas de prueba a los informes.

1. Instalar con `bash scripts/install.sh`.
2. Configurar `DATABASE_URL`, `PHASE1_TEST_DATABASE_URL`, `PHASE11_MIGRATION_DATABASE_URL` y `PHASE2_MIGRATION_DATABASE_URL` hasta `PHASE6_MIGRATION_DATABASE_URL` con bases `_test`. Las suites de migración pueden compartir una base solo si se ejecutan secuencialmente. `RUN_MYSQL_TESTS=1` habilita la comprobación de conexión real.
3. Ejecutar desde la raíz: `.venv/bin/pytest -q backend/tests --junitxml=/tmp/phase7-backend.xml`. No omitir MySQL ni migraciones y presentar las omisiones como aprobadas.
4. Ejecutar `npm --prefix frontend test`, `frontend/node_modules/.bin/tsc --noEmit -p frontend/tsconfig.json` y `npm --prefix frontend run build`.
5. Migrar una base E2E separada con `alembic upgrade head`, crear su cuenta mediante `app.bootstrap --password-stdin` y configurar `E2E_USERNAME/E2E_PASSWORD` de forma privada.
6. Iniciar FastAPI y React, comprobar `/api/v1/ready` y la página del puerto 5173. Ejecutar desde frontend `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e -- --reporter=line`. Se ejecutan ambos proyectos; no limitarse al caso nuevo o al móvil aislado.
7. Ejecutar `alembic check` e inventario de esquema sobre la base descartable restaurada. Revisar PDF con pypdf, huellas, pares etiqueta/importe/moneda y capturas de escritorio/móvil.

## Concurrencia, PDF y normalización

Los 15 casos MySQL de concurrencia de dinero, capital y recordatorios aprobaron usando conexiones independientes y están enumerados en el manifiesto. La regresión de bloqueo toma primero la propiedad y evita el interbloqueo entre movimientos y lectura de avisos. Playwright ejecutó además una lectura de reporte simultánea con un pago real en MySQL, en escritorio y móvil, exigiendo una instantánea conciliada.

Los diez tipos de PDF se generaron en las pruebas de backend; las tablas largas se verificaron tanto en A4 como en carta, con cabeceras repetidas y numeración en todas las páginas. Los siete ejemplos guardados se compararon con GET autenticados de sus reportes usando exactamente los filtros originales. El corte efectivo por defecto no se convierte en un filtro explícito distinto: la huella identifica también los filtros. Coincidieron las siete huellas y los 476 pares de resumen. Se revisaron visualmente páginas de resumen y gráficos del PDF y capturas de escritorio/móvil; esta revisión detectó y confirmó la corrección de escala descrita arriba.

Las 63 relaciones tienen análisis individual de atributos, candidatas, DF y 1FN/2FN/3FN. No se encontraron descomposiciones necesarias bajo esa semántica; se conservan cero tablas nuevas y cero migraciones nuevas. Las 0001–0008 son idénticas a la base. Esta conclusión conceptual no se deduce de que las pruebas aprueben: las pruebas contrastan esquema, relaciones e historial y complementan el [análisis de dependencias](phase-7-normalization.md).

## Credenciales y estado de entrega

El `.env` local está ignorado y no se incluye en Git. El escaneo abarca fuentes, documentación, registros y binarios, comparando también valores privados configurados sin imprimirlos. Las coincidencias revisadas en `.env.example` y `.github/workflows/checks.yml` son los valores públicos heredados para MySQL de desarrollo/CI; ambos archivos permanecen intactos. Las credenciales privadas aleatorias de las bases descartables no se incorporan. [Resultado y alcance del escaneo](phase-7-verification/security.json).

No quedan fallos de pruebas pendientes. Se confirmaron las funcionalidades anteriores mediante los 441 casos de regresión del backend y los 64 de navegador heredados, además de React. Se conservan las limitaciones documentadas de titularidad/inventario histórico, atribución incierta de recuperaciones parciales y evaluación presencial de facilidad de uso. No se presenta una prueba técnica como certificación legal o estudio con usuarios. No se publicó la rama, no se modificó main ni se inició fase 8.
