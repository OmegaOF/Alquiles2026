# Fase 3: servicios básicos, recibos y distribución

API `/api/v1`, sesión HttpOnly y alcance por propiedad de las fases anteriores. Se registran recibos existentes emitidos por proveedores y responsabilidades económicas. No hay emisión de documentos comerciales o tributarios, impuestos, pagos efectivos, deudas ni movimientos de caja.

## Operaciones

| Método y ruta | Uso |
| --- | --- |
| `GET /utility-types` | Catálogo: Electricidad, Agua, Internet, Gas, Recolección de basura y Otros servicios, más tipos configurados. |
| `POST /utility-types`, `PATCH /utility-types/{id}` | Registrar/activar/desactivar tipos, solo administrador general. |
| `GET /service-accounts?property_id=…` | Suministros autorizados y última configuración. |
| `POST /properties/{id}/service-accounts` | Registrar cuenta de proveedor y primera configuración de reparto. |
| `PATCH /service-accounts/{id}` | Editar datos permitidos o activar/desactivar sin borrar historia. |
| `GET /service-accounts/{id}/configurations` | Configuraciones anteriores, inmutables. |
| `POST /service-accounts/{id}/configurations` | Nueva configuración, con `expected_version` del suministro. |
| `GET /service-accounts/{id}/meters`, `POST /service-accounts/{id}/meters` | Consultar/registrar medidores físicos, incluidos reemplazos. |
| `POST /utility-meters/{id}/retire` | Registrar retiro con fecha, versión y motivo. |
| `GET /utility-meters/{id}/readings`, `POST /utility-meters/{id}/readings` | Consultar/registrar lecturas y diferencias de consumo. |
| `PATCH /meter-readings/{id}` | Corregir lectura con versión, motivo e historial. |
| `GET /utility-receipts?property_id=…` | Recibos externos de las casas autorizadas. |
| `POST /service-accounts/{id}/receipts` | Registrar datos de un recibo recibido; no implica pago. |
| `GET /utility-receipts/{id}`, `PATCH /utility-receipts/{id}` | Consultar o crear revisión corregida del recibo. |
| `POST /utility-receipts/{id}/calculate` | Proponer reparto sobre una revisión/configuración concretas. |
| `GET /utility-receipts/{id}/history` | Revisiones e importes anteriores y todas las distribuciones. |
| `GET /utility-distributions/{id}` | Detalle, personas, importes, condiciones y evidencia congelada. |
| `POST /utility-distributions/{id}/resolve` | Revisar manualmente propuesta y documentar motivo. |
| `POST /utility-distributions/{id}/confirm` | Aprobar y sustituir atómicamente el reparto vigente, si corresponde. |

Registro/cálculo devuelve 201; consulta, edición, revisión y confirmación, 200. Los recursos no se eliminan por API. Errores: 401 sesión, 403 operación no permitida, 404 recurso inexistente/fuera del ámbito, 409 duplicado/conflicto/versión antigua, 422 campos o reparto inválidos. Las respuestas no muestran SQL ni credenciales.

## Suministro y configuración

Ejemplo ilustrativo; los identificadores deben existir y estar autorizados:

```json
{
  "type_id": 1,
  "label": "Electricidad compartida",
  "provider": "Empresa proveedora",
  "account_number": "SUM-001",
  "measurement_kind": "shared",
  "measure_unit": "kWh",
  "start_date": "2026-01-01",
  "configuration": {
    "method": "equal",
    "unit_ids": [11, 12],
    "economic_policy": "occupant",
    "owner_person_id": 3,
    "provider_payer_id": 3,
    "reimbursement_person_id": 3
  }
}
```

Una cuenta pertenece a una casa. Permite varios suministros del mismo tipo. `measurement_kind` distingue individual/compartido; individual admite como máximo un cuarto o la casa completa. `measure_unit` es opcional en un servicio fijo y obligatorio antes de registrar medidores. No se copia en cada medidor.

`unit_ids` indica cuartos participantes; una lista vacía representa casa completa. Las configuraciones anteriores se conservan y una distribución apunta a la elegida, no a “la que exista hoy”. Cambiar el reparto crea otra revisión. En una cuenta con historial se conservan proveedor, número de suministro, tipo y unidad de medida; los cambios de identidad requieren registrar otra cuenta. Se pueden editar nombre/observaciones y activar/desactivar. Un servicio inactivo conserva consulta y correcciones históricas, pero no admite nuevas altas de recibos/medidores/configuraciones hasta activarlo.

Métodos:

- `equal`: partes iguales por espacio participante.
- `percentage`: `percentages: [{"unit_id":11,"percentage":"30"},{"unit_id":12,"percentage":"70"}]`; un porcentaje por cuarto y suma exacta de 100. Un único espacio de casa completa representa el 100%.
- `occupants`: pesos por **personas-día**, contando responsable y adicionales, dentro del periodo. Contratos sucesivos se consideran históricamente. Si la composición del contrato cambió sin fechas individuales suficientes se exige revisión. Sin ocupantes, se reparte la base por igual para el responsable del propietario.
- `readings`: pesos por consumo individual del periodo; `fixed_amount` del recibo se reparte por igual y la diferencia según consumos. Si no hay evidencias suficientes o el consumo individual supera al registrado por el proveedor se exige revisión. Con un único espacio corresponde el 100% sin inventar consumos individuales.
- `manual`: importes por espacio en el cálculo y motivo escrito; después se aplican igualmente las condiciones y la regla de los 15 días.

`economic_policy: owner` deja todo a cargo del propietario/responsable pactado. `occupant` aplica condiciones de cada contrato, sin gastos adicionales para diario ni servicios incluidos. `owner_person_id` es una elección explícita; no se infiere desde porcentajes de copropiedad. Si falta y existe una parte del propietario, el reparto requiere revisión.

`provider_payer_id` y `reimbursement_person_id` designan **personas previstas**, no prueban que exista un pago o recuperación. Son independientes del responsable del gasto. Pueden quedar pendientes mientras se registran los datos. Los pagos efectivos corresponden a una fase posterior.

## Medidores y lecturas

Alta de medidor: `serial`, `unit_id` opcional para principal de la casa, `installed_on`, `initial_value` opcional y notas. `replaces_id` identifica un medidor del mismo suministro/espacio: el anterior se retira en esa fecha y el nuevo conserva su propia serie de valores, que puede comenzar en cero. No se borran lecturas. No se admiten medidores incompatibles del mismo espacio en fechas coincidentes salvo el límite explícito de reemplazo.

Lectura: `{"recorded_on":"2031-01-30","value":"150.250000","notes":"Cierre del periodo"}`. Cantidad no negativa, hasta seis decimales, una lectura por medidor/fecha, dentro de su vigencia y compatible con las anteriores/posteriores. La diferencia desde la anterior se calcula, no se almacena repetida. Corregir requiere `expected_version` y `reason`; los repartos confirmados conservan los valores que utilizaron.

Para un reparto por lecturas se utilizan la apertura de la **fecha inicial** y el cierre de la **fecha final** del recibo. Los papeles de apertura/cierre se explicitan al utilizarlas; no se interpolan fechas ni se inventan valores faltantes. Si hubo reemplazo se suman los segmentos con lecturas de límite del medidor viejo y del nuevo. Un periodo de un solo día no puede distinguir dos valores con este registro diario: exige revisión manual. Los servicios sin medidor no tienen esta dependencia.

## Recibo externo y revisión

```json
{
  "external_reference": "REC-2026-10",
  "amount": "300.00",
  "currency": "BOB",
  "issued_on": "2026-10-31",
  "period_start": "2026-10-01",
  "period_end": "2026-10-30",
  "due_on": "2026-11-10",
  "consumption": "250.000000",
  "fixed_amount": "0.00",
  "document_reference": "Referencia del comprobante recibido"
}
```

Importe positivo `DECIMAL(14,2)`, cantidades `DECIMAL(18,6)`, moneda de tres letras mayúsculas. `fixed_amount` está incluido en el total y no puede superarlo. Periodo inclusivo, fechas de 1900 a 2199 y límite de pago no anterior a emisión. No se presupone mes de 30 días ni relación con el calendario del alquiler. La referencia externa se normaliza a mayúsculas; no es una numeración generada por el sistema.

Por suministro, se rechazan la misma referencia externa o el mismo periodo de otra revisión **actual** de recibo. La comprobación se serializa por casa y utiliza lecturas actuales de recibos/revisiones. No se afirma que exista una restricción SQL de unicidad entre columnas situadas en tablas distintas. Referencias nulas siguen protegidas por periodo. Las revisiones históricas no impiden registrar legítimamente un periodo liberado al corregir una fecha equivocada.

`PATCH` recibe los datos completos, `expected_version` y un `reason` de al menos tres caracteres. Crea una revisión inmutable adicional, conserva la anterior y deja obsoletas las propuestas de revisiones antiguas. Si había aprobación, conserva el último reparto aprobado hasta confirmar su sustituto y presenta la corrección pendiente.

## Cálculo y revisión

```json
{
  "expected_version": 1,
  "configuration_id": 30,
  "request_key": "solicitud_unica_2026_10"
}
```

`configuration_id` es opcional; por defecto se usa la última. `request_key` permite repetir la misma operación sin crear otra distribución; si se omite se genera uno. Se comprueba primero el ámbito del recibo. Una operación nueva con una versión antigua se rechaza. Si ya hay un aprobado, un nuevo cálculo exige `adjustment: true` y un motivo; no lo sobrescribe.

Para manual se añaden `manual_amounts: [{"unit_id":11,"amount":"100.00"},{"unit_id":12,"amount":"200.00"}]` y `reason`. Deben incluir exactamente los espacios y sumar el recibo; de lo contrario se presenta una propuesta que requiere revisión, sin confirmar importes incorrectos.

Orden del cálculo:

1. Recibo/revisión → configuración → espacios participantes → base por espacio.
2. Contratos vigentes o finalizados, no borradores/cancelados, hasta `actual_end_date` si existe. Se recortan ambos extremos al periodo del recibo.
3. Diario, servicios incluidos o política de propietario: cero gasto adicional del ocupante, sea cual sea la duración.
4. Otros contratos: menos de 15 días, `base × días / días reales`; desde 15, base completa. El responsable predeterminado es el contractual, no todos los ocupantes indistintamente.
5. Vacíos, servicios incluidos y diferencias proporcionales corresponden al responsable explícito del propietario.
6. Si varios contratos superan la base, se conservan sus importes teóricos, su propuesta adicional queda en cero y la distribución requiere revisión; no se asigna automáticamente un exceso.
7. Verificar suma exacta y presentar resumen. Una casa completa se agrupa en un único espacio; mezcla de casa/cuarto en un periodo exige revisión y no duplica el importe.

Centavos: `Decimal`, precisión de cálculo 48; piso a dos decimales y residuos por restos mayores. Empates por orden estable de espacios y contratos/propietario. El segundo nivel también conserva exactamente la base de cada espacio. La evidencia identifica beneficiarios de residuos, días, condiciones, contratos, versiones y lecturas utilizadas. Los importes se devuelven como cadenas. La interfaz presenta centavos con enteros exactos, sin cálculos monetarios `float`.

Revisión manual: `expected_version`, `expected_receipt_version`, `reason`, importes por `allocation_id` opcionales y `responsibilities` con espacio, persona, `kind: owner/occupant`, importe y `contract_id` obligatorio para ocupante. Se admiten varios responsables explícitos por contrato cuando corresponda; el total del contrato no puede superar el máximo que permiten sus días/condiciones sobre la base revisada. Se puede reducir la propuesta con justificación, nunca agregar servicios a diario/incluidos ni trasladar un servicio del propietario al ocupante. Personas y contratos deben pertenecer al contexto autorizado del cálculo.

## Confirmación e historial

Confirmar: `{"expected_version":1,"expected_receipt_version":2}`. Solo administradores de la casa y solo propuesta calculada/revisada. Se comprueba otra vez suma por espacio, personas, revisión actual del recibo, suministro y **conjunto completo de contratos del periodo**, incluso contratos nuevos aparecidos después del cálculo. Se detectan cambios de lecturas/medidores y versiones. Si cambió una fuente, se exige recalcular.

Las escrituras bloquean primero la propiedad, como la fase 2; las comprobaciones críticas usan `FOR UPDATE`, sin depender de snapshots antiguos de MySQL REPEATABLE READ. Aprobación, sustitución y auditoría se guardan en una sola transacción. `utility_current_distributions` tiene una PK por recibo y una distribución única, evitando dos aprobaciones vigentes. El anterior pasa a sustituido, conservando importes/evidencia y aprobación original.

Estados de pantalla: Borrador (recibo sin propuesta), Calculado, Requiere revisión, Confirmado, Sustituido. Una revisión corregida puede requerir cálculo aunque conserve una aprobación anterior. Ni registrar ni confirmar equivale a pagar al proveedor o recuperar un importe.

## Permisos y límites

General: todo. Administrador de propiedades: gestión/confirmación en casas asignadas. Operador: registra, consulta y calcula propuestas; no confirma ni resuelve, no corrige un recibo que ya tuvo aprobación ni lecturas históricas mediante la operación de corrección. Propietario: consulta en sus casas. Cambiar IDs ajenos devuelve 404/403, sin datos privados.

Las personas previstas y responsables se vinculan a la casa para conservar consulta histórica, aunque cambie su titular actual. La cuenta de un antiguo propietario no recibe acceso por figurar en un reparto: conserva las reglas actuales de permisos de fase 1.

No se ofrecen eliminaciones, emisión comercial/tributaria ni pagos. No se interpolan lecturas, no hay calendario avanzado de cambio de habitantes con vigencia individual, no se convierten monedas y no se garantiza la regla de solapamiento frente a escrituras SQL manuales ajenas a los servicios de la aplicación.
