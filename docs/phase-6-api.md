# API · Fase 6

Base: `/api/v1/properties/{property_id}/reminders`. Autenticación mediante la sesión existente, cookies y protección de origen. Todas las rutas verifican el ámbito de la casa en backend. [Reglas y permisos](phase-6.md).

## Consultas

| Método y ruta relativa | Resultado |
| --- | --- |
| `GET ""` | `items`, `today` en Bolivia, `preferences`, `summary` de cantidades por estado de atención |
| `GET ""?kind=rent` | Filtro por tipo dentro de la propiedad; admite los ocho códigos de abajo |
| `GET /notices/{key}` | Detalle vigente, huellas, versión e historial personal de atención |
| `GET /preferences` | Configuración por casa; administradores reciben además usuarios elegibles |
| `GET /templates` | Plantillas por tipo, cuerpo efectivo y campos permitidos |
| `GET /consents` | Aceptaciones actuales o revocadas más recientes por ámbito; propietario solo las propias |
| `GET /consents/{id}/history` | Aceptaciones/renovaciones/revocaciones históricas del mismo ámbito, con actor y UTC |
| `GET /notices/{key}/proposal?recipient_id=N` | Texto propuesto, datos actuales, destinatario, número, consentimiento y `proposal_fingerprint`; no persiste ni devuelve enlace |
| `GET /communications` | Historial autorizado; `?key=debt:20` y `?recipient_id=2` son filtros opcionales. Sin texto ni número completo |
| `GET /communications/{id}` | Texto histórico, número autorizado entonces, estado y eventos; origen actual y marca de cambio |
| `GET /payment-reports` | Reportes, decisiones y estado contrastado con la caja real |

Tipos: `rent`, `service`, `recovery`, `provider`, `expense`, `contract`, `capital`, `report`. Los demás filtros de persona, unidad, prioridad, fecha y estado se aplican en la interfaz sobre la proyección autorizada de esa casa. Ningún filtro concede acceso adicional.

Cada aviso devuelve `key`, `kind`, `purpose`, `property_name`, `target_label`, persona responsable, destinatarios permitidos, `due_on`, días, importe/moneda, periodo, prioridad, `requires_attention`, `resolved`, `source_fingerprint`, `attention_fingerprint`, `notice_id`, `version`, `attention_state` y `origin`. Los importes son cadenas decimales, no números de punto flotante. Los datos particulares —pagado al proveedor, capital recibido/devuelto, reporte— proceden de sus fuentes.

Prioridades: `upcoming`, `today`, `overdue`, `date_missing` (revisión pendiente), `scheduled`, `resolved`. Una restitución futura con ocupación finalizada puede requerir revisión interna, sin declarar adelantado su vencimiento. Atención: `pending`, `reviewed`, `snoozed`, `resolved`, `scheduled`.

Consultar es lectura: no se insertan avisos, obligaciones ni dinero. Un `notice_id` nulo y `version=0` representan una identidad todavía sin acciones.

## Contrato común de escritura

Cada POST requiere `request_key` de 8–64 caracteres. Los campos adicionales se rechazan. Las acciones versionadas requieren `expected_version`; avisos también requieren la huella recibida. El actor se obtiene de la sesión, nunca del cuerpo.

La misma clave con el mismo cuerpo, casa, actor, acción y destino devuelve el resultado original. Reutilizarla con otros datos produce 409. `authorize_open` vuelve a validar el origen y consentimiento incluso cuando se reintenta una clave ya usada; una autorización revocada no puede recuperarse por idempotencia.

Errores habituales: 401 sin sesión; 403 para un rol o destinatario interno no autorizado; 404 para origen/id fuera de la casa; 409 cuando cambió versión/saldo/consentimiento o la operación ya no corresponde; 422 para campos, fechas, números o combinaciones inválidas. Las respuestas de escritura incluyen `operation_id`. Las creaciones de plantillas, consentimientos, mensajes y reportes usan 201; las acciones y preferencias, 200.

## Atención

`POST /notices/{key}/actions`:

```json
{
  "request_key": "clave-unica-de-esta-accion",
  "expected_version": 0,
  "expected_fingerprint": "huella attention_fingerprint de 64 caracteres hexadecimales",
  "action": "reviewed",
  "until_on": null,
  "notes": "Se revisó el saldo y el contrato"
}
```

El ejemplo de huella es explicativo: debe sustituirse por la huella real de la consulta. Acciones: `reviewed`, `snoozed`, `reopened`. Solo `snoozed` requiere `until_on`, futura y dentro del límite configurado. Se compara **attention_fingerprint**, que incorpora hitos y configuración, no solo la huella económica. Resultado: identidad, versión y `money_changed=false`. Un propietario puede registrar únicamente su propia atención.

## Preferencias y plantillas

`POST /preferences`: `request_key`, `expected_version`, `lead_days` (1–20 valores distintos, 0–365), `snooze_days` (1–30), `recipient_user_ids` y `types` (exactamente los ocho tipos, una vez cada uno, con `is_enabled` y `allow_whatsapp`). Las asignaciones internas solo admiten usuarios ya autorizados y activos de esa casa. Lista vacía conserva el acceso ordinario; administradores mantienen supervisión. Por defecto 7,3,1; WhatsApp para reportes desactivado.

`POST /templates`: `request_key`, `expected_version`, `kind`, `name`, `body`, `is_active`. Si no existe plantilla propia o está inactiva se usa la incorporada. Cambiarla bloquea aperturas de mensajes preparados con una versión anterior, conservando sus textos.

Campos de plantilla: `{nombre}`, `{propiedad}`, `{espacio}`, `{concepto}`, `{importe}`, `{moneda}`, `{vencimiento}`, `{periodo}`, `{capital_recibido}`, `{capital_devuelto}`, `{responsable}`. Un campo válido pero ausente en el origen bloquea la propuesta. No se admite acceso a atributos, índices, conversiones ni instrucciones de formato.

## Consentimiento

`POST /consents`:

```json
{
  "request_key": "aceptacion-unica-de-prueba",
  "expected_version": 0,
  "person_id": 2,
  "purpose": "payments",
  "number": "+591 71234567",
  "bolivia_local": false,
  "accepted_on": "2031-01-01",
  "method": "Aceptación expresa documentada",
  "notes": "Referencia de la aceptación",
  "explicitly_accepted": true
}
```

Solo registrar aceptaciones reales obtenidas de la persona; el ejemplo usa datos ficticios y la fecha debe ser no futura en la fecha de negocio actual. Propósitos: `payments`, `contracts`, `capital`, `reports`. El número debe coincidir con el contacto guardado. `bolivia_local=true` ofrece la ayuda explícita 591 para ocho dígitos locales. Resultado: `consent_id`, versión del ámbito. Cada renovación agrega una aceptación, no sobrescribe la anterior.

`POST /consents/{id}/revoke`: `request_key`, `expected_version` actual del ámbito, `reason`. Debe ser su aceptación actual. Se conserva la historia y se bloquean nuevas autorizaciones para esa aceptación.

## Preparar y abrir WhatsApp

1. Obtener la propuesta.
2. `POST /notices/{key}/messages`: `request_key`, `expected_version` del aviso, `expected_fingerprint=source_fingerprint`, `expected_proposal_fingerprint=proposal_fingerprint`, `recipient_id`, `text` editable (opcional para usar el propuesto; 3–5000 caracteres). Devuelve `communication_id`, versión, versión del aviso, `state=prepared`, `sent=false`. La huella de propuesta enlaza origen, aceptación inmutable, destinatario y plantilla: cambiarlos desde la vista previa exige revisarla de nuevo antes de guardar.
3. `POST /communications/{id}/actions` con `action=authorize_open`, `request_key`, `expected_version` de la comunicación. Revalida datos económicos, destinatario, rol, número, consentimiento y plantilla. Devuelve versión nueva, `authorization_operation_id` y URL oficial codificada. No guarda la URL en el resultado persistido de idempotencia ni marca apertura/envío.
4. Tras la apertura solicitada por el usuario, POST a la misma ruta con `action=opened`, la versión de la autorización y su `authorization_operation_id`. No se admite informar una apertura sin esa autorización actual. El frontend reserva la ventana antes de pedir el enlace para detectar bloqueo de ventanas; rechaza todo dominio diferente de `https://wa.me`.
5. Tras una decisión expresa del usuario, POST con `action=manual_sent` o `not_sent`, nueva clave y versión actual. No requiere ni simula evidencia de entrega externa.
6. Para corregir una confirmación/cancelación ya registrada, `correct_sent` o `correct_not_sent` con `notes` de al menos tres caracteres. Se agrega un evento y se conserva el anterior.

Solo quien preparó el mensaje puede abrirlo o confirmar/corregir su envío. No se aceptan estados `received`, `delivered` ni `read`. El enlace nunca envía por sí solo. Tampoco una confirmación manual certifica entrega o lectura. Al cambiar el saldo o revocar el consentimiento, no reutilizar la vista anterior: consultar otra propuesta y preparar una comunicación nueva.

## Pagos reportados y decisiones

`POST /payment-reports` requiere `request_key`, `reporting_person_id`, `concept`, `amount`, `reported_on`, `method_id`, `document_reference`, notas opcionales y una alternativa:

- `obligation_id`: persona responsable y moneda se derivan de esa obligación con saldo; no repetir `person_id/currency`.
- Sin obligación: `person_id` responsable y `currency`; se guarda un contexto de cuenta, no una entrada de caja.

Fecha no futura, importe positivo con hasta dos decimales. Resultado: `report_id`, versión y `confirmed_money=false`. No se crea comprobante fiscal ni movimiento.

`POST /payment-reports/{id}/decisions`: `request_key`, `expected_version`, `action`, `reason`, `movement_id` solamente al verificar.

- `pending`: operador o administrador puede pasar un reporte nuevo a revisión.
- `rejected`: solo administrador, con motivo; no modifica deuda/caja.
- `verified`: solo administrador; enlaza una entrada ordinaria/anticipo existente del mismo contexto e importe/método, con aplicación vigente si corresponde a obligación. No crea otro ingreso.

El movimiento vinculado no se reutiliza para otro reporte. Una verificación invalidada por anulación o pérdida de aplicación vuelve a necesitar revisión; puede rechazarse o enlazarse a un ingreso válido distinto, conservando decisiones anteriores. Un reporte verificado vigente o rechazado no acepta otra decisión ordinaria. Los movimientos de capital/garantía conservan sus propios flujos y no verifican reportes como si fueran renta.

## Concurrencia y conexión externa

Bloqueo por propiedad antes de leer/bloquear fuentes o claves; transacción conjunta de operación, versión e historia. Se mantienen claves únicas por identidad y acción y comprobación de versiones. Los reintentos de interfaz conservan la clave y versión original de la solicitud cuando se pierde una respuesta.

No hay endpoint de envío externo, webhook, tarea programada ni token de WhatsApp. El único proveedor activo prepara una URL oficial. La separación `LinkProvider` permite revisar una integración futura sin activarla en esta fase.
