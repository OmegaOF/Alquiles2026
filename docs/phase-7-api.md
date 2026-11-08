# API de fase 7

Prefijo `/api/v1`. Todos los endpoints requieren la sesión existente. Roles y alcance de propiedad se verifican en backend; no existe un permiso concedido por escoger un filtro. Las consultas no escriben movimientos, deudas, consentimientos o exportaciones.

| Método y ruta | Resultado |
| --- | --- |
| GET `/reports/options` | Propiedades, unidades, contratos, propietarios/personas vinculados, tipos de servicio/gasto y fecha boliviana. Solo metadatos autorizados, sin reconstruir ni bloquear el libro. |
| GET `/dashboard` | Proyección económica general, indicadores físicos, atención y siete conjuntos de gráficos. |
| GET `/reports/{kind}` | La misma proyección y filtros con el detalle seleccionado. |
| GET `/reports/{kind}/pdf` | PDF A4/carta de la proyección completa, con verificación opcional de la huella visual. |

`kind`: `economic`, `properties`, `owners`, `units`, `contracts`, `collections`, `services`, `expenses`, `capital`, `comparison`. Las rutas desconocidas no seleccionan modelos ni archivos arbitrarios.

## Filtros comunes

`property_id`, `owner_id`, `unit_id`, `contract_id`, `person_id`, `service_type_id`, `category_id`: identificadores positivos. Propietario delimita casas vinculadas, no una cuota económica personal.

`mode`: daily, weekly, monthly, anticretico, mixed. `currency`: tres letras ASCII mayúsculas, sin conversión. `state`: pending, partial, paid, overdue, adjusted, voided, active, finished, draft, cancelled. Los cuatro últimos califican estado contractual actual; los otros son estados económicos aplicables al hecho (cargo/gasto/capital). El capital distingue su estado económico del estado de ocupación.

`start_date`, `end_date`, `as_of`: YYYY-MM-DD. Alternativa `year` (1900–2200), `month` (1–12, exige año), excluyente con fechas personalizadas. Periodo máximo de diez años, límites inclusivos. Por defecto: primer día del mes boliviano hasta hoy; corte = menor entre fin y hoy. El corte futuro se rechaza.

`page` (desde 1), `page_size` (1–200, predeterminado 50). Totales/series no se calculan solo sobre la página. `paper`: A4 o letter, afecta la presentación PDF. `expected_fingerprint`: SHA-256 hexadecimal de 64 caracteres, especialmente útil para exportar el resultado consultado.

No enviar parámetros con valor nulo como texto `None`/`null`: omitirlos. Campos desconocidos o combinaciones inválidas producen 422 con mensaje comprensible. Una unidad, contrato, persona o propietario fuera del ámbito no se revela mediante identificadores de URL.

## Respuesta JSON

Esquema `ReportResponse`, estricto, sin campos adicionales:

- `kind`, `title`, `filters`, `period` (start/end/as_of/timezone), `properties` autorizadas.
- `summary`: una fila por moneda. **Importes como cadenas decimales exactas**, nunca float JSON. Un valor no calculable, como un recuperable ante pago parcial sin atribución cierta, es null.
- `counts`: indicadores administrativos; null cuando no se certifica su reconstrucción histórica o no se puede dar un total de atención autorizado.
- `series`: meses, moneda, medidas compartidas y `has_data`. Flujos corresponden a cada periodo; estados al cierre propio. Las responsabilidades de recibos se asignan una vez a su fecha de cierre.
- `occupancy`: días de cuartos/propiedades y porcentaje por fechas contractuales de la versión actual, independiente de monedas y con limitación histórica explícita.
- `rows`: detalle paginado por tipo. `movements`: referencias de los movimientos válidos del periodo. Los contratos incluyen subresúmenes, cargos/aplicaciones, capital y partes. Los recibos indican `pending_financial_import` cuando el reparto no se ha incorporado al libro al corte.
- `limitations`, `total_rows`, `has_data`, `page`, `page_size`, `fingerprint`, `generated_at` (UTC).

Las definiciones de **todas las medidas**, sus fuentes y excepciones están en [phase-7.md](phase-7.md). En particular, `cash_received` contiene clases disjuntas; `services_recovered` es aplicación de fondos existentes y no otra entrada. `provider_refund_pending` es crédito aún no devuelto, no ingreso. `capital_agreed` corresponde al contrato completo y las cuotas individuales se conservan en titulares/responsables.

Ejemplo ficticio:

```http
GET /api/v1/reports/collections?property_id=10&start_date=2031-01-01&end_date=2031-02-28&as_of=2031-02-28
```

Un cargo de 500 BOB con aplicación válida de 200 BOB devuelve `total: "500.00"`, `applied: "200.00"`, `pending: "300.00"`. No se suma otro cargo por el mes anterior. Con un corte anterior a la operación, el hecho aún desconocido no se inventa dentro de ese cierre.

## Exportación

```http
GET /api/v1/reports/collections/pdf?property_id=10&start_date=2031-01-01&end_date=2031-02-28&expected_fingerprint=<huella obtenida en JSON>&paper=A4
```

Respuesta `application/pdf`, descarga `mi-casa-{kind}.pdf`, cabecera `X-Report-Fingerprint`. El generador recibe el árbol de datos autorizado ya convertido a valores simples y libera los bloqueos antes de dibujar; no consulta de nuevo para recalcular cifras. Cambios desde la consulta: 409, «Los datos cambiaron después de la consulta. Actualice el reporte antes de descargar el PDF». El frontend envía siempre la huella del resultado que muestra.

La exportación abarca el detalle completo, no solo la página visual, con límite de coste de filas para impedir documentos desproporcionados; 422 pide acotar propiedad/periodo. No hay endpoint de historial de exportaciones porque no se implementa persistencia de reportes ni una tabla de totales.

## Errores y aislamiento

- 401: sesión ausente/expirada.
- 404: recurso no autorizado/no encontrado, sin confirmar datos de otra propiedad.
- 409: huella desactualizada o referencia financiera inconsistente que requiere revisar el origen.
- 422: filtros/rango/corte inválidos o exportación excesiva.

No se interpolan nombres de tablas/rutas desde la petición. El PDF escapa textos y no obtiene recursos externos. No incluye credenciales, sesiones ni documentos/contactos personales innecesarios. Los nombres y fichas administrativas son actuales cuando no hay historia legal/versionada suficiente; los mensajes de límite impiden presentar ese estado como un cierre histórico certificado.
