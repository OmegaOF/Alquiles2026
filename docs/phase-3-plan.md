# Fase 3: dependencias y aceptación previa

Base `origin/main` integrado `d0334b8`, rama `phase-3-utilities-billing`. Se conservan migraciones 0001–0004 y funciones anteriores. Sin publicación ni fase 4.

## Dependencias

Identidades y permisos de fases 1/1.1; contratos, firmantes, condiciones y salidas reales de fase 2. FastAPI, SQLAlchemy, Alembic, React/TypeScript y MySQL 8.4 existentes. Dos bases nuevas y descartables terminadas en `_test`; sin datos reales ni nuevas dependencias de aplicación.

## Decisiones y aceptación

- Registrar recibos externos, sin emisión comercial/tributaria, impuestos, pagos, deudas ni movimientos efectivos. Distinguir responsabilidades económicas y personas previstas para pagar al proveedor/recibir reintegros.
- Tipos configurables, varias cuentas por casa, medidores físicos reemplazables y lecturas monotónicas con historial. Servicios sin medidor válidos.
- Cuenta → configuraciones inmutables; recibo lógico → revisiones inmutables; distribución → importes por espacio → responsabilidades por persona/contrato. Un vínculo único por recibo identifica el reparto actualmente aprobado, conservando los anteriores.
- Doce tablas nuevas; no duplicar nombres, dirección ni casa derivable de unidades, cuenta o recibo. Documentar claves y DF de cada relación hasta 3FN. La evidencia de cálculo se conserva como documento histórico, no como segunda fuente operacional de identidades.
- Partes iguales, porcentajes, personas-día explícitos, lecturas y asignación manual. Lecturas inicial/final de cada periodo y segmentos de reemplazo; un componente fijo del recibo se distribuye por igual y el variable por consumo.
- Ocupación inclusiva dentro del periodo real del recibo, hasta la salida real. Menos de 15 días: importe del espacio × días / días reales; desde 15: parte completa. Diario y servicios incluidos: nunca responsabilidad adicional del ocupante. Servicio a cargo del propietario: nunca trasladarlo al inquilino.
- Varios contratos sucesivos sin exceso se calculan; exceso, historial contractual ambiguo, copropietarios sin responsable explícito o evidencia incompleta requieren revisión. No inferir responsabilidades de porcentajes de propiedad.
- Casa completa se presenta como un solo espacio; si hay mezcla de casa/cuarto en el mismo periodo se exige revisión contextual y no se duplica el importe.
- Decimal, centavos por restos mayores y desempate estable. Suma exacta por espacio y por recibo. Cambios manuales con motivo y evidencia, sin permitir gastos adicionales para diario/incluidos.
- Bloqueo de propiedad compartido con fase 2 y lecturas actuales FOR UPDATE en comprobaciones críticas. Control obligatorio de versiones para editar/resolver/confirmar; confirmación atómica y una sola vigente. No sobreescribir aprobaciones al recalcular.
- Administradores gestionan y confirman en su ámbito; operador registra/consulta/calcula propuestas, sin confirmar ni resolver decisiones; propietario consulta. Datos de personas limitados a las casas autorizadas.
- Pantallas reales en español: servicios, medidores/lecturas, recibos, cálculo/revisión/confirmación e historial; navegación de casa → recibo → método → cálculo → revisión → confirmación, con texto grande y confirmaciones.
- Ejecutar los 34 criterios del pedido, casos extremos, migración limpia/con datos y reversión descartable, MySQL concurrente, regresión completa, React, TypeScript/Alembic y navegador escritorio/móvil con capturas. Documentar resultados reales y limitaciones antes de commit local.
