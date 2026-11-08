# Fase 5: dependencias y aceptación

Base: `origin/main` en `b4450db7293c482313833377a5fa19fbe4bdf45b`, 41 tablas anteriores. Rama local `phase-5-anticreticos-capital`; commit local al finalizar, sin publicar, integrar ni iniciar fase 6.

Dependencias: contratos/ocupación y disponibilidad de fase 2; repartos confirmados de fase 3; movimientos, métodos, operación idempotente, permisos y auditoría de fase 4. Las migraciones 0001–0006 permanecen intactas.

Decisiones previas:

- Complementar cada contrato anticrético con condiciones económicas versionadas, sin otra ocupación y sin usar `price` como capital. Los contratos antiguos sin condiciones económicas muestran información pendiente.
- Reutilizar `finance_movements` una sola vez por entrega/restitución, con subtipos de capital; excluirlos de alquileres, garantías, anticipos, aplicaciones ordinarias y gastos.
- Titulares, beneficiarios y responsables se eligen explícitamente. Las participaciones de propiedad/firmantes no asignan capital. Cada movimiento documenta sus importes por pareja titular/responsable; ambas dimensiones suman el mismo dinero, no dos capitales.
- Importes acordados no generan dinero. Saldos derivados de entregas, restituciones y acuerdos no monetarios válidos. Ajustes de restitución requieren documento, motivo y administrador; no saldan servicios automáticamente.
- Conservar condiciones, identidades y movimientos anteriores. Cambiar espacio, moneda o modalidad de un contrato con condiciones económicas requiere otro contrato, preservando el historial. Prórroga/finalización de ocupación por la operación existente de fase 2.
- Bloqueo por propiedad, lecturas actuales MySQL, claves idempotentes, versiones y comprobación de presupuestos por titular/responsable/pareja. Anulación que origine saldo negativo se rechaza.
- Catálogo de métodos y sesión existentes. Operador registra entregas ordinarias; administradores autorizan devoluciones, cambios de condiciones, ajustes y anulaciones. Propietarios consultan.
- Fechas de entrega prevista, restitución y ocupación independientes. Próximos vencimientos y vencidos son consultas de pantalla, sin recordatorios automáticos.

Aceptación: 52 criterios de la solicitud, MySQL descartable real y carreras con conexiones independientes, migración limpia y con las 41 tablas anteriores pobladas, demostración 3FN, React/TypeScript/build/Alembic, regresión 0–4, navegador escritorio/móvil, capturas, revisión de secretos y commit local limpio.
