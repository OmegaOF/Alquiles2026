# Fase 7: auditoría de normalización de las 63 tablas heredadas

Base inspeccionada: `967176433c616a5a6378dd44adae00adb03c10c1`, MySQL 8.4.13, Alembic `0008_reminders`. Se contrastaron los seis módulos SQLAlchemy, las ocho migraciones históricas y el DDL MySQL real de una base nueva descartable. [Inventario íntegro](phase-7-verification/schema.json): columnas, tipos, nulabilidad, FK, UNIQUE, CHECK, índices y SHOW CREATE TABLE por tabla. `alembic_version` es infraestructura y no integra las 63 tablas de aplicación.

## Método y límites de la demostración

Para cada relación R se enumeran sus atributos y claves. K → R − K expresa las dependencias de identificación de **cada** clave candidata obligatoria. Una UNIQUE con NULL solo identifica la subrelación donde todos sus componentes están definidos; no es clave candidata global. La igualdad accidental de valores no prueba una dependencia.

1FN: cada columna contiene un valor del dominio, sin listas operativas de relaciones. Los documentos de auditoría, respuesta idempotente, evidencia de reparto y texto de comunicación son hechos históricos completos; no son la fuente actual editable de entidades ni saldos. Esta evaluación no certifica una normalización relacional de sus estructuras internas. 2FN exige ausencia de dependencias parciales frente a todas las claves candidatas, no solo la PK. 3FN exige que para cada DF no trivial X → A, X sea superclave o A sea primo. No se presume 3FN por tener id y FK.

Los nombres actuales solo se proyectan desde su entidad. Los importes originales de una obligación/gasto, los acuerdos/repartos confirmados y el contexto registrado en su generación son hechos históricos; no se reemplazan por importes o relaciones actuales al cambiar un contrato. Los saldos se derivan de aplicaciones, ajustes y anulaciones; no se persisten en otra tabla.

## Evaluación individual

### `anticretico_adjustment_lines`

**R:** `adjustment_id, holder_id, responsible_id, delta`.

**Claves candidatas obligatorias:** `{adjustment_id, holder_id, responsible_id}`. PK: `{adjustment_id, holder_id, responsible_id}`.
**DF de identificación:** `{adjustment_id, holder_id, responsible_id} → R − {adjustment_id, holder_id, responsible_id}`.

**DF de negocio y anomalías examinadas:** delta pertenece a la pareja titular/responsable dentro de un ajuste; varias parejas pueden tener deltas distintos y la misma pareja puede intervenir en otros ajustes.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** las claves compuestas identifican el hecho completo; la justificación anterior descarta dependencias de los atributos no primos frente a un subconjunto propio. Se comprueban además las claves simples alternativas.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `anticretico_adjustments`

**R:** `id, revision_id, kind, effective_on, document_reference, operation_id, void_operation_id`.

**Claves candidatas obligatorias:** `{id}`; `{operation_id}`. PK: `{id}`.
**UNIQUE condicionales:** `{void_operation_id}`; solo identifican filas de su subrelación sin NULL.
**DF de identificación:** `{id} → R − {id}`; `{operation_id} → R − {operation_id}`.

**DF de negocio y anomalías examinadas:** Un ajuste no monetario tiene fecha efectiva, clase, acuerdo y operación propios. revision_id no determina esas decisiones. No se copia el capital pendiente.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `anticretico_allocations`

**R:** `id, movement_id, holder_id, responsible_id, amount`.

**Claves candidatas obligatorias:** `{id}`; `{movement_id, holder_id, responsible_id}`. PK: `{id}`.
**DF de identificación:** `{id} → R − {id}`; `{movement_id, holder_id, responsible_id} → R − {movement_id, holder_id, responsible_id}`.

**DF de negocio y anomalías examinadas:** amount depende del movimiento y la pareja titular/responsable; el movimiento puede dividirse y cada pareja puede recibir varios movimientos. Ningún subconjunto de la terna determina amount.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** las claves compuestas identifican el hecho completo; la justificación anterior descarta dependencias de los atributos no primos frente a un subconjunto propio. Se comprueban además las claves simples alternativas.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `anticretico_holders`

**R:** `revision_id, person_id, assigned_amount, beneficiary_person_id`.

**Claves candidatas obligatorias:** `{revision_id, person_id}`. PK: `{revision_id, person_id}`.
**DF de identificación:** `{revision_id, person_id} → R − {revision_id, person_id}`.

**DF de negocio y anomalías examinadas:** assigned_amount y beneficiario dependen de persona en esa revisión; un titular puede autorizar distintos beneficiarios/importes en otros acuerdos, y varios titulares de una revisión difieren.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** las claves compuestas identifican el hecho completo; la justificación anterior descarta dependencias de los atributos no primos frente a un subconjunto propio. Se comprueban además las claves simples alternativas.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `anticretico_movements`

**R:** `movement_id, revision_id, kind`.

**Claves candidatas obligatorias:** `{movement_id}`. PK: `{movement_id}`.
**DF de identificación:** `{movement_id} → R − {movement_id}`.

**DF de negocio y anomalías examinadas:** Un movimiento real se identifica y enlaza su revisión y dirección. Una revisión tiene tanto entregas como devoluciones; revision_id no determina kind.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `anticretico_responsibles`

**R:** `revision_id, person_id, assigned_amount`.

**Claves candidatas obligatorias:** `{revision_id, person_id}`. PK: `{revision_id, person_id}`.
**DF de identificación:** `{revision_id, person_id} → R − {revision_id, person_id}`.

**DF de negocio y anomalías examinadas:** assigned_amount depende de responsable en revisión; ni revisión sola ni persona sola determinan su cuota acordada.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** las claves compuestas identifican el hecho completo; la justificación anterior descarta dependencias de los atributos no primos frente a un subconjunto propio. Se comprueban además las claves simples alternativas.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `anticretico_revisions`

**R:** `id, contract_id, revision, agreed_capital, expected_delivery_on, restitution_on, allow_early_return, conditions, document_reference, notes, operation_id`.

**Claves candidatas obligatorias:** `{id}`; `{operation_id}`; `{contract_id, revision}`. PK: `{id}`.
**DF de identificación:** `{id} → R − {id}`; `{operation_id} → R − {operation_id}`; `{contract_id, revision} → R − {contract_id, revision}`.

**DF de negocio y anomalías examinadas:** Cada revisión registra acuerdo de capital, fechas, condiciones y documentación. Un contrato admite múltiples acuerdos; contract_id solo no determina sus condiciones históricas.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** las claves compuestas identifican el hecho completo; la justificación anterior descarta dependencias de los atributos no primos frente a un subconjunto propio. Se comprueban además las claves simples alternativas.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `anticretico_terms`

**R:** `contract_id, version`.

**Claves candidatas obligatorias:** `{contract_id}`. PK: `{contract_id}`.
**DF de identificación:** `{contract_id} → R − {contract_id}`.

**DF de negocio y anomalías examinadas:** La identidad contractual tiene un contador de concurrencia; no duplica capital, moneda o propiedad.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `audit_events`

**R:** `id, actor_id, action, entity_type, entity_id, details, created_at`.

**Claves candidatas obligatorias:** `{id}`. PK: `{id}`.
**DF de identificación:** `{id} → R − {id}`.

**DF de negocio y anomalías examinadas:** details es el documento inmutable de un evento, no una lista operativa de entidades. (entity_type, entity_id) no determina detalles o fecha: una entidad tiene muchos eventos. La referencia polimórfica carece de FK a sus objetivos; es una limitación de integridad separada.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `auth_sessions`

**R:** `id, token_hash, user_id, expires_at, created_at`.

**Claves candidatas obligatorias:** `{id}`; `{token_hash}`. PK: `{id}`.
**DF de identificación:** `{id} → R − {id}`; `{token_hash} → R − {token_hash}`.

**DF de negocio y anomalías examinadas:** Cada usuario tiene varias sesiones. created_at no determina exactamente expires_at: las lecturas del reloj son distintas y el vencimiento es un dato de sesión, no una columna calculada impuesta por SQL.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `communication_consent_heads`

**R:** `property_id, person_id, purpose, consent_id, version`.

**Claves candidatas obligatorias:** `{property_id, person_id, purpose}`; `{consent_id}`. PK: `{property_id, person_id, purpose}`.
**DF de identificación:** `{property_id, person_id, purpose} → R − {property_id, person_id, purpose}`; `{consent_id} → R − {consent_id}`.

**DF de negocio y anomalías examinadas:** Puntero actual por casa/persona/propósito y aceptación única. consent_id es otra clave candidata, así que su dependencia hacia el ámbito no tiene determinante no clave. version pertenece a ese puntero.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** las claves compuestas identifican el hecho completo; la justificación anterior descarta dependencias de los atributos no primos frente a un subconjunto propio. Se comprueban además las claves simples alternativas.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `communication_consents`

**R:** `id, property_id, person_id, purpose, number, accepted_on, method, notes, operation_id, revoked_operation_id`.

**Claves candidatas obligatorias:** `{id}`; `{operation_id}`. PK: `{id}`.
**UNIQUE condicionales:** `{revoked_operation_id}`; solo identifican filas de su subrelación sin NULL.
**DF de identificación:** `{id} → R − {id}`; `{operation_id} → R − {operation_id}`.

**DF de negocio y anomalías examinadas:** Cada aceptación inmutable conserva número, propósito, fecha y evidencia. person_id no determina número aceptado en todas las casas, propósitos o momentos. No se sustituye por el teléfono actual.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `contract_occupants`

**R:** `contract_id, person_id`.

**Claves candidatas obligatorias:** `{contract_id, person_id}`. PK: `{contract_id, person_id}`.
**DF de identificación:** `{contract_id, person_id} → R − {contract_id, person_id}`.

**DF de negocio y anomalías examinadas:** Relación de pertenencia sin atributos no primos. Contrato y persona pueden aparecer en otras parejas.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** no existen atributos no primos; no hay dependencias parciales.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `contract_owners`

**R:** `contract_id, person_id, share`.

**Claves candidatas obligatorias:** `{contract_id, person_id}`. PK: `{contract_id, person_id}`.
**DF de identificación:** `{contract_id, person_id} → R − {contract_id, person_id}`.

**DF de negocio y anomalías examinadas:** share es participación firmada para esa persona en ese contrato; no se sincroniza con property_owners. Ni contrato ni persona solos determinan share.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** las claves compuestas identifican el hecho completo; la justificación anterior descarta dependencias de los atributos no primos frente a un subconjunto propio. Se comprueban además las claves simples alternativas.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `contracts`

**R:** `id, property_id, unit_id, responsible_person_id, source_reservation_id, mode, status, start_date, end_date, actual_end_date, price, currency, daily_count, weekly_partial_allowed, monthly_period, first_period, due_day, payment_timing, due_terms, services_included, service_terms, conditions, notes, version, created_at, updated_at`.

**Claves candidatas obligatorias:** `{id}`. PK: `{id}`.
**UNIQUE condicionales:** `{source_reservation_id}`; solo identifican filas de su subrelación sin NULL.
**DF de identificación:** `{id} → R − {id}`.

**DF de negocio y anomalías examinadas:** Un contrato conserva su propia moneda, precio, fechas, responsables y términos; modo no determina esos valores. Casa completa y unidad son alternativas XOR, por lo que no copia la casa de la unidad. Firmantes y ocupantes son relaciones separadas. Las condiciones son modificables con auditoría.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `finance_accounts`

**R:** `id, property_id, person_id, currency`.

**Claves candidatas obligatorias:** `{id}`; `{property_id, person_id, currency}`. PK: `{id}`.
**DF de identificación:** `{id} → R − {id}`; `{property_id, person_id, currency} → R − {property_id, person_id, currency}`.

**DF de negocio y anomalías examinadas:** La terna casa/persona/moneda define un contexto, sin saldo almacenado. Ningún subconjunto determina la moneda, persona o casa restante; una persona puede operar en varias casas y monedas.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** no existen atributos no primos; no hay dependencias parciales.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `finance_adjustments`

**R:** `id, obligation_id, delta, new_due_on, new_period_end, operation_id`.

**Claves candidatas obligatorias:** `{id}`; `{operation_id, obligation_id}`. PK: `{id}`.
**DF de identificación:** `{id} → R − {id}`; `{operation_id, obligation_id} → R − {operation_id, obligation_id}`.

**DF de negocio y anomalías examinadas:** delta y las nuevas fechas pertenecen al ajuste de una obligación en una operación. Una obligación tiene muchos ajustes; una generación puede ajustar varias obligaciones con deltas/fechas diferentes. No depende solo de un componente de la clave compuesta.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** las claves compuestas identifican el hecho completo; la justificación anterior descarta dependencias de los atributos no primos frente a un subconjunto propio. Se comprueban además las claves simples alternativas.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `finance_applications`

**R:** `id, source_movement_id, obligation_id, amount, replaces_id, operation_id, void_operation_id`.

**Claves candidatas obligatorias:** `{id}`; `{operation_id, source_movement_id, obligation_id}`. PK: `{id}`.
**UNIQUE condicionales:** `{replaces_id}`; solo identifican filas de su subrelación sin NULL.
**DF de identificación:** `{id} → R − {id}`; `{operation_id, source_movement_id, obligation_id} → R − {operation_id, source_movement_id, obligation_id}`.

**DF de negocio y anomalías examinadas:** Importe aplicado a un origen/obligación en una operación. Un origen cubre varias deudas y una deuda recibe varios pagos; ninguna parte de la clave compuesta determina amount. replaces_id identifica la línea previa sustituida, no el saldo.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** las claves compuestas identifican el hecho completo; la justificación anterior descarta dependencias de los atributos no primos frente a un subconjunto propio. Se comprueban además las claves simples alternativas.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `finance_categories`

**R:** `id, name, is_active`.

**Claves candidatas obligatorias:** `{id}`; `{name}`. PK: `{id}`.
**DF de identificación:** `{id} → R − {id}`; `{name} → R − {name}`.

**DF de negocio y anomalías examinadas:** Nombre único de una categoría. Las reglas de importación usan el catálogo; no basta una migración histórica para resembrar una base borrada por pruebas.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `finance_disbursements`

**R:** `movement_id, expense_id, is_direct`.

**Claves candidatas obligatorias:** `{movement_id}`. PK: `{movement_id}`.
**DF de identificación:** `{movement_id} → R − {movement_id}`.

**DF de negocio y anomalías examinadas:** Cada movimiento se asigna a un gasto y declara si fue pago directo. Un gasto puede tener varios desembolsos directos o propios: expense_id no determina is_direct.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `finance_expense_adjustments`

**R:** `id, expense_id, delta, operation_id`.

**Claves candidatas obligatorias:** `{id}`; `{operation_id, expense_id}`. PK: `{id}`.
**DF de identificación:** `{id} → R − {id}`; `{operation_id, expense_id} → R − {operation_id, expense_id}`.

**DF de negocio y anomalías examinadas:** Cambio de importe por gasto/operación. Un gasto admite varios ajustes y el delta no depende solo del gasto. La unicidad SQL compuesta no pretende demostrar una dependencia parcial; el dominio permite operaciones con varios gastos.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** las claves compuestas identifican el hecho completo; la justificación anterior descarta dependencias de los atributos no primos frente a un subconjunto propio. Se comprueban además las claves simples alternativas.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `finance_expenses`

**R:** `id, account_id, unit_id, category_id, receipt_id, description, recorded_on, original_amount, due_on, document_reference, notes, operation_id, void_operation_id`.

**Claves candidatas obligatorias:** `{id}`; `{operation_id}`. PK: `{id}`.
**UNIQUE condicionales:** `{receipt_id}`; `{void_operation_id}`; solo identifican filas de su subrelación sin NULL.
**DF de identificación:** `{id} → R − {id}`; `{operation_id} → R − {operation_id}`.

**DF de negocio y anomalías examinadas:** Contexto, descripción e importe originales son hechos registrados; ajustes/desembolsos son relaciones separadas. Para recibos externos description conserva la leyenda al importar y no se sincroniza con el nombre actual del suministro. unit_id es atribución explícita, no reparto inferido.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `finance_guarantees`

**R:** `movement_id, account_id, contract_id, conditions, retained_operation_id`.

**Claves candidatas obligatorias:** `{movement_id}`. PK: `{movement_id}`.
**UNIQUE condicionales:** `{retained_operation_id}`; solo identifican filas de su subrelación sin NULL.
**DF de identificación:** `{movement_id} → R − {movement_id}`.

**DF de negocio y anomalías examinadas:** Garantía recibida con contexto, contrato y condiciones particulares. Puede entregarla otra persona; contract_id no determina account_id ni conditions. No copia el importe del movimiento. retained_operation_id es un hecho de autorización, no dinero.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `finance_incoming`

**R:** `movement_id, account_id, category`.

**Claves candidatas obligatorias:** `{movement_id}`. PK: `{movement_id}`.
**DF de identificación:** `{movement_id} → R − {movement_id}`.

**DF de negocio y anomalías examinadas:** Clasifica un movimiento real en su cuenta y tratamiento inicial. account_id no determina category: una cuenta recibe cobros y anticipos. No copia importe del movimiento.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `finance_methods`

**R:** `id, name, is_active`.

**Claves candidatas obligatorias:** `{id}`; `{name}`. PK: `{id}`.
**DF de identificación:** `{id} → R − {id}`; `{name} → R − {name}`.

**DF de negocio y anomalías examinadas:** Nombre único de un método; una clasificación no contiene atributos adicionales copiados en movimientos.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `finance_movements`

**R:** `id, amount, occurred_on, method_id, payer_id, beneficiary_person_id, beneficiary_label, reference, document_reference, notes, operation_id, void_operation_id`.

**Claves candidatas obligatorias:** `{id}`; `{operation_id}`. PK: `{id}`.
**UNIQUE condicionales:** `{void_operation_id}`; solo identifican filas de su subrelación sin NULL.
**DF de identificación:** `{id} → R − {id}`; `{operation_id} → R − {operation_id}`.

**DF de negocio y anomalías examinadas:** Importe, fecha, pagador y beneficiario son hechos del movimiento. beneficiary_label es texto de contraparte/comprobante aportado por usuario, no un espejo sincronizado de persons.full_name. Puede diferir entre movimientos del mismo beneficiario. No guarda saldo ni moneda/contexto que ya enlazan sus subtipos.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `finance_obligations`

**R:** `id, account_id, unit_id, rent_contract_id, service_origin_id, period_start, period_end, original_amount, due_on, operation_id`.

**Claves candidatas obligatorias:** `{id}`. PK: `{id}`.
**UNIQUE condicionales:** `{service_origin_id}`; `{rent_contract_id, period_start, account_id}`; solo identifican filas de su subrelación sin NULL.
**DF de identificación:** `{id} → R − {id}`.

**DF de negocio y anomalías examinadas:** account_id, unit_id, periodo e importe registran el contexto al generar el cargo. No se suponen rent_contract_id → account_id o unit_id: un contrato futuro puede cambiar de responsable/moneda/espacio, y regenerar conserva el cargo y registra ajustes; el código no reescribe su contexto original. Una distribución sustituta también conserva el primer service_origin_id y añade finance_utility_links. Se requieren ambos orígenes XOR. Son hechos de generación, no el saldo actual.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `finance_operations`

**R:** `id, property_id, request_key, action, payload_hash, result, created_by, created_at`.

**Claves candidatas obligatorias:** `{id}`; `{request_key}`. PK: `{id}`.
**DF de identificación:** `{id} → R − {id}`; `{request_key} → R − {request_key}`.

**DF de negocio y anomalías examinadas:** Solicitud idempotente: request_key identifica acción, actor, casa y resultado histórico. result es recibo opaco de la operación original, nunca se utiliza como fuente actual de deuda ni como lista relacional editable.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `finance_refunds`

**R:** `movement_id, source_movement_id`.

**Claves candidatas obligatorias:** `{movement_id}`. PK: `{movement_id}`.
**DF de identificación:** `{movement_id} → R − {movement_id}`.

**DF de negocio y anomalías examinadas:** Un movimiento devuelve a otro movimiento de origen; un origen puede tener varias devoluciones parciales. No repite importes o personas del origen.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `finance_utility_imports`

**R:** `distribution_id, operation_id`.

**Claves candidatas obligatorias:** `{distribution_id}`; `{operation_id}`. PK: `{distribution_id}`.
**DF de identificación:** `{distribution_id} → R − {distribution_id}`; `{operation_id} → R − {operation_id}`.

**DF de negocio y anomalías examinadas:** Una importación identificada por reparto y operación, ambos claves, sin repetir resultados monetarios.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** no existen atributos no primos; no hay dependencias parciales.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `finance_utility_links`

**R:** `responsibility_id, obligation_id`.

**Claves candidatas obligatorias:** `{responsibility_id}`. PK: `{responsibility_id}`.
**DF de identificación:** `{responsibility_id} → R − {responsibility_id}`.

**DF de negocio y anomalías examinadas:** Cada responsabilidad confirmada importada enlaza una obligación. Una obligación puede recoger varias responsabilidades y sus versiones; no copia persona, unidad, contrato o importe.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `meter_readings`

**R:** `id, meter_id, recorded_on, value, notes, version, created_at, updated_at`.

**Claves candidatas obligatorias:** `{id}`; `{meter_id, recorded_on}`. PK: `{id}`.
**DF de identificación:** `{id} → R − {id}`; `{meter_id, recorded_on} → R − {meter_id, recorded_on}`.

**DF de negocio y anomalías examinadas:** El valor depende del medidor en una fecha; un medidor tiene valores diferentes y medidores distintos pueden medirse el mismo día. value no es consumo derivado: es la lectura observada.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** las claves compuestas identifican el hecho completo; la justificación anterior descarta dependencias de los atributos no primos frente a un subconjunto propio. Se comprueban además las claves simples alternativas.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `payment_report_decisions`

**R:** `id, report_id, kind, movement_id, reason, operation_id`.

**Claves candidatas obligatorias:** `{id}`; `{operation_id}`. PK: `{id}`.
**UNIQUE condicionales:** `{movement_id}`; solo identifican filas de su subrelación sin NULL.
**DF de identificación:** `{id} → R − {id}`; `{operation_id} → R − {operation_id}`.

**DF de negocio y anomalías examinadas:** Decisión histórica por reporte/operación; el mismo reporte admite decisiones posteriores. La verificación enlaza un movimiento único sin copiar importe. kind no determina reason.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `persons`

**R:** `id, full_name, document, phone, whatsapp, email, address, notes, is_owner, created_at, updated_at`.

**Claves candidatas obligatorias:** `{id}`. PK: `{id}`.
**UNIQUE condicionales:** `{document}`; solo identifican filas de su subrelación sin NULL.
**DF de identificación:** `{id} → R − {id}`.

**DF de negocio y anomalías examinadas:** El documento es opcional; nombres, correo y teléfonos no identifican a una persona. is_owner habilita su selección, no calcula EXISTS(titularidad). No se asume dirección → ciudad.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `properties`

**R:** `id, name, address, zone, city, description, is_active, created_at, updated_at`.

**Claves candidatas obligatorias:** `{id}`. PK: `{id}`.
**DF de identificación:** `{id} → R − {id}`.

**DF de negocio y anomalías examinadas:** Nombre y dirección no son identificadores alternativos. Zona y dirección no determinan inequívocamente ciudad. Propietarios y cuartos se relacionan fuera de la fila.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `property_access`

**R:** `property_id, user_id`.

**Claves candidatas obligatorias:** `{property_id, user_id}`. PK: `{property_id, user_id}`.
**DF de identificación:** `{property_id, user_id} → R − {property_id, user_id}`.

**DF de negocio y anomalías examinadas:** Solo contiene la pertenencia casa/cuenta. No copia role ni nombres; ambos extremos pueden tener varias asignaciones.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** no existen atributos no primos; no hay dependencias parciales.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `property_contacts`

**R:** `property_id, person_id`.

**Claves candidatas obligatorias:** `{property_id, person_id}`. PK: `{property_id, person_id}`.
**DF de identificación:** `{property_id, person_id} → R − {property_id, person_id}`.

**DF de negocio y anomalías examinadas:** Solo contiene pertenencia casa/persona retenida; no es una lista en properties ni copia contactos actuales.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** no existen atributos no primos; no hay dependencias parciales.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `property_owners`

**R:** `property_id, person_id, share`.

**Claves candidatas obligatorias:** `{property_id, person_id}`. PK: `{property_id, person_id}`.
**DF de identificación:** `{property_id, person_id} → R − {property_id, person_id}`.

**DF de negocio y anomalías examinadas:** share depende de la pareja casa/persona; una casa y una persona pueden tener participaciones diferentes en cada titularidad. Representa titularidad actual, sin vigencias legales estructuradas.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** las claves compuestas identifican el hecho completo; la justificación anterior descarta dependencias de los atributos no primos frente a un subconjunto propio. Se comprueban además las claves simples alternativas.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `reminder_attention_events`

**R:** `id, notice_id, kind, fingerprint, until_on, notes, operation_id`.

**Claves candidatas obligatorias:** `{id}`; `{operation_id}`. PK: `{id}`.
**DF de identificación:** `{id} → R − {id}`; `{operation_id} → R − {operation_id}`.

**DF de negocio y anomalías examinadas:** Evento personal con huella y eventual decisión de posponer. Actor/instante se obtienen de la operación. notice_id no determina la decisión o el plazo entre eventos.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `reminder_communication_events`

**R:** `id, communication_id, kind, notes, operation_id`.

**Claves candidatas obligatorias:** `{id}`; `{operation_id}`. PK: `{id}`.
**DF de identificación:** `{id} → R − {id}`; `{operation_id} → R − {operation_id}`.

**DF de negocio y anomalías examinadas:** Cada evento de apertura/confirmación/corrección enlaza una operación. La comunicación puede tener múltiples eventos distintos; no se sobrescribe un estado de enviado en la cabecera.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `reminder_communications`

**R:** `id, notice_id, consent_id, template_id, template_code, template_version, final_text, source_fingerprint, version, operation_id, authorization_operation_id`.

**Claves candidatas obligatorias:** `{id}`; `{operation_id}`. PK: `{id}`.
**UNIQUE condicionales:** `{authorization_operation_id}`; solo identifican filas de su subrelación sin NULL.
**DF de identificación:** `{id} → R − {id}`; `{operation_id} → R − {operation_id}`.

**DF de negocio y anomalías examinadas:** Intento con aceptación, plantilla y texto final histórico; template_version describe la versión usada, no la versión actual derivable. No copia número, persona o propiedad de la aceptación. Texto editado es un hecho inmutable del intento.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `reminder_lead_days`

**R:** `property_id, days`.

**Claves candidatas obligatorias:** `{property_id, days}`. PK: `{property_id, days}`.
**DF de identificación:** `{property_id, days} → R − {property_id, days}`.

**DF de negocio y anomalías examinadas:** Relación casa/día de aviso sin atributos no primos. No guarda una lista de días en una columna.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** no existen atributos no primos; no hay dependencias parciales.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `reminder_notices`

**R:** `id, obligation_id, receipt_id, expense_id, contract_id, capital_contract_id, holder_id, responsible_id, report_id, version`.

**Claves candidatas obligatorias:** `{id}`. PK: `{id}`.
**UNIQUE condicionales:** `{contract_id}`; `{expense_id}`; `{obligation_id}`; `{receipt_id}`; `{report_id}`; `{capital_contract_id, holder_id, responsible_id}`; solo identifican filas de su subrelación sin NULL.
**DF de identificación:** `{id} → R − {id}`.

**DF de negocio y anomalías examinadas:** Identidad de seguimiento de un solo origen XOR, con contador de concurrencia. Los orígenes opcionales son claves solo en sus subtipos; capital identifica la terna contrato/titular/responsable. No guarda saldo, moneda, persona o vencimiento derivados.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `reminder_operations`

**R:** `id, property_id, request_key, action, payload_hash, result, created_by, created_at`.

**Claves candidatas obligatorias:** `{id}`; `{request_key}`. PK: `{id}`.
**DF de identificación:** `{id} → R − {id}`; `{request_key} → R − {request_key}`.

**DF de negocio y anomalías examinadas:** Solicitud de comunicación/atención, con acción, actor y resultado histórico idempotente. No es dinero; no existe fuente de saldos paralela.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `reminder_preferences`

**R:** `property_id, version, snooze_days, operation_id`.

**Claves candidatas obligatorias:** `{property_id}`; `{operation_id}`. PK: `{property_id}`.
**DF de identificación:** `{property_id} → R − {property_id}`; `{operation_id} → R − {operation_id}`.

**DF de negocio y anomalías examinadas:** Una configuración por casa, con versión, plazo máximo y última operación identificadora. Los días, tipos y destinatarios múltiples están en relaciones separadas.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `reminder_recipients`

**R:** `property_id, user_id`.

**Claves candidatas obligatorias:** `{property_id, user_id}`. PK: `{property_id, user_id}`.
**DF de identificación:** `{property_id, user_id} → R − {property_id, user_id}`.

**DF de negocio y anomalías examinadas:** Asignación casa/usuario sin nombres ni rol copiados, sin atributos no primos.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** no existen atributos no primos; no hay dependencias parciales.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `reminder_templates`

**R:** `id, property_id, kind, name, body, is_active, version, operation_id`.

**Claves candidatas obligatorias:** `{id}`; `{operation_id}`; `{property_id, kind}`. PK: `{id}`.
**DF de identificación:** `{id} → R − {id}`; `{operation_id} → R − {operation_id}`; `{property_id, kind} → R − {property_id, kind}`.

**DF de negocio y anomalías examinadas:** Texto, nombre, estado y versión de plantilla por casa/tipo. kind solo no determina texto: cada casa lo configura de forma independiente.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** las claves compuestas identifican el hecho completo; la justificación anterior descarta dependencias de los atributos no primos frente a un subconjunto propio. Se comprueban además las claves simples alternativas.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `reminder_type_preferences`

**R:** `property_id, kind, is_enabled, allow_whatsapp`.

**Claves candidatas obligatorias:** `{property_id, kind}`. PK: `{property_id, kind}`.
**DF de identificación:** `{property_id, kind} → R − {property_id, kind}`.

**DF de negocio y anomalías examinadas:** is_enabled y allow_whatsapp dependen del tipo en esa casa; casas distintas pueden decidir de modo diferente para el mismo tipo.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** las claves compuestas identifican el hecho completo; la justificación anterior descarta dependencias de los atributos no primos frente a un subconjunto propio. Se comprueban además las claves simples alternativas.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `reported_payments`

**R:** `id, obligation_id, account_id, reporting_person_id, concept, amount, reported_on, method_id, document_reference, notes, version, operation_id`.

**Claves candidatas obligatorias:** `{id}`; `{operation_id}`. PK: `{id}`.
**DF de identificación:** `{id} → R − {id}`; `{operation_id} → R − {operation_id}`.

**DF de negocio y anomalías examinadas:** Importe/método/fecha son afirmación del informante, no copia del movimiento. Cuenta y obligación son XOR para evitar obligation_id → account_id entre atributos no clave. No guarda moneda/casa/persona responsable derivadas.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `reservations`

**R:** `id, property_id, unit_id, person_id, mode, start_date, end_date, status, expires_at, notes, version, created_at, updated_at`.

**Claves candidatas obligatorias:** `{id}`. PK: `{id}`.
**DF de identificación:** `{id} → R − {id}`.

**DF de negocio y anomalías examinadas:** Un solicitante puede tener múltiples reservas con distintos espacios, fechas y modos. Espacio es XOR; el estado y expiración pertenecen a la reserva, no a la persona.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `service_accounts`

**R:** `id, property_id, type_id, label, provider, account_number, measurement_kind, measure_unit, start_date, is_active, notes, version, created_at, updated_at`.

**Claves candidatas obligatorias:** `{id}`; `{property_id, label}`. PK: `{id}`.
**UNIQUE condicionales:** `{property_id, provider, account_number}`; solo identifican filas de su subrelación sin NULL.
**DF de identificación:** `{id} → R − {id}`; `{property_id, label} → R − {property_id, label}`.

**DF de negocio y anomalías examinadas:** label identifica un suministro dentro de una propiedad, no globalmente. Una propiedad tiene varios suministros y varios pueden compartir proveedor, tipo y unidad de medida; ninguno de esos atributos determina los demás. Número opcional tiene unicidad en su contexto.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** las claves compuestas identifican el hecho completo; la justificación anterior descarta dependencias de los atributos no primos frente a un subconjunto propio. Se comprueban además las claves simples alternativas.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `units`

**R:** `id, property_id, code, name, unit_type, description, maintenance, is_enabled, notes, created_at, updated_at`.

**Claves candidatas obligatorias:** `{id}`; `{property_id, code}`. PK: `{id}`.
**DF de identificación:** `{id} → R − {id}`; `{property_id, code} → R − {property_id, code}`.

**DF de negocio y anomalías examinadas:** Los códigos se repiten entre casas; una casa contiene varios códigos. Ni property_id ni code aisladamente determinan nombre, tipo o mantenimiento de la unidad.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** las claves compuestas identifican el hecho completo; la justificación anterior descarta dependencias de los atributos no primos frente a un subconjunto propio. Se comprueban además las claves simples alternativas.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `users`

**R:** `id, username, password_hash, role, person_id, is_active, created_at, updated_at, display_name`.

**Claves candidatas obligatorias:** `{id}`; `{username}`. PK: `{id}`.
**DF de identificación:** `{id} → R − {id}`; `{username} → R − {username}`.

**DF de negocio y anomalías examinadas:** Una persona puede tener varias cuentas con contraseñas, roles y alias distintos: person_id no determina display_name, role ni password_hash. full_name se consulta en persons; no se almacena aquí.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `utility_allocations`

**R:** `id, distribution_id, unit_id, amount, weight`.

**Claves candidatas obligatorias:** `{id}`. PK: `{id}`.
**UNIQUE condicionales:** `{distribution_id, unit_id}`; solo identifican filas de su subrelación sin NULL.
**DF de identificación:** `{id} → R − {id}`.

**DF de negocio y anomalías examinadas:** amount y weight son resultados de una versión de reparto que puede recibir confirmación manual y ajustes de redondeo. No existe weight → amount ni unit_id → amount. El ámbito sin unidad tiene NULL, no una clave candidata global.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `utility_configuration_units`

**R:** `configuration_id, unit_id, percentage`.

**Claves candidatas obligatorias:** `{configuration_id, unit_id}`. PK: `{configuration_id, unit_id}`.
**DF de identificación:** `{configuration_id, unit_id} → R − {configuration_id, unit_id}`.

**DF de negocio y anomalías examinadas:** percentage depende de unidad en configuración; una unidad cambia de proporción entre configuraciones y una configuración admite proporciones diferentes para sus unidades.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** las claves compuestas identifican el hecho completo; la justificación anterior descarta dependencias de los atributos no primos frente a un subconjunto propio. Se comprueban además las claves simples alternativas.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `utility_configurations`

**R:** `id, account_id, revision, method, economic_policy, owner_person_id, provider_payer_id, reimbursement_person_id, notes, created_by, created_at`.

**Claves candidatas obligatorias:** `{id}`; `{account_id, revision}`. PK: `{id}`.
**DF de identificación:** `{id} → R − {id}`; `{account_id, revision} → R − {account_id, revision}`.

**DF de negocio y anomalías examinadas:** Cada revisión registra una decisión de reparto, personas responsables y política. account_id solo no determina método, política ni personas entre revisiones. Se conservan decisiones históricas.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** las claves compuestas identifican el hecho completo; la justificación anterior descarta dependencias de los atributos no primos frente a un subconjunto propio. Se comprueban además las claves simples alternativas.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `utility_current_distributions`

**R:** `receipt_id, distribution_id`.

**Claves candidatas obligatorias:** `{receipt_id}`; `{distribution_id}`. PK: `{receipt_id}`.
**DF de identificación:** `{receipt_id} → R − {receipt_id}`; `{distribution_id} → R − {distribution_id}`.

**DF de negocio y anomalías examinadas:** Cada recibo apunta a un único reparto vigente y ese reparto pertenece a un solo recibo; los dos atributos son claves candidatas. No almacena el importe del reparto.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** no existen atributos no primos; no hay dependencias parciales.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `utility_distributions`

**R:** `id, receipt_revision_id, configuration_id, request_key, status, version, evidence, reason, supersedes_id, created_by, created_at, confirmed_by, confirmed_at`.

**Claves candidatas obligatorias:** `{id}`; `{request_key}`. PK: `{id}`.
**DF de identificación:** `{id} → R − {id}`; `{request_key} → R − {request_key}`.

**DF de negocio y anomalías examinadas:** Cada cálculo/confirmación guarda sus referencias y evidencia histórica. Puede haber varios intentos para una revisión/configuración: esa pareja no identifica el evento. evidence registra entradas y decisiones congeladas, no reemplaza allocations/responsibilities.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `utility_meters`

**R:** `id, account_id, unit_id, serial, installed_on, retired_on, replaces_id, notes, version`.

**Claves candidatas obligatorias:** `{id}`; `{account_id, serial}`. PK: `{id}`.
**UNIQUE condicionales:** `{replaces_id}`; solo identifican filas de su subrelación sin NULL.
**DF de identificación:** `{id} → R − {id}`; `{account_id, serial} → R − {account_id, serial}`.

**DF de negocio y anomalías examinadas:** Una cuenta admite varios medidores y el serial puede repetirse en otras cuentas. Unidad, instalación y retiro corresponden al medidor; ninguno depende solo de account_id ni de serial.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** las claves compuestas identifican el hecho completo; la justificación anterior descarta dependencias de los atributos no primos frente a un subconjunto propio. Se comprueban además las claves simples alternativas.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `utility_receipt_revisions`

**R:** `id, receipt_id, revision, external_reference, amount, currency, issued_on, period_start, period_end, due_on, consumption, fixed_amount, document_reference, notes, reason, created_by, created_at`.

**Claves candidatas obligatorias:** `{id}`; `{receipt_id, revision}`. PK: `{id}`.
**DF de identificación:** `{id} → R − {id}`; `{receipt_id, revision} → R − {receipt_id, revision}`.

**DF de negocio y anomalías examinadas:** Cada versión documenta importe/moneda/periodo reales de un recibo externo. receipt_id solo no determina esos hechos entre revisiones; external_reference no es globalmente única. fixed_amount es parte declarada de la factura, no saldo.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** las claves compuestas identifican el hecho completo; la justificación anterior descarta dependencias de los atributos no primos frente a un subconjunto propio. Se comprueban además las claves simples alternativas.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `utility_receipts`

**R:** `id, account_id, version, created_at, updated_at`.

**Claves candidatas obligatorias:** `{id}`. PK: `{id}`.
**DF de identificación:** `{id} → R − {id}`.

**DF de negocio y anomalías examinadas:** Identidad del recibo con suministro y versión de concurrencia; los datos revisables se guardan en revisiones. Una cuenta contiene varios recibos.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `utility_responsibilities`

**R:** `id, allocation_id, person_id, contract_id, amount`.

**Claves candidatas obligatorias:** `{id}`. PK: `{id}`.
**UNIQUE condicionales:** `{allocation_id, person_id, contract_id}`; solo identifican filas de su subrelación sin NULL.
**DF de identificación:** `{id} → R − {id}`.

**DF de negocio y anomalías examinadas:** amount y person_id registran la responsabilidad aceptada para una asignación. Un mismo contrato puede cambiar de responsable entre repartos; contract_id no determina la persona histórica. NULL en persona/contrato representa parte desocupada/propietario; el importe no es una deuda duplicada.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

### `utility_types`

**R:** `id, name, is_active`.

**Claves candidatas obligatorias:** `{id}`; `{name}`. PK: `{id}`.
**DF de identificación:** `{id} → R − {id}`; `{name} → R − {name}`.

**DF de negocio y anomalías examinadas:** name es único; no se duplican nombre o estado del tipo en cada recibo.

**1FN:** atributos escalares de su dominio; cada relación múltiple se registra por fila/FK.
**2FN:** sus claves candidatas globales son simples; no admiten dependencia parcial. Los identificadores opcionales se examinan dentro de su subtipo.
**3FN:** con las DF y la semántica indicadas, los determinantes no triviales identificados son claves/superclaves de su relación (o del subtipo explícito sin NULL). No se identifica una DF adicional entre atributos no clave que exija una descomposición. Esta conclusión depende de conservar la semántica histórica indicada, no de interpretar las referencias como copias de datos actuales.

## Integridad, cardinalidades y limitaciones heredadas

- Las FK tienen RESTRICT/NO ACTION: conservar historial no equivale a borrar en cascada. Las relaciones simples obligatorias enlazan exactamente una fila padre; las opcionales admiten cero o una. Desde el padre son 0..N, excepto si el extremo FK es UNIQUE, que limita a 0..1. Las tablas puente expresan N..M; sus PK compuestas impiden parejas repetidas.
- Las FK simples comprueban existencia, no todas las coincidencias de contexto entre relaciones. Alcance de propiedad, autorización, suma de cuotas y conciliación se validan en servicios con bloqueo. Falta de una restricción interrelacional no prueba incumplimiento de 3FN.
- property_owners solo describe titulares actuales. Los firmantes de contratos y revisiones de anticrético sí son históricos. Un reporte por propietario mostrará totales de sus propiedades sin prorratearlos por share ni afirmar titularidad legal histórica.
- La auditoría conserva documentos anteriores, pero no todas las clasificaciones/ocupaciones poseen vigencia relacional suficiente para reconstruir cualquier estado histórico. Los reportes deben distinguir flujos por fecha de negocio, hechos conocidos al corte y limitaciones explícitas; nunca rotular saldo actual como histórico.
- Los importes originales y contextos de finance_obligations son históricos de generación. Normalizarlos contra la persona/moneda/espacio **actuales** del contrato destruiría datos. La prueba de cambio de contexto conserva el cargo anterior y sus aplicaciones. No se reinterpreta esa historia como una caché.
- Una auditoría conceptual depende del dominio declarado; ni una muestra vacía ni un test con PK certifican reglas futuras. Si cambian las reglas (p. ej. beneficiary_label pasa a ser un nombre canónico sincronizado), debe revisarse la DF y migrarse.

## Resultado previo al diseño de reportes

Se identifican 63 tablas, sin nuevas tablas ni cambios de columnas en esta auditoría. Respecto de las DF documentadas no se demuestra una infracción que requiera descomposición; se conservan los hechos históricos y se informan límites de integridad y reconstrucción. No se autorizan tablas de saldos ni agregados persistidos. El diseño de consultas de fase 7 no necesita tablas de resultados; se decidirán índices solo con evidencia de consultas. Esta conclusión conceptual se complementará con las pruebas MySQL, migraciones y regresión; no equivale a afirmar que esas pruebas ya se ejecutaron.

## Diagrama de relaciones existente

El diagrama incluye las 63 tablas y todas las FK. Cuando hay varias FK entre dos tablas, sus nombres se agrupan. `o|` en el extremo padre indica una referencia opcional; la cardinalidad del hijo depende de UNIQUE/PK como se detalla en el inventario.

```mermaid
erDiagram
  anticretico_adjustment_lines {
    INTEGER adjustment_id PK,FK
    INTEGER holder_id PK,FK
    INTEGER responsible_id PK,FK
  }
  anticretico_adjustments {
    INTEGER id PK
    INTEGER revision_id FK
    INTEGER operation_id FK,UK
    INTEGER void_operation_id FK,UK
  }
  anticretico_allocations {
    INTEGER id PK
    INTEGER movement_id FK
    INTEGER holder_id FK
    INTEGER responsible_id FK
    DECIMAL amount
  }
  anticretico_holders {
    INTEGER revision_id PK,FK
    INTEGER person_id PK,FK
    INTEGER beneficiary_person_id FK
  }
  anticretico_movements {
    INTEGER movement_id PK,FK
    INTEGER revision_id FK
  }
  anticretico_responsibles {
    INTEGER revision_id PK,FK
    INTEGER person_id PK,FK
  }
  anticretico_revisions {
    INTEGER id PK
    INTEGER contract_id FK
    INTEGER revision
    DECIMAL agreed_capital
    INTEGER operation_id FK,UK
  }
  anticretico_terms {
    INTEGER contract_id PK,FK
  }
  audit_events {
    INTEGER id PK
    INTEGER actor_id FK
  }
  auth_sessions {
    INTEGER id PK
    VARCHAR token_hash UK
    INTEGER user_id FK
  }
  communication_consent_heads {
    INTEGER property_id PK,FK
    INTEGER person_id PK,FK
    VARCHAR purpose PK
    INTEGER consent_id FK,UK
  }
  communication_consents {
    INTEGER id PK
    INTEGER property_id FK
    INTEGER person_id FK
    INTEGER operation_id FK,UK
    INTEGER revoked_operation_id FK,UK
  }
  contract_occupants {
    INTEGER contract_id PK,FK
    INTEGER person_id PK,FK
  }
  contract_owners {
    INTEGER contract_id PK,FK
    INTEGER person_id PK,FK
  }
  contracts {
    INTEGER id PK
    INTEGER property_id FK
    INTEGER unit_id FK
    INTEGER responsible_person_id FK
    INTEGER source_reservation_id FK,UK
    VARCHAR currency
  }
  finance_accounts {
    INTEGER id PK
    INTEGER property_id FK
    INTEGER person_id FK
    VARCHAR currency
  }
  finance_adjustments {
    INTEGER id PK
    INTEGER obligation_id FK
    INTEGER operation_id FK
  }
  finance_applications {
    INTEGER id PK
    INTEGER source_movement_id FK
    INTEGER obligation_id FK
    DECIMAL amount
    INTEGER replaces_id FK,UK
    INTEGER operation_id FK
    INTEGER void_operation_id FK
  }
  finance_categories {
    INTEGER id PK
    VARCHAR name UK
  }
  finance_disbursements {
    INTEGER movement_id PK,FK
    INTEGER expense_id FK
  }
  finance_expense_adjustments {
    INTEGER id PK
    INTEGER expense_id FK
    INTEGER operation_id FK
  }
  finance_expenses {
    INTEGER id PK
    INTEGER account_id FK
    INTEGER unit_id FK
    INTEGER category_id FK
    INTEGER receipt_id FK,UK
    DECIMAL original_amount
    INTEGER operation_id FK,UK
    INTEGER void_operation_id FK,UK
  }
  finance_guarantees {
    INTEGER movement_id PK,FK
    INTEGER account_id FK
    INTEGER contract_id FK
    INTEGER retained_operation_id FK,UK
  }
  finance_incoming {
    INTEGER movement_id PK,FK
    INTEGER account_id FK
  }
  finance_methods {
    INTEGER id PK
    VARCHAR name UK
  }
  finance_movements {
    INTEGER id PK
    DECIMAL amount
    INTEGER method_id FK
    INTEGER payer_id FK
    INTEGER beneficiary_person_id FK
    INTEGER operation_id FK,UK
    INTEGER void_operation_id FK,UK
  }
  finance_obligations {
    INTEGER id PK
    INTEGER account_id FK
    INTEGER unit_id FK
    INTEGER rent_contract_id FK
    INTEGER service_origin_id FK,UK
    DECIMAL original_amount
    INTEGER operation_id FK
  }
  finance_operations {
    INTEGER id PK
    INTEGER property_id FK
    VARCHAR request_key UK
    INTEGER created_by FK
  }
  finance_refunds {
    INTEGER movement_id PK,FK
    INTEGER source_movement_id FK
  }
  finance_utility_imports {
    INTEGER distribution_id PK,FK
    INTEGER operation_id FK,UK
  }
  finance_utility_links {
    INTEGER responsibility_id PK,FK
    INTEGER obligation_id FK
  }
  meter_readings {
    INTEGER id PK
    INTEGER meter_id FK
    DATE recorded_on
  }
  payment_report_decisions {
    INTEGER id PK
    INTEGER report_id FK
    INTEGER movement_id FK,UK
    INTEGER operation_id FK,UK
  }
  persons {
    INTEGER id PK
    VARCHAR full_name
  }
  properties {
    INTEGER id PK
    VARCHAR name
  }
  property_access {
    INTEGER property_id PK,FK
    INTEGER user_id PK,FK
  }
  property_contacts {
    INTEGER property_id PK,FK
    INTEGER person_id PK,FK
  }
  property_owners {
    INTEGER property_id PK,FK
    INTEGER person_id PK,FK
  }
  reminder_attention_events {
    INTEGER id PK
    INTEGER notice_id FK
    INTEGER operation_id FK,UK
  }
  reminder_communication_events {
    INTEGER id PK
    INTEGER communication_id FK
    INTEGER operation_id FK,UK
  }
  reminder_communications {
    INTEGER id PK
    INTEGER notice_id FK
    INTEGER consent_id FK
    INTEGER template_id FK
    INTEGER operation_id FK,UK
    INTEGER authorization_operation_id FK,UK
  }
  reminder_lead_days {
    INTEGER property_id PK,FK
    INTEGER days PK
  }
  reminder_notices {
    INTEGER id PK
    INTEGER obligation_id FK,UK
    INTEGER receipt_id FK,UK
    INTEGER expense_id FK,UK
    INTEGER contract_id FK,UK
    INTEGER capital_contract_id FK
    INTEGER holder_id FK
    INTEGER responsible_id FK
    INTEGER report_id FK,UK
  }
  reminder_operations {
    INTEGER id PK
    INTEGER property_id FK
    VARCHAR request_key UK
    INTEGER created_by FK
  }
  reminder_preferences {
    INTEGER property_id PK,FK
    INTEGER operation_id FK,UK
  }
  reminder_recipients {
    INTEGER property_id PK,FK
    INTEGER user_id PK,FK
  }
  reminder_templates {
    INTEGER id PK
    INTEGER property_id FK
    VARCHAR kind
    VARCHAR name
    INTEGER operation_id FK,UK
  }
  reminder_type_preferences {
    INTEGER property_id PK,FK
    VARCHAR kind PK
  }
  reported_payments {
    INTEGER id PK
    INTEGER obligation_id FK
    INTEGER account_id FK
    INTEGER reporting_person_id FK
    DECIMAL amount
    INTEGER method_id FK
    INTEGER operation_id FK,UK
  }
  reservations {
    INTEGER id PK
    INTEGER property_id FK
    INTEGER unit_id FK
    INTEGER person_id FK
  }
  service_accounts {
    INTEGER id PK
    INTEGER property_id FK
    INTEGER type_id FK
    VARCHAR label
  }
  units {
    INTEGER id PK
    INTEGER property_id FK
    VARCHAR code
    VARCHAR name
  }
  users {
    INTEGER id PK
    VARCHAR username UK
    INTEGER person_id FK
  }
  utility_allocations {
    INTEGER id PK
    INTEGER distribution_id FK
    INTEGER unit_id FK
    DECIMAL amount
  }
  utility_configuration_units {
    INTEGER configuration_id PK,FK
    INTEGER unit_id PK,FK
  }
  utility_configurations {
    INTEGER id PK
    INTEGER account_id FK
    INTEGER revision
    INTEGER owner_person_id FK
    INTEGER provider_payer_id FK
    INTEGER reimbursement_person_id FK
    INTEGER created_by FK
  }
  utility_current_distributions {
    INTEGER receipt_id PK,FK
    INTEGER distribution_id FK,UK
  }
  utility_distributions {
    INTEGER id PK
    INTEGER receipt_revision_id FK
    INTEGER configuration_id FK
    VARCHAR request_key UK
    INTEGER supersedes_id FK
    INTEGER created_by FK
    INTEGER confirmed_by FK
  }
  utility_meters {
    INTEGER id PK
    INTEGER account_id FK
    INTEGER unit_id FK
    VARCHAR serial
    INTEGER replaces_id FK,UK
  }
  utility_receipt_revisions {
    INTEGER id PK
    INTEGER receipt_id FK
    INTEGER revision
    DECIMAL amount
    VARCHAR currency
    INTEGER created_by FK
  }
  utility_receipts {
    INTEGER id PK
    INTEGER account_id FK
  }
  utility_responsibilities {
    INTEGER id PK
    INTEGER allocation_id FK
    INTEGER person_id FK
    INTEGER contract_id FK
    DECIMAL amount
  }
  utility_types {
    INTEGER id PK
    VARCHAR name UK
  }
  anticretico_adjustments ||--o{ anticretico_adjustment_lines : adjustment_id
  persons ||--o{ anticretico_adjustment_lines : holder_id
  persons ||--o{ anticretico_adjustment_lines : responsible_id
  finance_operations ||--o| anticretico_adjustments : operation_id
  finance_operations o|--o| anticretico_adjustments : void_operation_id
  anticretico_revisions ||--o{ anticretico_adjustments : revision_id
  persons ||--o{ anticretico_allocations : holder_id
  persons ||--o{ anticretico_allocations : responsible_id
  anticretico_movements ||--o{ anticretico_allocations : movement_id
  persons o|--o{ anticretico_holders : beneficiary_person_id
  persons ||--o{ anticretico_holders : person_id
  anticretico_revisions ||--o{ anticretico_holders : revision_id
  finance_movements ||--o| anticretico_movements : movement_id
  anticretico_revisions ||--o{ anticretico_movements : revision_id
  persons ||--o{ anticretico_responsibles : person_id
  anticretico_revisions ||--o{ anticretico_responsibles : revision_id
  anticretico_terms ||--o{ anticretico_revisions : contract_id
  finance_operations ||--o| anticretico_revisions : operation_id
  contracts ||--o| anticretico_terms : contract_id
  users o|--o{ audit_events : actor_id
  users ||--o{ auth_sessions : user_id
  communication_consents ||--o| communication_consent_heads : consent_id
  persons ||--o{ communication_consent_heads : person_id
  properties ||--o{ communication_consent_heads : property_id
  reminder_operations ||--o| communication_consents : operation_id
  reminder_operations o|--o| communication_consents : revoked_operation_id
  persons ||--o{ communication_consents : person_id
  properties ||--o{ communication_consents : property_id
  contracts ||--o{ contract_occupants : contract_id
  persons ||--o{ contract_occupants : person_id
  contracts ||--o{ contract_owners : contract_id
  persons ||--o{ contract_owners : person_id
  properties o|--o{ contracts : property_id
  persons ||--o{ contracts : responsible_person_id
  reservations o|--o| contracts : source_reservation_id
  units o|--o{ contracts : unit_id
  persons ||--o{ finance_accounts : person_id
  properties ||--o{ finance_accounts : property_id
  finance_obligations ||--o{ finance_adjustments : obligation_id
  finance_operations ||--o{ finance_adjustments : operation_id
  finance_obligations ||--o{ finance_applications : obligation_id
  finance_operations ||--o{ finance_applications : operation_id
  finance_operations o|--o{ finance_applications : void_operation_id
  finance_movements ||--o{ finance_applications : source_movement_id
  finance_applications o|--o| finance_applications : replaces_id
  finance_expenses ||--o{ finance_disbursements : expense_id
  finance_movements ||--o| finance_disbursements : movement_id
  finance_expenses ||--o{ finance_expense_adjustments : expense_id
  finance_operations ||--o{ finance_expense_adjustments : operation_id
  finance_accounts ||--o{ finance_expenses : account_id
  finance_categories ||--o{ finance_expenses : category_id
  finance_operations ||--o| finance_expenses : operation_id
  finance_operations o|--o| finance_expenses : void_operation_id
  utility_receipts o|--o| finance_expenses : receipt_id
  units o|--o{ finance_expenses : unit_id
  finance_accounts ||--o{ finance_guarantees : account_id
  contracts ||--o{ finance_guarantees : contract_id
  finance_movements ||--o| finance_guarantees : movement_id
  finance_operations o|--o| finance_guarantees : retained_operation_id
  finance_accounts ||--o{ finance_incoming : account_id
  finance_movements ||--o| finance_incoming : movement_id
  persons o|--o{ finance_movements : beneficiary_person_id
  persons ||--o{ finance_movements : payer_id
  finance_methods ||--o{ finance_movements : method_id
  finance_operations ||--o| finance_movements : operation_id
  finance_operations o|--o| finance_movements : void_operation_id
  finance_accounts ||--o{ finance_obligations : account_id
  finance_operations ||--o{ finance_obligations : operation_id
  contracts o|--o{ finance_obligations : rent_contract_id
  utility_responsibilities o|--o| finance_obligations : service_origin_id
  units o|--o{ finance_obligations : unit_id
  users ||--o{ finance_operations : created_by
  properties ||--o{ finance_operations : property_id
  finance_movements ||--o| finance_refunds : movement_id
  finance_movements ||--o{ finance_refunds : source_movement_id
  utility_distributions ||--o| finance_utility_imports : distribution_id
  finance_operations ||--o| finance_utility_imports : operation_id
  finance_obligations ||--o{ finance_utility_links : obligation_id
  utility_responsibilities ||--o| finance_utility_links : responsibility_id
  utility_meters ||--o{ meter_readings : meter_id
  finance_movements o|--o| payment_report_decisions : movement_id
  reminder_operations ||--o| payment_report_decisions : operation_id
  reported_payments ||--o{ payment_report_decisions : report_id
  properties ||--o{ property_access : property_id
  users ||--o{ property_access : user_id
  persons ||--o{ property_contacts : person_id
  properties ||--o{ property_contacts : property_id
  persons ||--o{ property_owners : person_id
  properties ||--o{ property_owners : property_id
  reminder_notices ||--o{ reminder_attention_events : notice_id
  reminder_operations ||--o| reminder_attention_events : operation_id
  reminder_communications ||--o{ reminder_communication_events : communication_id
  reminder_operations ||--o| reminder_communication_events : operation_id
  reminder_operations o|--o| reminder_communications : authorization_operation_id
  reminder_operations ||--o| reminder_communications : operation_id
  communication_consents ||--o{ reminder_communications : consent_id
  reminder_notices ||--o{ reminder_communications : notice_id
  reminder_templates o|--o{ reminder_communications : template_id
  reminder_preferences ||--o{ reminder_lead_days : property_id
  anticretico_terms o|--o{ reminder_notices : capital_contract_id
  contracts o|--o| reminder_notices : contract_id
  finance_expenses o|--o| reminder_notices : expense_id
  persons o|--o{ reminder_notices : holder_id
  persons o|--o{ reminder_notices : responsible_id
  finance_obligations o|--o| reminder_notices : obligation_id
  utility_receipts o|--o| reminder_notices : receipt_id
  reported_payments o|--o| reminder_notices : report_id
  users ||--o{ reminder_operations : created_by
  properties ||--o{ reminder_operations : property_id
  reminder_operations ||--o| reminder_preferences : operation_id
  properties ||--o| reminder_preferences : property_id
  reminder_preferences ||--o{ reminder_recipients : property_id
  users ||--o{ reminder_recipients : user_id
  reminder_operations ||--o| reminder_templates : operation_id
  properties ||--o{ reminder_templates : property_id
  reminder_preferences ||--o{ reminder_type_preferences : property_id
  finance_accounts o|--o{ reported_payments : account_id
  finance_methods ||--o{ reported_payments : method_id
  finance_obligations o|--o{ reported_payments : obligation_id
  reminder_operations ||--o| reported_payments : operation_id
  persons ||--o{ reported_payments : reporting_person_id
  persons ||--o{ reservations : person_id
  properties o|--o{ reservations : property_id
  units o|--o{ reservations : unit_id
  properties ||--o{ service_accounts : property_id
  utility_types ||--o{ service_accounts : type_id
  properties ||--o{ units : property_id
  persons ||--o{ users : person_id
  utility_distributions ||--o{ utility_allocations : distribution_id
  units o|--o{ utility_allocations : unit_id
  utility_configurations ||--o{ utility_configuration_units : configuration_id
  units ||--o{ utility_configuration_units : unit_id
  service_accounts ||--o{ utility_configurations : account_id
  users ||--o{ utility_configurations : created_by
  persons o|--o{ utility_configurations : owner_person_id
  persons o|--o{ utility_configurations : provider_payer_id
  persons o|--o{ utility_configurations : reimbursement_person_id
  utility_distributions ||--o| utility_current_distributions : distribution_id
  utility_receipts ||--o| utility_current_distributions : receipt_id
  utility_configurations ||--o{ utility_distributions : configuration_id
  users o|--o{ utility_distributions : confirmed_by
  users ||--o{ utility_distributions : created_by
  utility_receipt_revisions ||--o{ utility_distributions : receipt_revision_id
  utility_distributions o|--o{ utility_distributions : supersedes_id
  service_accounts ||--o{ utility_meters : account_id
  utility_meters o|--o| utility_meters : replaces_id
  units o|--o{ utility_meters : unit_id
  users ||--o{ utility_receipt_revisions : created_by
  utility_receipts ||--o{ utility_receipt_revisions : receipt_id
  service_accounts ||--o{ utility_receipts : account_id
  utility_allocations ||--o{ utility_responsibilities : allocation_id
  contracts o|--o{ utility_responsibilities : contract_id
  persons o|--o{ utility_responsibilities : person_id
```


## Cierre de la auditoría de fase 7

Se conservan las 63 tablas heredadas, con cero tablas/columnas nuevas. No se necesita descomposición ni migración 0009 para los reportes: sus importes son proyecciones temporales de los hechos existentes. La conclusión de 3FN se limita a los dominios y DF aquí enumerados; no afirma integridad interrelacional, vigencias legales ni completitud de auditoría que SQL no garantice.

El diagrama usa nombres reales de columnas PK/FK y candidatas; omite atributos descriptivos secundarios para facilitar su lectura. El inventario JSON y las secciones R contienen todas las columnas y restricciones. UK nullable no significa candidata global.

La prueba `test_original_charge_unit_is_historical_fact_not_current_contract_copy` produce dos cargos válidos del mismo contrato con unidades originales distintas tras cambiar un contrato futuro. Por tanto, no existe la supuesta DF `rent_contract_id → unit_id` de los cargos históricos. No se eliminan esas referencias como si fueran copias del contrato actual. Las pruebas de cambio de responsable/moneda de fase 4 y los reportes históricos conservan el mismo criterio.

Los documentos JSON heredados son respuestas/eventos/evidencias históricos completos; las relaciones operativas de ocupantes, titulares, asignaciones, responsabilidades y aplicaciones existen en tablas con FK. Los reportes consultan esas relaciones, no reemplazan el libro por JSON de auditoría. La reutilización de filas ya bloqueadas se limita a una Session y se elimina al salir; no persiste una caché o tabla de saldos.

Límites funcionales conservados: titularidad actual sin vigencias legales; referencias polimórficas de auditoría sin FK universal; algunas coincidencias entre ámbitos se verifican en servicios y no con FK compuestas; fichas contractuales e inventario no reconstruibles como estados históricos certificados. Son observaciones de funcionalidad/integridad, no una DF transitiva demostrada que justifique crear nuevas tablas. El backend las comunica en los reportes.

Las migraciones históricas se contrastan por SHA-256 y el esquema real por columnas, claves, FK y restricciones. Los resultados ejecutados se documentan en `phase-7-tests.md`; las pruebas complementan y no sustituyen este análisis conceptual.
