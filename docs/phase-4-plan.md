# Fase 4: dependencias y aceptación

Base: `origin/main` en `8b5e3d1`, con 25 tablas de las fases anteriores. Rama local `phase-4-payments-finances`. No se publicará ni se iniciará fase 5.

Dependencias: identidad/personas y alcance por propiedad; contratos y periodos de fase 2; recibos y distribuciones confirmadas de fase 3; auditoría y MySQL 8.4. No modificar migraciones 0001–0005.

Diseño previo:

- Separar obligación económica, movimiento real de dinero y aplicación. Agrupar saldos por persona, propiedad y moneda, sin conversiones ni transferencias implícitas.
- Generación explícita e idempotente de alquileres con vista previa. No interpretar texto libre como tarifa pactada. Periodos finales incompletos, vencimientos personalizados y condiciones semanales insuficientes requieren decisión escrita; conservar fuentes y versiones.
- Importar únicamente distribuciones vigentes confirmadas. Conservar el origen de cada responsabilidad; posteriores versiones ajustan obligaciones existentes, nunca pagos históricos. Liberar aplicaciones sobrantes hacia su fuente original cuando se reduce un importe ya cubierto.
- Separar cobros/anticipos, garantías, desembolsos a gastos, pago directo de inquilino al proveedor y devoluciones. Los pagos directos no se presentan como caja del propietario.
- Operaciones con identificador y huella de solicitud, transacciones y bloqueo de propiedad compartido con fases 2/3. Datos económicos originales inmutables; anulaciones y ajustes trazables.
- Operadores registran operaciones ordinarias; ajustes sensibles, anulaciones, uso/devolución de garantías y devoluciones de anticipos requieren administrador de la casa. Propietarios consultan.
- Referencias de comprobantes externos; no almacenar archivos subidos sin un mecanismo seguro de almacenamiento. No procesos fiscales, capital anticrético, mensajería ni PDF.

Aceptación: los 46 casos de la solicitud, concurrencia en conexiones MySQL independientes, migración limpia y con datos de las 25 tablas anteriores, análisis 3FN por dependencias, frontend completo con resumen y detalle coherentes, pruebas backend/React/navegador, TypeScript/build/Alembic, capturas escritorio/móvil, revisión de secretos y commit local limpio.
