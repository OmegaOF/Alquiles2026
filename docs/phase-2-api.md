# Fase 2: operaciones y reglas de la API

Base `/api/v1`. Se utiliza la sesión HttpOnly de las fases anteriores. `/docs` permite consultar los esquemas Pydantic. Todos los identificadores se comprueban en el servidor dentro del ámbito autorizado; cambiar el identificador no permite acceder a otra casa.

## Operaciones

| Método y ruta | Operación |
| --- | --- |
| `GET /contracts?property_id=…` | Listar contratos autorizados; filtro de casa opcional. |
| `POST /contracts` | Crear borrador o contrato vigente. |
| `GET /contracts/{id}` | Detalle, personas, firmantes y conteos contractuales. |
| `PATCH /contracts/{id}` | Modificar términos/personas/fechas de borrador o vigente. |
| `POST /contracts/{id}/actions` | Activar, finalizar, cancelar o prorrogar. |
| `GET /contracts/{id}/history` | Eventos anteriores y posteriores del contrato. |
| `GET /reservations?property_id=…` | Listar reservas autorizadas, incluyendo estado efectivo. |
| `POST /reservations` | Reservar una casa completa o un cuarto. |
| `GET /reservations/{id}` | Consultar una reserva. |
| `PATCH /reservations/{id}` | Modificar una reserva pendiente o confirmada no vencida. |
| `POST /reservations/{id}/actions` | Confirmar, cancelar o registrar el vencimiento. |
| `POST /reservations/{id}/convert` | Convertir reserva confirmada en contrato vigente. |
| `GET /reservations/{id}/history` | Historial de la reserva. |
| `GET /properties/{id}/availability?start=…&end=…` | Estado y motivos de casa completa y cada unidad. Sin fechas: hoy en Bolivia. |
| `GET /properties/{id}/occupancy` | Contratos vigentes/finalizados, personas e historial; indicador `current`. |
| `GET /properties/{id}/contacts` | Personas relacionadas con esa casa, incluidas las históricas. |
| `POST /properties/{id}/contacts` | Registrar una persona no propietaria para esa casa, sin cuenta. |
| `POST /properties/{id}/contacts/link` | Vincular una persona ya existente mediante `person_id`. |

Crear devuelve 201; consultar/modificar/accionar devuelve 200. La primera conversión devuelve 201 y repetirla devuelve 200 con el mismo contrato. No hay rutas de eliminación física. Errores: 401 sesión, 403 permiso insuficiente, 404 recurso inexistente o fuera del ámbito, 409 conflicto/disponibilidad/versión/estado, 422 entrada inválida. Los mensajes no exponen SQL ni credenciales.

## Ejemplo de contrato diario

Los identificadores son ilustrativos y deben sustituirse por registros autorizados existentes:

```json
{
  "property_id": null,
  "unit_id": 12,
  "responsible_person_id": 8,
  "occupant_ids": [9, 10],
  "owner_parties": [{"person_id": 3, "share": "100.00"}],
  "mode": "daily",
  "status": "active",
  "start_date": "2031-01-01",
  "end_date": "2031-01-03",
  "price": "75.50",
  "currency": "BOB",
  "daily_count": "inclusive",
  "services_included": true,
  "payment_timing": "advance",
  "notes": "Entrada y salida acordadas"
}
```

Para casa completa se indica `property_id` y `unit_id: null`. Exactamente uno debe contener un identificador. El backend deriva `resolved_property_id` y `target_label` para mostrar la casa/cuarto; no son columnas ni campos de escritura.

El ejemplo devuelve tres `billable_days` y tres `occupancy_days`. Con `daily_count: "nights"` devuelve dos noches y la misma ocupación inclusiva. Sin `daily_count`, el conteo es inclusivo. Sin `services_included`, el diario lo activa; un `false` explícito se rechaza. Para noches debe haber al menos una noche. Nunca se generan cargos de servicios, ni siquiera en estancias largas.

El responsable es una persona distinta de los adicionales; los adicionales no pueden repetirse. `owner_parties` son las personas propietarias firmantes de ese contrato, con participación contractual opcional. No son una distribución de facturas. Se proponen los propietarios actuales cuando no se indican; para altas vigentes con entrada pasada es obligatorio indicarlos explícitamente. En la interfaz se revisan siempre. Después de activar no se cambian los firmantes: si cambian las partes corresponde un nuevo acuerdo. Un borrador permite corregirlos.

## Modalidades y fechas

| Modalidad | Condiciones de entrada |
| --- | --- |
| `daily` | Precio positivo por día/noche, `daily_count` inclusivo o noches, servicios siempre incluidos. |
| `weekly` | Precio semanal positivo. Se derivan semanas y días de las fechas; un periodo incompleto exige `weekly_partial_allowed: true`. El formulario permite introducir semanas para calcular la salida. |
| `monthly` | Precio mensual positivo, `monthly_period: anniversary/calendar`, `first_period: full/prorated`, `due_day` entre 1 y 31 o un acuerdo personalizado escrito. En `custom`, `due_day` se conserva nulo. |
| `anticretico` | Inmueble, personas, moneda, fechas y condiciones. `price: null`; no existe capital/devolución en esta fase. |
| `mixed` | Solo borrador con `conditions` escritas y `price: null`. No se activa. |

Los campos específicos de otras modalidades deben ser nulos. Las fechas deben estar entre 1900 y 2199, con salida igual o posterior a la entrada. Los importes tienen hasta 14 dígitos y dos decimales y se devuelven como cadenas, sin redondeos binarios de `float`. La moneda es un código de tres letras mayúsculas; el formulario ofrece BOB, USD y EUR. No se hacen conversiones de moneda.

`payment_timing` admite anticipado (`advance`), al finalizar el periodo (`arrears`) u otro acuerdo (`custom`, con `due_terms` obligatorio). Para mensual, `periods.monthly_periods` muestra fechas completas/reales, días ocupados, denominador real, regla del primer periodo y vencimiento previsto. Aniversario mantiene el día de entrada original: 31/01 → 28/02 → 31/03, sin arrastre al día 28. Calendario utiliza los meses reales de 28, 29, 30 y 31 días.

Al finalizar, `periods.occupancy_days` y los días ocupados de los periodos mensuales utilizan la salida real. `contracted_days` conserva el plazo pactado; `billable_days` diario y las semanas describen ese acuerdo original, sin decidir un cobro o devolución. El detalle distingue ambos conteos. Conservar el acuerdo no significa que exista una deuda por ese importe.

Para anticipado, el vencimiento previsto es la primera aparición del día pactado a partir de la entrada del periodo; para pago al finalizar, se busca a partir del día siguiente a la salida efectiva del periodo mostrado. El día se ajusta al último del mes cuando sea necesario. Un acuerdo personalizado devuelve `due_date: null` y conserva el texto pactado. Son fechas informativas, sin obligaciones financieras generadas. El último periodo mensual puede ser incompleto y conserva su denominador; el cálculo económico final queda para la fase de cargos. Las facturas de servicios tendrán su propio periodo en fase 3.

## Transiciones y trazabilidad

Contrato:

```json
{"action": "extend", "end_date": "2031-01-20", "reason": "Prórroga acordada", "expected_version": 2}
```

- `activate`: borrador validado → vigente, comprobando nuevamente disponibilidad.
- `finish`: vigente → finalizado, con `end_date` real dentro de la estancia y no posterior a hoy. Se conserva `contracts.end_date` pactado y se guarda `actual_end_date` por separado. Puede finalizar antes de lo pactado.
- `cancel`: borrador → cancelado; vigente → cancelado solamente antes de la entrada. Si ya comenzó se utiliza finalización, preservando los días ocupados.
- `extend`: vigente con nueva salida posterior; vuelve a validar modalidad y disponibilidad.

`PATCH` no cambia de estado ni traslada el contrato a otra casa. Puede cambiar de cuarto dentro de la misma casa mientras la estancia no haya comenzado, o en borrador, con validación e historial. Para trasladar una estancia ya iniciada se finaliza el acuerdo anterior y se registra otro: así la ocupación pasada no desaparece del cuarto original. Las personas y condiciones pueden modificarse con historial. La entrada de un vigente se conserva. Un contrato finalizado/cancelado no se modifica. Las fechas, personas, firmantes y condiciones anteriores/posteriores quedan en `audit_events`, con actor y hora UTC, en la misma transacción. Las personas anteriores mantienen su vínculo de consulta con la casa.

`expected_version` es opcional en la API y se envía desde los formularios de edición y las acciones. Una versión antigua devuelve 409 y obliga a recargar. Cada cambio incrementa `version`.

Reserva:

```json
{
  "property_id": 4,
  "unit_id": null,
  "person_id": 8,
  "mode": "monthly",
  "start_date": "2031-02-01",
  "end_date": "2031-02-28",
  "status": "pending",
  "expires_at": "2031-01-25T18:00:00Z",
  "notes": "Pendiente de confirmar"
}
```

Pendiente y confirmada bloquean; se puede confirmar la pendiente, cancelar cualquiera activa o registrar `expire` cuando haya vencido. `expires_at` se guarda en UTC. Si la entrada trae zona horaria se convierte a UTC; si no la trae se interpreta como UTC. El formulario usa la hora local del dispositivo y la convierte tanto al guardar como al editar. No se cambia automáticamente el estado almacenado al consultar: `effective_status` y las comprobaciones de disponibilidad consideran inmediatamente el vencimiento. “Registrar vencimiento” deja también su evento persistente. No hay proceso programado ni envío externo.

La conversión recibe las condiciones completas del contrato, con `status: active`. Conserva casa/cuarto, persona, modalidad y fechas de la reserva. Para cambiarlas se modifica antes la reserva. Excluye solo esa reserva de la comprobación, crea el contrato y marca la reserva convertida dentro de la misma transacción. La unicidad de `contracts.source_reservation_id` evita dos contratos por la misma reserva, incluso con solicitudes simultáneas.

## Disponibilidad y concurrencia

La ocupación es `[entrada,salida]`, inclusive. Un contrato del 1 al 3 bloquea otro que entre el 3; el siguiente puede entrar el 4. El conteo por noches no cambia esta regla. Los borradores y contratos cancelados no bloquean. Los finalizados conservan el bloqueo histórico hasta su salida real. Los contratos vigentes bloquean sus fechas pactadas aunque sean futuras.

La casa completa entra en conflicto con todas sus unidades; una unidad con la casa completa y consigo misma. Dos cuartos diferentes pueden ocuparse simultáneamente. Una casa deshabilitada no admite nuevas ocupaciones. Mantenimiento/deshabilitación de cualquier unidad impide alquilar la casa completa, pero no sus otros cuartos habilitados. Los estados de mantenimiento son actuales; no se ha añadido un calendario de mantenimiento futuro.

Las escrituras bloquean primero la fila `properties` correspondiente. Después leen estado de unidades y contratos/reservas incompatibles con `SELECT … FOR UPDATE`. Son lecturas actuales bajo MySQL REPEATABLE READ, esenciales si autenticación o permisos ya abrieron una lectura anterior. Las operaciones de propiedades/unidades de fase 1 comparten ese bloqueo. Se guarda el evento y el cambio antes del commit. Un error cierra la sesión con rollback. No se utiliza solamente una validación de React ni un bloqueo en memoria del servidor.

Se probaron carreras contrato/contrato, reserva/reserva, casa completa/cuarto y conversión/conversión con conexiones independientes de MySQL. MySQL no ofrece una restricción de exclusión de intervalos equivalente a la de otros motores: las escrituras de aplicación deben pasar por estos servicios. No se garantiza esta regla frente a modificaciones SQL manuales ajenas a la aplicación.

## Permisos y datos de personas

| Rol | Contratos | Reservas y personas | Consulta |
| --- | --- | --- | --- |
| Administrador general | Todas las operaciones | Todas las casas y personas | Todo |
| Administrador de propiedades | Todas en casas asignadas | Gestiona en casas asignadas | Ámbito asignado |
| Operador | Crea/modifica/cancela borradores; no activa ni cambia vigentes | Gestiona reservas y registra inquilinos en casas asignadas; no convierte a vigente | Ámbito asignado |
| Propietario | Sin escritura | Sin escritura | Casas donde es propietario actual |

`property_contacts` vincula candidatos e identidades históricas con una propiedad, sin crear cuentas. Los no administradores generales solo eligen personas de sus casas autorizadas; no pueden adivinar un ID de otra casa para alquilarle. El administrador general puede vincular una persona existente de cualquier casa; los demás solo pueden vincular personas que ya conocen por su ámbito autorizado. Un documento duplicado devuelve conflicto sin revelar datos de la otra persona. `GET /persons` de roles restringidos incluye ahora las personas de su ámbito contractual, además de los propietarios relacionados.

Los firmantes conservados no otorgan por sí mismos acceso a una cuenta de antiguo propietario: la autorización sigue las reglas actuales de fase 1. El historial contractual y el historial de permisos son conceptos distintos. No se añadieron roles por contrato ni un visor global de auditoría.
