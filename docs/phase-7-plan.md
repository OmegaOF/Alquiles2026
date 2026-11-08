# Preparación de fase 7

Base exacta: `967176433c616a5a6378dd44adae00adb03c10c1`, integración de fase 6 en origin/main. Rama nueva `phase-7-dashboard-reportes-pdf`; main no se modifica. [Actions de la base](https://github.com/OmegaOF/Alquiles2026/actions/runs/42502312766): completed/success, 2026-11-08T17:14:37Z.

Dependencias: identidad y alcance por propiedad (1/1.1), fechas y ocupación (2), repartos confirmados/versionados (3), obligaciones/aplicaciones/caja (4), capital real (5), atención personal y pagos reportados (6). Se inspeccionó MySQL 8.4.13 nuevo: 63 tablas más alembic_version, revisión 0008. [Auditoría previa de DF/3FN](phase-7-normalization.md).

Diseño: consultas masivas acotadas a propiedades autorizadas → hechos a fecha de corte → una proyección financiera → indicadores, series, tablas y PDF. Las reglas puras de conciliación se comparten con los servicios vigentes. El contexto original del cargo no se reemplaza por el contrato actual. Las consultas no escriben dinero, avisos ni exportaciones. No hacen falta entidades nuevas ni una migración 0009 para almacenar reportes: se generan a petición sin persistir saldos.

Flujos usan fechas de negocio; la fecha de registro de operación se interpreta en America/La_Paz, con instantes UTC en SQL. Estados financieros reconstruyen hechos conocidos al corte, considerando creación, anulaciones, sustitución de aplicaciones y ajustes. Las limitaciones de historiales no versionados se muestran expresamente. Sin conversiones monetarias, sin atribuir participaciones personales por porcentajes de copropiedad.

Dependencias nuevas justificadas: ECharts para gráficos solicitados; ReportLab para PDF vectorial con tablas paginadas; pypdf exclusivamente en pruebas para comprobar contenido y páginas. No se añaden servicios externos ni almacenamiento económico duplicado.

Aceptación: diez vistas de reportes, resumen legible, siete gráficos, filtros autorizados, importes Decimal/cadenas, monedas separadas, estados históricos honestos, conciliación sin multiplicación por JOIN, PDF con los mismos datos/filtros. Backend completo con MySQL descartable, migraciones históricas, React, TypeScript, build, Playwright escritorio/móvil y lectura PDF reales. Evidencias ficticias y documentación final; commit local y árbol limpio, sin publicar, merge ni fase 8.
