# Fase 2: alcance, dependencias y aceptación

Base: main integrado `437b30d030280eabfe8beb45e482dfe9a82ecd5c`. Rama local `phase-2-contracts-occupancy`. No modificar revisiones 0001–0003 ni publicar cambios.

## Dependencias

Fases 0/1/1.1, MySQL 8.4, SQLAlchemy/Alembic, FastAPI y React/TypeScript existentes. Sin dependencias nuevas ni servicios externos.

## Reglas que se implementarán

- Fechas de ocupación inclusivas [entrada,salida]; tocar la salida de otro contrato produce conflicto. Se permite comenzar al día siguiente. Las noches afectan solo al conteo del precio.
- Contratos diarios, semanales y mensuales con condiciones económicas explícitas, sin generar deudas o movimientos. Diario siempre incluye servicios. Anticrético solo contractual, sin capital. Mixto únicamente borrador sin activación ni cálculo combinado.
- Contratos con responsable y ocupantes adicionales vinculados a personas. Propietarios firmantes seleccionados en el formulario y conservados al activar; para altas vigentes de fechas pasadas se exige selección explícita. No se reconstruyen desde titulares actuales. Un borrador propone los titulares actuales y permite corregirlos antes de activar.
- Borrador → vigente/cancelado; vigente → finalizado, con finalización anticipada o prórroga validada. Cancelación de contratos vigentes solo antes de la entrada; después corresponde finalización para conservar ocupación real. Sin borrado físico.
- Reservas pendientes/confirmadas bloquean; canceladas/vencidas no. Conversión de reserva confirmada atómica e idempotente, sin conflicto consigo misma.
- Disponibilidad calculada a partir de contratos, reservas, habilitación y mantenimiento. Consulta actual y por intervalo; detalle por casa y cuarto e historial de personas ocupantes.
- Comprobaciones de solapamiento y recursos mediante lecturas actuales con FOR UPDATE, serializadas por propiedad para evitar carreras incluso con el aislamiento REPEATABLE READ de MySQL.
- Administrador general y de propiedades gestionan contratos en su ámbito. Operadores preparan borradores y gestionan reservas de propiedades asignadas; no activan/finalizan contratos. Propietarios solo consultan. Las personas candidatas se limitan al ámbito autorizado, sin exponer personas de casas ajenas.

## Aceptación

Las 22 pruebas del pedido y meses de 28/29/30/31 días; carreras reales MySQL casa/cuarto y reservas; migración limpia y desde 0003; regresión completa; flujo guiado en navegador de escritorio y móvil con capturas. Informe, diagrama y análisis 3FN. Mantener todos los resultados fallidos/omitidos visibles y resolver los fallos de implementación antes de entregar.
