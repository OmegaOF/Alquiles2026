# Fase 6: preparación y criterios de aceptación

Base comprobada: `origin/main` en `e078aaf64da189657d6435939309fb0f2e0b75ae`; Actions [42440450286](https://github.com/OmegaOF/Alquiles2026/actions/runs/42440450286) aprobado. Incluye 49 tablas, migraciones 0001–0007 y la preparación explícita de «Servicios básicos» en el E2E de anticréticos. La corrección anterior está integrada: se conserva, sin rehacer fase 5.

Rama local: `phase-6-reminders-whatsapp`. Entrega con commit local y árbol limpio; no publicar, modificar main, hacer merge ni iniciar fase 7.

## Dependencias y decisiones previas

- Personas: reutilizar `persons.phone/whatsapp`, identidad, sesión y permisos por propiedad. No existen modelos de consentimiento ni pagos reportados en la base inicial.
- Fechas: `tenancy.today()` calcula America/La_Paz desde UTC. Reutilizarlo, sin depender del reloj del navegador.
- Obligaciones y recuperaciones: `finances.obligation_dict/obligation_values`, aplicaciones y movimientos válidos de fase 4. Un mismo servicio conserva su identidad aunque pase a recuperación después del pago al proveedor.
- Facturas del propietario: recibo/revisión vigente y gasto/pagos vinculados. Distinguir recibo aún sin gasto, gasto registrado y desembolso; nunca sumar como dos deudas el recibo y su gasto asociado.
- Contratos: usar fechas y estados vigentes de fase 2. Capital: saldos por pareja titular/responsable de fase 5, sin tratarlo como renta.
- Consultar avisos no inserta obligaciones ni movimientos. Las identidades y el estado de atención solo se persisten cuando hay acciones/historial; importes y vencimientos siguen en sus fuentes.
- Preferencias por propiedad, días previos y destinatarios internos en relaciones separadas; plantillas configurables con campos permitidos. Revisado no paga; se reactiva en el siguiente hito o ante cambios relevantes. Posposición limitada, sin cambiar vencimientos.
- Consentimiento por persona, propiedad y propósito, explícito, revocable y con auditoría. La migración no autoriza contactos existentes. Número internacional validado; ayuda 591 solo por elección expresa.
- Preparación, validación final, apertura y confirmación manual son acciones distintas. Validar otra vez saldo/fecha/destinatario/consentimiento antes de entregar el enlace oficial; rechazar vistas obsoletas. No existe envío automático ni estado de entrega/lectura.
- Pagos reportados son afirmaciones pendientes, sin efecto monetario. Para verificarlos se vincula un movimiento real válido del módulo financiero; si falta, el usuario lo registra primero en Pagos y gastos. No se duplica el servicio de caja ni se convierte un reporte en dinero por sí solo.
- Operaciones propias de recordatorios con idempotencia, auditoría y bloqueo por propiedad, compartiendo orden de bloqueo con fases anteriores. No usar operaciones de comunicación como movimientos financieros.

## Riesgos que se verificarán

Saldos/fechas cambiados después de preparar texto; revocación/cambio de número; destinatario ajeno aunque sea contacto de la misma casa; concurrencia de acciones/confirmaciones; doble clic; apertura bloqueada por navegador; ocultación indefinida al revisar; datos sin fecha; monedas; reactivación al anular pagos; vinculación incorrecta o duplicada de reportes.

## Aceptación

Los 56 casos de la solicitud; migración 0008 limpia y up/down/up con las 49 tablas pobladas; claves, FK, restricciones y demostración 3FN; MySQL real y conexiones independientes; regresión completa backend/React/TypeScript/build/Playwright. Cada E2E prepara sus catálogos, sin cargas manuales ni suponer que Alembic reejecute datos iniciales. Capturas de escritorio/móvil, mensajes comprensibles y ausencia de comunicación automática externa. Documentar resultados reales, fallos y límites en los tres informes de fase 6.
