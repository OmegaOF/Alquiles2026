# Entrega de fase 0

## Funcionalidades implementadas

Arquitectura independiente de Pisco Ñawi IA: FastAPI/Uvicorn, SQLAlchemy, MySQL 8.4, Alembic, React 18 y TypeScript. Pantalla de inicio en español con diseño adaptable, texto base de 18 px, controles grandes, foco visible y comprobación real de conexión. API de estado con respuestas validadas, CORS restringido y errores de conexión sin datos sensibles. Variables de ejemplo y dependencias fijadas. Sin lógica de negocio de fases posteriores.

## Archivos y módulos principales

`backend/app/{api,core,db,models,schemas,services}`, `backend/tests`, `backend/migrations`, `frontend/src`, `frontend/tests`, `frontend/e2e`, `compose.yaml`, `.env.example`, `scripts/install.sh`, `scripts/check.sh`, `README.md`, `docs/architecture.md` y `.github/workflows/phase-0.yml`. La configuración de CI quedó preparada; no se ejecutó en GitHub durante esta tarea.

## Migraciones

`0001_baseline`: punto inicial sin tablas de negocio. Solo existe `alembic_version`. Se ejecutaron upgrade, downgrade a base y nuevo upgrade sobre la base local nueva, sin datos reales. `alembic check` no detectó diferencias.

## Pruebas y resultados

- Backend: 6 aprobadas, incluyendo integración real con MySQL, revisión de migración, estado HTTP, CORS y error 503 sin información sensible. No hubo pruebas omitidas en la ejecución con RUN_MYSQL_TESTS=1.
- Frontend: 3 pruebas de componentes aprobadas: estructura accesible, conexión y recuperación ante error.
- Integración Chromium: 4 aprobadas, escritorio 1440 px y móvil 390 px; React → API → MySQL y recuperación tras respuesta 503 simulada. Sin errores JavaScript ni desbordamiento horizontal en esos tamaños.
- TypeScript y compilación Vite: aprobados.
- Reinstalación mediante script y lockfiles: aprobada; `pip check` sin conflictos.
- Auditoría npm: sin vulnerabilidades reportadas en la última ejecución. Esto no sustituye la revisión integral de seguridad de fase 8.
- Inspección visual de la pantalla renderizada realizada en Chromium.

Se resolvieron fallos iniciales de infraestructura de pruebas: falta del navegador Playwright y caché de procesos que seguían abiertos durante la reinstalación. Se usó Chromium del sistema y se reiniciaron los servidores propios antes de la validación final. No se deshabilitó verificación TLS ni integridad de paquetes.

## Problemas conocidos y límites

Starlette advierte que su cliente de pruebas con httpx será sustituido por httpx2; las pruebas pasan actualmente. No hay autenticación, autorización por propietario, tablas de negocio, gráficos ni PDF: pertenecen a fases posteriores. Las pruebas financieras y de ocupación no aplican todavía. No es un despliegue productivo ni una certificación de accesibilidad. La validación automatizada se hizo con Python 3.12 y Node 24; otras versiones declaradas no se ejecutaron aquí.

La descarga de Chromium de Playwright está bloqueada por la política de red del entorno; el navegador del sistema permite ejecutar las pruebas sin ampliar destinos. Los procesos deben iniciarse de nuevo después de restaurar una máquina. La publicación del entorno y el envío del código a GitHub no se realizaron como parte de esta entrega.

## Configuración del entorno cloud

Se guardaron `install_script` y `start_skill` en el borrador del entorno: instalación reproducible, arranque de MySQL/API/frontend y comprobaciones. Guardar el borrador no publica ni valida una restauración en una tarea nueva. Revisar y guardar los cambios en la configuración del entorno y publicar desde el producto cuando corresponda. El commit permanece local; no se ha probado su recuperación desde otra tarea.

## Cómo probarlo

Seguir README para iniciar MySQL, aplicar migraciones y ejecutar backend y frontend. Abrir el puerto 5173 en el navegador del entorno; pulsar “Comprobar conexión”. Debe indicar conexión correcta. Reducir la ventana o usar un teléfono/tableta para revisar el diseño. Las tarjetas “Próximamente” informan sobre etapas futuras y no son acciones disponibles.

## Fases anteriores

No hay fases previas de este proyecto nuevo. No se modificaron proyectos externos ni datos reales. La fase 1 no se ha iniciado y requiere aprobación expresa del usuario.
