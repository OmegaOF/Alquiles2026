# API de fase 5

Prefijo `/api/v1`. Sesión/cookie, comprobación de origen y permisos de las fases anteriores. Todas las rutas se limitan a la casa autorizada y a contratos de modalidad `anticretico`. El backend valida importes y permisos aunque se omitan los controles de React.

Base de un anticrético: `/properties/{property_id}/anticreticos/{contract_id}`. No hay una ruta nueva para crear contratos: se reutilizan `/contracts`, sus acciones e historial de fase 2.

| Método | Ruta relativa | Rol mínimo / resultado |
| --- | --- | --- |
| GET | `/properties/{property_id}/anticreticos` | Cualquier rol con acceso. `{items,summary,today}`; resumen por moneda y fecha de negocio. |
| GET | base | Cualquier rol con acceso. Libro de capital y contrato. |
| POST | base + `/conditions` | Administrador de esa casa. 201; nueva revisión económica. |
| POST | base + `/deliveries` | Administrador u operador asignado. 201; entrega real. |
| POST | base + `/returns` | Administrador de esa casa. 201; restitución real. |
| POST | base + `/adjustments` | Administrador de esa casa. 201; acuerdo no monetario. |
| POST | base + `/movements/{id}/void` | Administrador de esa casa. 200; anulación de capital con comprobación de saldos. |
| POST | base + `/adjustments/{id}/void` | Administrador de esa casa. 200; anulación del acuerdo completo. |

El propietario solo consulta. Administrador general tiene alcance global; administrador de propiedad y operador requieren asignación a la casa.

## Escrituras e idempotencia

Campos comunes: `request_key` de 8–64 caracteres, `expected_version` del capital y `expected_contract_version` contractual. La primera revisión usa versión económica `0`; las siguientes lecturas proporcionan la actual. La versión contractual siempre es positiva. `reason` es opcional en una entrega/devolución, obligatorio con al menos tres caracteres en anulaciones y acuerdos. Modificar condiciones existentes exige motivo y referencia documental.

Una petición idéntica con la misma clave devuelve el resultado histórico y no repite efectivo/auditoría. No regenerar la clave al reintentar tras perder la respuesta. Clave reutilizada con otros datos → 409. Una operación nueva necesita su propia clave y versiones actuales. La repetición idempotente no exime de permisos vigentes.

Importes JSON como cadenas decimales con máximo dos decimales y 14 dígitos totales; positivo en capital/movimientos, no negativo en partes acordadas y firmado no cero en ajustes. La moneda usa tres letras mayúsculas (por ejemplo `BOB`, `USD`, `EUR`) y debe coincidir con la del contrato; no hay conversión ni consulta de un catálogo cambiario. Fechas de negocio `YYYY-MM-DD`, instantes de operación UTC.

## Condiciones

Ejemplo ficticio; sustituir IDs por personas autorizadas de la casa:

```json
{
  "request_key": "ejemplo-condiciones-001",
  "expected_version": 0,
  "expected_contract_version": 1,
  "agreed_capital": "70000.00",
  "expected_delivery_on": "2031-01-01",
  "restitution_on": "2032-02-01",
  "allow_early_return": true,
  "conditions": "Acuerdo particular revisado por las partes; servicios independientes.",
  "document_reference": "Referencia externa ficticia",
  "holders": [
    {"person_id": 20, "beneficiary_person_id": 20, "assigned_amount": "40000.00"},
    {"person_id": 21, "beneficiary_person_id": 21, "assigned_amount": "30000.00"}
  ],
  "responsibles": [
    {"person_id": 10, "assigned_amount": "50000.00"},
    {"person_id": 11, "assigned_amount": "20000.00"}
  ]
}
```

Cada grupo no vacío debe sumar exactamente `agreed_capital`, sin personas repetidas. Se permite guardar grupos/fechas/beneficiarios pendientes, pero el libro devuelve `review_issues` y bloquea dinero hasta completarlos. No se supone reparto entre propietarios ni se crea persona/cuenta automáticamente. Las personas referenciadas se conservan como contactos de la casa.

Las siguientes revisiones pueden incluir `reason`, `notes`, documento y nuevas asignaciones. Una reducción de acuerdo por debajo de lo recibido exige `acknowledge_received_excess: true` con motivo/documento; no modifica saldos reales. No se pueden retirar partes con saldo pendiente sin reasignación previa.

## Entrega y restitución reales

```json
{
  "request_key": "ejemplo-entrega-001",
  "expected_version": 1,
  "expected_contract_version": 1,
  "amount": "20000.00",
  "currency": "BOB",
  "occurred_on": "2031-01-02",
  "method_id": 1,
  "payer_id": 22,
  "beneficiary_person_id": 10,
  "reference": "TRANSFERENCIA-FICTICIA-001",
  "document_reference": "Comprobante externo ficticio",
  "notes": "El aportante real es distinto del titular del derecho.",
  "allocations": [
    {"holder_id": 20, "responsible_id": 10, "amount": "15000.00"},
    {"holder_id": 21, "responsible_id": 11, "amount": "5000.00"}
  ]
}
```

Las partes suman el movimiento una sola vez y son parejas distintas del acuerdo vigente. El pagador y el receptor físicos son independientes de esas asignaciones. En una devolución, cada titular debe autorizar al `beneficiary_person_id`; si hay receptores físicos diferentes se registran movimientos separados. La condición debe permitir devolución anticipada o la fecha real debe alcanzar la restitución pactada.

Entrega no puede superar capital acordado ni las partes pactadas vigentes (considerando reasignaciones). Devolución no puede superar pendiente por pareja; una obligación adicional requiere antes acuerdo distinto y autorizado. La cronología diaria no puede quedar negativa. Para entregar, el contrato debe estar vigente o finalizado; no se recibe capital de un borrador o cancelado.

Resultado de escritura: `operation_id`, `contract_id`, `movement_id`, `version`, `kind`, `capital_received`, `capital_returned`, `capital_pending`, `reason`. Puede repetirse idéntico por idempotencia. Para saldos actuales posteriores a otras operaciones, volver a GET.

La referencia externa se normaliza con trim/mayúsculas; se rechaza otro movimiento válido con la misma casa, método y referencia, tanto en capital como en caja ordinaria. Sin referencia bancaria la protección contra reenvío es la clave idempotente; la aplicación no puede identificar por sí sola dos registros deliberadamente distintos de un pago en efectivo sin referencia.

## Acuerdos de restitución sin dinero

```json
{
  "request_key": "ejemplo-reasignacion-001",
  "expected_version": 4,
  "expected_contract_version": 1,
  "kind": "reassignment",
  "effective_on": "2031-02-01",
  "document_reference": "Acuerdo externo autorizado de reasignación",
  "reason": "Traslado explícito entre responsables; no es un pago",
  "allocations": [
    {"holder_id": 20, "responsible_id": 10, "delta": "-1000.00"},
    {"holder_id": 20, "responsible_id": 11, "delta": "1000.00"}
  ]
}
```

`reassignment` requiere total cero; `settlement`, total negativo; `additional`, total positivo. Todo exige capital efectivamente recibido previamente. Para personas nuevas, primero una revisión de condiciones que las incluya, conservando las partes con saldo. El servidor valida saldos históricos y partes después del cambio. Una línea cero o pareja repetida se rechaza.

Resultado: `operation_id`, `contract_id`, `adjustment_id`, `version`, `capital_pending`, `non_cash_adjustment`, `reason`. No crea `finance_movements`, gasto, interés automático ni pago de servicios.

## Anulaciones

Body: campos comunes de versión/clave y `reason`. Conservan el registro original, agregan referencia a la operación anuladora y excluyen su efecto de saldos. La anulación es del movimiento/acuerdo completo. Si produce capital negativo, partes pendientes retiradas o devoluciones sin cobertura cronológica devuelve 409; corregir primero operaciones dependientes. Una repetición idéntica devuelve el mismo resultado, otra anulación nueva de algo ya anulado devuelve 409.

## Lectura e integración

El libro incluye `contract`, `currency`, `version`, `conditions`, `review_issues`, `state`, las seis cantidades de capital, `received_above_agreed`, `holders`, `responsibles`, `balances` por pareja, `movements`, `adjustments`, `history` de revisiones y `service_obligations` de fases 3/4. Los movimientos y acuerdos anulados siguen en listas con `void_operation_id`. La revisión original de cada movimiento identifica las condiciones de entonces. Los datos actuales de personas se obtienen por sus FK/contactos autorizados.

Estados económicos: `preparation`, `pending_receipt`, `partial_receipt`, `received`, `partial_return`, `returned`, `settled_by_agreement`, `overdue`. `returned` y `settled_by_agreement` distinguen restitución real y liquidación con acuerdos no monetarios. El estado contractual permanece separado. Vencimientos/filtrado son consultas de React usando `today` y fechas devueltas; no disparan mensajes ni trabajos programados.

`GET /properties/{id}/finances` agrega las cantidades de capital separadas por moneda. Los movimientos llevan `kind=capital_received/capital_returned`, `contract_id` y disponible ordinario cero; en movimientos con varios titulares `person_id` puede ser nulo. Nunca usar ese importe como crédito de alquiler o garantía. Las aplicaciones y devoluciones ordinarias no admiten fuentes de capital; anular capital por la ruta ordinaria devuelve 409.

Prórroga/finalización: `POST /contracts/{id}/actions`, esquema y permisos existentes. Cambiar condiciones contractuales de espacio/modalidad/moneda después de registrar términos económicos devuelve 409, con indicación de crear otro contrato. No hay endpoint fiscal, legal, WhatsApp ni de recordatorios.

Errores: 401 sin sesión; 403 rol sin autorización; 404 recurso ajeno/no perteneciente al contrato; 409 versiones obsoletas, duplicación o conflicto económico; 422 datos inválidos, partes/sumas, beneficiario o condición incompleta. React presenta el mensaje específico en español y nunca afirma un pago por una mera vista previa.
