# Fase 4 — API de importes, pagos y gastos

Prefijo `/api/v1`. Sesión, cookies, validación de origen y alcance por casa de las fases anteriores. JSON con importes decimales como cadenas, fechas `YYYY-MM-DD` y moneda de tres letras mayúsculas. No se emiten documentos comerciales/tributarios ni se integra ningún sistema fiscal.

## Rutas

`P` representa `/properties/{property_id}/finances`.

| Método/ruta | Función |
| --- | --- |
| `GET /finances/catalogs` | Métodos de pago y categorías de gasto. |
| `POST /finances/catalogs/{methods o categories}` | Crear nombre; administrador general. |
| `PATCH /finances/catalogs/{kind}/{id}` | Cambiar nombre/habilitación conservando referencias; administrador general. |
| `GET P` | Obligaciones, gastos, movimientos, aplicaciones, resumen por moneda e historial de esa casa. |
| `POST P/contracts/{id}/preview` | Revisar periodos/importes del alquiler; no genera obligaciones. |
| `POST P/contracts/{id}/generate` | Generar periodos y ajustes autorizados. |
| `POST P/receipts/{id}/import` | Importar responsabilidades de la distribución confirmada vigente y registrar el gasto del proveedor. |
| `POST P/receipts/{id}/expense` | Registrar el gasto del recibo externo antes del reparto, con `expected_version` y `owner_person_id`, sin crear obligaciones de inquilinos. |
| `POST P/receive` | Registrar una entrada real, aplicaciones iniciales y sobrante explícito. |
| `POST P/apply` | Aplicar dinero disponible existente; no genera dinero nuevo. |
| `POST P/guarantees` | Registrar dinero recibido como garantía contractual. |
| `POST P/guarantees/{movement_id}/retain` | Registrar decisión de retención con motivo; administrador. |
| `POST P/expenses` | Registrar gasto sin implicar desembolso. |
| `POST P/expenses/{id}/pay` | Registrar pago real del gasto o pago directo documentado del inquilino al proveedor. |
| `POST P/movements/{id}/refund` | Registrar devolución real de saldo disponible; administrador. |
| `POST P/movements/{id}/void` | Anular un movimiento y sus aplicaciones; administrador. No representa devolución real. |
| `POST P/obligations/{id}/adjust` | Cambiar total exigible/vencimiento con ajuste trazable; administrador. |
| `POST P/expenses/{id}/adjust` | Ajustar total del gasto conservando original y pagos; administrador. |
| `POST P/expenses/{id}/void` | Anular gasto sin pagos válidos; administrador. |
| `POST P/applications/{id}/void` | Anular una aplicación y devolver disponibilidad a su fuente; administrador. |

Altas/generaciones/aplicaciones: 201; consultas, vista previa, correcciones y anulaciones: 200. Errores seguros: 401 sesión, 403 permiso, 404 identificador ajeno/inexistente, 409 repetición incompatible/versión/saldo insuficiente y 422 condiciones/campos inválidos. No hay rutas de eliminación física.

## Operación e idempotencia

Toda mutación económica recibe `request_key`, de 8 a 64 caracteres alfanuméricos, guion o guion bajo; `reason` es opcional en altas ordinarias y obligatorio en operaciones sensibles. La misma clave, acción, casa y cuerpo devuelve el resultado original. Reutilizarla con otro contenido produce 409. El cliente conserva la clave durante reintentos de un mismo formulario.

Se bloquea primero la propiedad, como contratos y servicios. Las comprobaciones de saldos/orígenes utilizan lecturas actuales `FOR UPDATE`. Registro, aplicaciones, ajustes, resultado de operación y auditoría se confirman juntos. La referencia de un movimiento, cuando se indica, se normaliza a mayúsculas y no se admite duplicada para el mismo método/casa entre movimientos válidos. Esa regla entre tablas se verifica bajo el bloqueo; no se atribuye a un índice único SQL inexistente.

`finance_operations.result` conserva la respuesta histórica de la operación, incluido motivo; no contiene contraseñas, hashes de acceso o tokens. La auditoría existente conserva también la solicitud y resultado económicos dentro del ámbito autorizado.

## Generación de alquileres

Ejemplo de cuerpo para vista previa y generación:

```json
{
  "request_key": "generacion_2031_enero_001",
  "expected_version": 1,
  "through": "2031-01-31",
  "weekly_partial_rule": null,
  "last_period_rule": null,
  "due_on": null,
  "accept_context_change": false,
  "reason": null
}
```

`through` limita los **comienzos** de periodos que se desea generar; no recorta un mes a esa fecha para inventar un proporcional. Solo contratos vigentes/finalizados con tarifa ordinaria. No genera capital para anticréticos ni interpreta condiciones mixtas pendientes como alquiler definido.

- Diario: precio × días inclusivos o noches según contrato, limitado por salida efectiva. Un contrato de días 1–3 a Bs 100 produce 300 inclusivo o 200 por noches.
- Semanal: tramos completos de siete días al precio acordado. Para tramo parcial, fase 2 debe permitirlo y esta operación debe aportar `weekly_partial_rule: proportional/full` y motivo que documente el acuerdo. La mera habilitación de estancias parciales no define su precio.
- Mensual: reutiliza `periods()` de fase 2 y sus denominadores reales. `first_period: prorated` usa proporcional; `full` usa precio completo. El último periodo que termina antes de su límite completo exige `last_period_rule: proportional/full` y motivo. Vencimientos mensuales según el contrato; condiciones personalizadas requieren `due_on` explícito.
- Ajustar una obligación existente exige administrador y motivo. Un cambio de responsable/moneda dentro del mismo periodo requiere además `accept_context_change`; se ajusta a cero el contexto anterior, se libera su exceso a sus fuentes y se crea/reutiliza la obligación del nuevo contexto, sin transferir dinero entre titulares/monedas.
- Una salida anticipada puede ajustar a cero periodos posteriores previamente registrados. No los elimina ni borra pagos. Los espacios ya registrados conservan su referencia histórica; no se trasladan silenciosamente al mover un contrato.

La vista previa devuelve `issues`, `periods`, versión y moneda. Si falta una condición económica, la generación responde 422. El redondeo de importes de alquiler es `Decimal`, precisión intermedia 48 y `ROUND_HALF_UP` a centavos, con límite `999999999999.99` por importe persistido.

## Importar servicios

```json
{
  "request_key": "importar_servicio_2031_001",
  "expected_distribution_id": 123,
  "owner_person_id": 10,
  "reason": null
}
```

Se exige el ID de la aprobación vigente, nunca un borrador. Se utilizan los importes de `utility_responsibilities`, el contrato y la elegibilidad congelada; no se recalcula la regla de 15 días. Diario, servicios incluidos y política económica del propietario no producen obligaciones adicionales del ocupante.

Se registra un único gasto lógico del recibo y obligaciones exclusivamente por partes positivas de ocupantes elegibles. Se enlazan responsabilidades importadas con sus obligaciones. La parte del propietario sigue separada; `owner_person_id` designa quién administra el registro del gasto bruto del proveedor, no a quién se le atribuye toda su responsabilidad económica ni participaciones automáticas de copropiedad.

El gasto del proveedor puede registrarse y pagarse antes de confirmar un reparto mediante `/expense`. La importación posterior reutiliza ese gasto y sus pagos: no crea otro gasto ni otra salida de dinero. Antes de importar responsabilidades se muestra que el reparto económico está pendiente.

Reimportar la misma distribución no duplica obligaciones. Para una sustituta se exige administrador y motivo: se ajusta cada contexto persona/espacio/contrato, se conservan los originales y se liberan aplicaciones sobrantes a su fuente. El gasto conserva pagos reales, incluso si queda una devolución pendiente del proveedor. Una moneda distinta del proveedor requiere revisión separada; no se convierte automáticamente. Una aprobación nueva pendiente de importar se advierte en Recuperación de servicios.

## Entrada real y aplicaciones

```json
{
  "request_key": "pago_recibido_2031_001",
  "person_id": 20,
  "payer_id": 21,
  "beneficiary_person_id": 10,
  "amount": "600.00",
  "currency": "BOB",
  "occurred_on": "2031-02-01",
  "method_id": 1,
  "applications": [{"obligation_id": 40, "amount": "500.00"}],
  "surplus": "credit",
  "reference": "TRANSFERENCIA-EXTERNA-001",
  "document_reference": "Referencia del comprobante externo"
}
```

`person_id` es titular de obligación/saldo; `payer_id` es quien efectivamente entrega el dinero. No necesitan coincidir. Destinatario puede identificarse por persona y/o `beneficiary_label`. Se admiten notas y referencia externa. Los métodos son configurables.

Se registra **una** entrada de 600 y una aplicación de 500; quedan 100 disponibles. `surplus` admite `reject`, `credit`, `advance`; si sobra dinero debe elegirse expresamente crédito/anticipo. No hay aplicación automática por antigüedad o concepto.

Aplicación posterior:

```json
{
  "request_key": "aplicar_saldo_2031_001",
  "applications": [
    {"source_movement_id": 50, "obligation_id": 41, "amount": "100.00"}
  ],
  "authorize_guarantee": false,
  "reason": "Aplicación acordada"
}
```

Puede incluir varias fuentes/obligaciones compatibles. Se valida disponibilidad de cada fuente y saldo de cada obligación después de cada aplicación, evitando duplicados en el cuerpo. Dinero y obligación deben tener el mismo titular, casa y moneda. No se implementa transferencia de saldos entre contextos.

## Garantías, devoluciones y gastos

Garantía: datos de dinero real, `person_id`, `contract_id`, `conditions`. La moneda debe coincidir con el contrato. Su saldo es independiente del anticipo y del ingreso ordinario. Aplicarla exige administrador, motivo y `authorize_guarantee: true`; solo para obligaciones del mismo contrato/titular. Recibirla no genera renta ni capital anticrético.

Devolución: datos de dinero efectivamente entregado, motivo y `beneficiary_person_id` igual al titular. No supera saldo disponible y no se ejecuta otra vez con la misma clave. Un reembolso se registra una vez, separado de gastos ordinarios. Los pagos directos al proveedor con exceso quedan pendientes de devolución externa, sin inventar una salida del propietario.

Gasto manual: `person_id`, `unit_id` opcional, `category_id`, `currency`, `amount`, `description`, `recorded_on`, vencimiento/notas/referencia opcionales. No crea movimiento de dinero.

Pago del gasto: datos reales de importe, fecha, pagador, método, destinatario y comprobante. Admite parcialidades hasta el saldo del gasto. Para `is_direct: true`, exige gasto proveniente de recibo, comprobante externo y `applications` cuya suma sea el pago; cada obligación debe ser del mismo recibo y del pagador responsable. Ese movimiento satisface al proveedor y obligaciones del inquilino **sin entrada ni salida en caja del propietario**.

## Ajustes y anulaciones

Ajuste de obligación/gasto: `request_key`, `new_total`, `reason` y, para obligación, `new_due_on` opcional. El original no se altera. Reducir una obligación cubierta anula sus aplicaciones sobrantes y, si corresponde, conserva la parte menor en una aplicación sucesora mediante `replaces_id`. El dinero original permanece igual. Un exceso de garantía vuelve a la garantía; un exceso de anticipo/pago recibido vuelve al saldo de esa fuente. La cadena conserva el origen para distinguir crédito aplicado de pago inicial.

Anulación: `request_key` y motivo. No borra el importe original. Un pago con aplicaciones revierte todas; si ya tiene devoluciones válidas, primero deben corregirse estas. Anular un gasto requiere corregir primero sus pagos. Otra anulación con nueva clave se rechaza; con la misma solicitud devuelve el resultado original. Para corregir 800 a 600 se anula el pago erróneo y se registra el pago correcto; el historial conserva ambos.

## Resumen y permisos

Los totales se calculan desde las mismas filas válidas que sus detalles. Se separan importe exigible, deuda pendiente, entradas ordinarias/anticipos, garantías, disponibilidad, gastos brutos, pagos al proveedor, devoluciones y pagos directos. La recuperación de servicios es cobertura por dinero ya recibido, incluida garantía autorizada, sin afirmar otra entrada de caja. Las devoluciones se muestran aparte de la entrada original; no se presentan como gastos ordinarios.

El resumen agrupa por moneda, sin suma BOB+USD. Es una vista sencilla del módulo, no el dashboard/reportes avanzados de fase 7.

General y administrador de casa: gestión dentro de su alcance. Operador: registros ordinarios y generación inicial, sin anulaciones, ajustes sensibles, uso/devolución de garantía ni devoluciones de saldos. Propietario: consulta. Todos los IDs de cuerpo/ruta se cotejan contra la casa autorizada en backend. La referencia de un comprobante es texto: no se implementó almacenamiento de archivos ni integración con proveedores externos.
