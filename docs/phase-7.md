# Fase 7 · Resumen general, reportes y PDF

Rama local: `phase-7-dashboard-reportes-pdf`. Base exacta: `967176433c616a5a6378dd44adae00adb03c10c1`, integración de fase 6 en main. [Actions de la base](https://github.com/OmegaOF/Alquiles2026/actions/runs/42502312766): success. No se modifica main, no se publica ni se inicia fase 8.

[Plan y aceptación](phase-7-plan.md) · [Auditoría 3FN](phase-7-normalization.md) · [API](phase-7-api.md) · [Pruebas y evidencias](phase-7-tests.md).

## Qué puede utilizarse

El menú incorpora **Resumen general** y **Reportes**, manteniendo las entradas anteriores, incluida la comprobación del sistema. El acceso inicial a Propiedades se conserva para los usuarios existentes.

- Resumen físico de propiedades registradas/activas, cuartos disponibles/ocupados, contratos activos/próximos a terminar y atención personal de recordatorios.
- Importes por moneda: cargos, cobros, deudas, gastos, desembolsos, servicios, garantías, anticipos, crédito y capital. El resumen destaca las cifras principales; el resto está en «Ver todos los importes separados».
- Diez reportes: económico, propiedades, propietarios, unidades, contratos, cobranzas, servicios, gastos, anticréticos y comparación de propiedades/periodos.
- Siete gráficos ECharts: entradas reales; cargos/aplicaciones/pendiente; gastos/desembolsos; responsabilidades de servicios/recuperaciones/pendiente; ocupación por fechas; capital; evolución de una medida elegida.
- Filtros por propiedad, propietario vinculado, unidad, contrato, responsable, modalidad, servicio, gasto, moneda, fechas, mes/año, estado y corte. Atajos de este mes, mes anterior, últimos tres meses y año.
- PDF de los diez reportes, A4 o carta, con resumen, gráficos vectoriales, detalle, desgloses completos, filtros, corte, advertencias y «Página X de Y». Los gráficos monetarios incluyen cero en su escala para conservar visibles los importes menores. La descarga vuelve a comprobar la huella del reporte consultado.

Los textos principales conservan 18 px, controles grandes, etiquetas y estados en español. Cada gráfico tiene leyenda, descripción, moneda/unidad, estado vacío y tabla textual exacta; la información no depende exclusivamente de color. La instancia ECharts se actualiza y libera al desmontarse. Los filtros anteriores no sustituyen resultados de consultas más recientes.

## Una proyección y una transacción de lectura

`scope_properties` reutiliza la autorización existente. `Facts` obtiene fuentes por lotes dentro del ámbito, bloqueando primero propiedades ordenadas y después filas fuente. No multiplica movimientos con JOIN a copropietarios, ocupantes o aplicaciones. Las FK de MySQL ya indexan las búsquedas principales por identidad/contexto.

`Projection` aplica filtros, vigencia y fecha de corte; utiliza `money_rules.obligation_measure`, `expense_measure` y `capital_pending`, compartidas con los servicios financieros existentes. Dashboard, tablas, series y PDF reciben el mismo resultado autorizado. React y el PDF no vuelven a calcular saldos.

El contador de atención utiliza las reglas reales de fase 6. Sus búsquedas de filas ya bloqueadas reutilizan un contexto de lectura **solo dentro de esa Session**, que se restaura al salir; no es un almacenamiento persistente ni una segunda contabilidad. Si el operador no puede consultar parte de la atención interna, el contador se informa como desconocido, sin publicar una suma parcial como total.

Los selectores consultan únicamente identidades y vínculos. No bloquean ni reconstruyen el historial monetario. Esto corrige el bloqueo de carga inicial observado al acumular muchas propiedades de prueba.

La proyección final es un árbol de valores inmutables: cadenas decimales, fechas y referencias autorizadas. La API libera la transacción de lectura antes de serializar o dibujar el PDF. El PDF conserva esa instantánea; si hubo cambios desde la consulta visual, la huella solicitada produce 409 y pide actualizar.

## Definiciones económicas

Todas las sumas usan Decimal. Los importes de la API y del texto del PDF tienen dos decimales exactos. Las bibliotecas de gráficos convierten valores únicamente a coordenadas de presentación; esas coordenadas no alimentan importes, conciliaciones ni texto monetario. Nunca se suman monedas diferentes ni se convierten tipos de cambio.

| Medida | Fuente y criterio |
| --- | --- |
| Cargos registrados en el periodo | Importe original de `finance_obligations` registrado en la fecha boliviana de su operación, más ajustes registrados durante el periodo. No equivale al periodo de alquiler ni al de consumo. |
| Cargos vigentes/aplicado/pendiente al corte | Original más ajustes conocidos al corte; aplicaciones válidas de dinero existente, considerando anulación del origen, anulación/sustitución de aplicaciones y fechas. Se incluyen cargos antiguos sin generar otra deuda. |
| Cobros y anticipos recibidos | `finance_incoming` con movimiento real válido fechado en el periodo. Aplicar después un anticipo no vuelve a sumar dinero. Los anticipos recibidos son un subconjunto, no otro total añadido. |
| Total de entradas reales | Cobros/anticipos + garantías recibidas + entregas de capital durante el periodo, clases disjuntas. Capital y garantías no son renta ordinaria. Un pago directo al proveedor no es dinero recibido por la administración. |
| Gasto registrado en el periodo | `recorded_on` del importe original, ajustes y eventual anulación en la fecha de su operación. Es distinto del desembolso. |
| Gasto vigente/pagado/pendiente | Importe original más ajustes; desembolsos reales válidos aplicados. Si una corrección reduce el gasto por debajo de lo pagado, el exceso se muestra como devolución pendiente del proveedor, sin fingir que devolvió dinero. |
| Desembolsos propios | Movimientos de `finance_disbursements` no directos durante el periodo. Los pagos directos de terceros se muestran aparte. |
| Salidas propias | Desembolsos propios + devoluciones de fondos + restituciones reales de capital del periodo. Los desgloses no se suman de nuevo. |
| Fondos aplicados a servicios | Aplicaciones válidas a cargos de servicios, en la fecha posterior entre el dinero de origen y la aplicación. Cubrir con garantía/crédito no es una nueva entrada de caja. Pagos directos se separan. |
| Partes de propietario/ocupante | `utility_responsibilities` del reparto confirmado conocido al corte, seleccionado una sola vez por la **fecha final del periodo real del recibo**. Un recibo entre dos meses no se cuenta en ambos. No se recalculan reglas de días. |
| Servicios por recuperar con proveedor pagado | Saldo registrado de servicios al corte para recibos cuyo gasto está pagado. Incluye recibos anteriores al periodo de flujos. Con pago parcial/atribución incierta se informa «Sin información», no cero. No atribuye por porcentajes de propiedad. |
| Capital acordado | Acuerdo versionado conocido al corte de los contratos consultados. Es el importe del contrato completo, sin sumar derechos y obligaciones de una misma persona ni inventar una cuota individual. Las cuotas explícitas de titulares/responsables se muestran aparte. |
| Capital recibido/devuelto/ajustado/pendiente | `anticretico_movements`, asignaciones y ajustes no monetarios válidos; fechas y anulaciones conocidas al corte. Acumulados separados de entregas/restituciones del periodo. Conserva movimientos de titulares anteriores aunque hayan sido sustituidos después de liquidar su saldo. |
| Pagos reportados | Son afirmaciones de fase 6. No entran como ingreso. Su verificación referencia un movimiento ya existente, que se cuenta una sola vez. |

Conciliaciones:

- Cargo vigente = aplicado válido + pendiente. Un ajuste que libera exceso conserva el dinero original como crédito, sin duplicar ingresos.
- Gasto vigente + devolución pendiente del proveedor = desembolsos aplicados + pendiente de pago. Esta igualdad contempla el exceso ya desembolsado; no afirma que haya sido reembolsado.
- Capital pendiente = recibido real + ajustes no monetarios aplicables − restituciones reales. Una reasignación no crea efectivo.
- Entradas/salidas totales son clases disjuntas; garantías, anticipos, recuperaciones y capital son desgloses o medidas de aplicación y no se añaden dos veces.

## Fechas y reconstrucción

Fechas de negocio en America/La_Paz. Marcas de operaciones/auditoría UTC. Inicio y fin son inclusivos; el corte usa el límite exclusivo de medianoche boliviana del día siguiente. No se acepta un corte futuro. Flujos posteriores al corte no se presentan como realizados.

Los estados financieros utilizan hechos **conocidos al corte** y sus fechas aplicables. Un pago con fecha anterior pero registrado después del corte no se inventa como ya conocido entonces. Ajustes sin fecha económica propia usan la fecha boliviana de su operación; movimientos usan `occurred_on`, gastos `recorded_on`, ajustes de capital `effective_on`. Las series conservan flujos con el conocimiento del corte final y reconstruyen estados al cierre propio de cada mes. No se confunden ambas medidas.

No se certifica un estado histórico de inventario, precio contractual, modalidad, disponibilidad o titularidad cuando no existe una vigencia relacional completa. La ficha del contrato y nombres/vínculos administrativos son actuales; sus cargos originales mantienen unidad, responsable y moneda históricos. La ocupación gráfica describe fechas de contratos válidos en su versión actual y usa días de unidades/properties sin superponer una casa completa y sus cuartos. No se presenta como historial de revisiones del sistema. Los indicadores administrativos no reconstruibles se muestran sin información en cortes pasados.

Los filtros monetarios o de gasto no declaran físicamente disponible un cuarto ocupado. La ocupación es una dimensión física independiente de monedas; los filtros de propiedad/unidad/contrato/persona/modalidad determinan su ámbito pertinente.

## Propietarios, unidades y acceso

Una propiedad puede tener varios dueños. El reporte por propietario identifica sus propiedades vinculadas actualmente y muestra los totales de esas casas **sin atribución económica personal**. No multiplica el resumen general al mostrar filas de copropietarios y no aplica `share` como si fuera una instrucción de cobro o pago.

Los cargos de casa completa y fondos sin asignación se mantienen fuera del desglose por cuarto/contrato cuando no hay relación explícita. Pagos con varias aplicaciones se fraccionan únicamente mediante sus aplicaciones registradas; un pago directo puede vincularse al inquilino por el cargo cubierto aunque el gasto del proveedor esté en otra cuenta. Devoluciones de garantía conservan el contrato explícito de la garantía de origen. Las personas propietarias sin usuario siguen siendo válidas.

Roles `general_admin`, `property_admin`, `owner` y `operator` conservan sus alcances existentes. Parámetros de URL no amplían propiedades autorizadas; PDF y selectores aplican los mismos límites en backend. No se exportan contraseñas, sesiones, documentos personales o teléfonos innecesarios.

## Tablas y migraciones

Se conservan las **63 tablas de aplicación** y `alembic_version`. No hay tablas nuevas, columnas de saldos, cachés persistentes, preferencias/exportaciones guardadas ni historial de exportaciones. No se necesita `0009_reports`: generar documentos a petición no requiere una entidad nueva. Las migraciones 0001–0008 permanecen byte por byte intactas.

La [auditoría individual](phase-7-normalization.md) justifica 1FN/2FN/3FN con atributos, candidatas, DF, condiciones de NULL y semántica histórica. No identificó una descomposición necesaria dentro de las DF documentadas; sí distingue limitaciones funcionales/de integridad que no se disfrazan como infracciones de normalización. El inventario proviene de MySQL 8.4.13, no solo del ORM.

## Archivos principales

- `backend/app/api/reports.py`, `schemas/reports.py`.
- `services/report_facts.py`, `report_projection.py`, `reports.py`, `report_pdf.py`, `money_rules.py`.
- Servicios existentes `finances.py`, `anticreticos.py` y `utilities.py`: reutilización de medidas/lecturas dentro de la misma transacción; sin cambios de reglas de cobro.
- `frontend/src/pages/Reports.tsx`, `pages/reports.css`, `components/ReportChart.tsx`, `src/reports.ts`, integración en `App.tsx`.
- `backend/tests/test_reports.py`; pruebas React y Playwright de reportes/gráficos; `scripts/phase7_schema_inventory.py`.
- Dependencias justificadas: ECharts, ReportLab y pypdf solo para verificación PDF. Los formateadores usados durante el desarrollo están fuera del proyecto y no se añaden a sus dependencias.

## Probar desde el navegador del entorno

1. Abrir la aplicación del entorno en el puerto 5173 e iniciar sesión con una cuenta autorizada. No instalar nada en la computadora personal.
2. Pulsar **Resumen general**, seleccionar una propiedad, elegir fechas y **Ver resultados**. Revisar moneda, fecha de corte y «Cómo interpretar estos resultados».
3. Cambiar la moneda de visualización sin sumarlas. Para exportar una sola moneda, aplicar «Moneda de los registros» en Más filtros; el selector de cifras/gráficos solo cambia la vista. Revisar «Ver cifras del gráfico» y elegir una medida de evolución.
4. Abrir **Reportes** y recorrer los diez tipos. En propiedades, usar **Ver contratos de esta propiedad**; en unidades/contratos, expandir periodos, cargos, aplicaciones e importes.
5. Registrar un pago parcial ficticio en el módulo existente, volver a consultar y comprobar el nuevo pendiente. Un pago comunicado sin verificar no debe alterar los ingresos.
6. Pulsar **Exportar PDF**. Si se modificaron los datos desde la consulta, actualizar primero. Revisar moneda, filtros, corte, resumen/desgloses y páginas del documento.
7. Con otra cuenta de alcance limitado, comprobar que otra propiedad no aparece y que su reporte/PDF devuelve denegación.

Capturas y ejemplos ficticios: [screenshots/phase-7](screenshots/phase-7), [pdf/phase-7](pdf/phase-7). Los resultados reales ejecutados y problemas de las iteraciones se consignan en [phase-7-tests.md](phase-7-tests.md).

## Límites

No se generan deudas, pagos ni importaciones al consultar. No hay tipos de cambio, emisión tributaria, IA, envíos externos ni nuevas funciones de fases posteriores. Un reparto confirmado aún sin importar se advierte expresamente; no sustituye el libro financiero.

La API pagina detalles y limita periodos a diez años y exportaciones por coste de filas. Las agregaciones usan lecturas por lotes y memoria del proceso; carteras mucho mayores requieren medir carga e índices antes de ampliar límites. Los PDF no se archivan en una segunda contabilidad: los ejemplos son documentos inmutables ficticios de verificación. Las capturas/pruebas técnicas no sustituyen una evaluación presencial con personas mayores.
