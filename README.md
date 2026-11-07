# Mi Casa · Administración de propiedades

Fase 4: importes por cobrar, pagos recibidos, deudas, anticipos, garantías, gastos y desembolsos reales, sobre los contratos y servicios de las fases anteriores. Backend FastAPI/SQLAlchemy/MySQL y frontend React 18/TypeScript, independientes de Pisco Ñawi y del sistema antiguo. Obligaciones, dinero real y aplicaciones se conservan separados y con historial. Capital anticrético y recordatorios siguen pendientes. No se emiten documentos comerciales o tributarios.

Entrega, esquema 3FN, pruebas y capturas: [informe de fase 4](docs/phase-4.md), [resultados de pruebas](docs/phase-4-tests.md) y [API de fase 4](docs/phase-4-api.md). Entrega anterior: [fase 3](docs/phase-3.md).

## Requisitos e instalación

Python 3.11+ (validado con 3.12), Node 22/24 (validado con 24), Docker Compose y MySQL 8.4.

Desde la raíz:

```bash
cp .env.example .env
# Cambiar las claves locales de MySQL y hacer coincidir DATABASE_URL.
bash scripts/install.sh
docker compose up -d --wait mysql
cd backend
../.venv/bin/alembic upgrade head
../.venv/bin/python -m app.bootstrap --username mi_administrador --full-name "Administrador general"
```

El último comando pide y confirma una contraseña de **12 a 128 caracteres**, sin mostrarla. No existe una contraseña inicial predeterminada. Solo permite crear el primer administrador; después las cuentas se crean desde la interfaz. No pasar contraseñas como argumentos ni guardarlas en archivos versionados. `.env.example` solo contiene valores públicos para la base local de desarrollo; `.env` queda excluido de Git.

**Bases existentes:** antes de aplicar migraciones, detener escritores, hacer y verificar un respaldo y leer [recuperación de 0003](docs/phase-1.1-migration.md), [migración 0004](docs/phase-2.md#migración-y-recuperación), [migración 0005](docs/phase-3.md#migración-y-recuperación) y [migración 0006](docs/phase-4.md#migración-y-recuperación). MySQL no revierte automáticamente todos los DDL. Revisar las migraciones antes de aplicarlas. Las pruebas usaron únicamente bases descartables, nuevas y con datos ficticios representativos. No migrar bases de otros proyectos.

## Arranque y navegador

En una terminal, desde `backend`:

```bash
../.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

En otra terminal, desde `frontend`:

```bash
npm run dev
```

En tu computadora abre `http://localhost:5173`; en cloud utiliza el navegador o el puerto 5173 del entorno. Inicia sesión con la cuenta creada. Vite redirige `/api` al backend local; así las cookies permanecen en el mismo origen, también al acceder desde el teléfono. Deja `VITE_API_BASE_URL` vacío en `frontend/.env.local` para usar este comportamiento.

Para un dominio de desarrollo remoto, añadir su origen exacto a `CORS_ORIGINS` en `.env`. Para producción se requiere HTTPS, `APP_ENV=production`, frontend compilado y un proxy que sirva `/api` desde el mismo sitio. Las cookies se marcan Secure fuera de development. No usar Vite como servidor productivo ni rebajar la protección de cookies para conectar dominios distintos. `VITE_API_BASE_URL` es un override avanzado para configuraciones compatibles del mismo sitio.

## Probar cada pantalla

1. **Personas:** pulsa “Registrar persona”, completa nombre y marca propietario. Documento y contactos son opcionales. Guarda y confirma. Puedes editar el registro sin crearle una cuenta de acceso.
2. **Propiedades:** pulsa “Registrar propiedad”, completa nombre, dirección y ciudad, selecciona uno o varios propietarios. La participación es opcional; si se indica, la suma no puede superar 100%. Selecciona administradores autorizados si ya existen. Guarda y confirma.
3. **Detalle:** pulsa “Ver propiedad”. Revisa sus dueños y usa “Editar propiedad”. Deshabilitar conserva sus datos e historial.
4. **Cuartos:** en el detalle pulsa “Registrar cuarto”. El número debe ser único en esa casa. “Editar cuarto” permite cambiar descripción, habilitación y mantenimiento; estos estados no representan ocupación ni reserva.
5. **Usuarios y permisos:** elige una persona existente o “Registrar persona nueva” para crear su identidad junto con la cuenta; después define rol y propiedades autorizadas. El nombre se corrige en Personas y se actualiza en todas sus cuentas. El alias opcional identifica la cuenta y se mantiene independiente. Para el rol propietario, vincula una persona propietaria. Puedes cambiar permisos, contraseña o deshabilitar cuentas; los cambios sensibles terminan las sesiones anteriores. No se puede desactivar al último administrador general.
6. **Inicio:** “Comprobar conexión” conserva la comprobación real de API y MySQL de fase 0.
7. **Cerrar sesión:** confirma para salir. Una sesión dura como máximo ocho horas.
8. **Contratos:** “Registrar contrato” guía ocho pasos: casa, espacio, modalidad, personas y firmantes, fechas, condiciones, resumen y confirmación. Un borrador no bloquea fechas; un contrato vigente sí. Se puede modificar, prorrogar o finalizar con historial. Entrada y salida están incluidas para ocupar el inmueble.
9. **Reservas:** registra persona, casa/cuarto y fechas. Confirma, cancela o convierte una reserva confirmada en contrato. Una reserva vencida libera las fechas aunque todavía no se haya registrado manualmente su vencimiento.
10. **Disponibilidad:** selecciona una casa y el intervalo. Se muestran la casa completa y todos sus cuartos con el motivo de cada estado. El detalle de cada propiedad también muestra la situación de hoy.
11. **Ocupantes e historial:** consulta las personas actuales y las estancias finalizadas, con cambios de fechas y personas. Los inquilinos pueden registrarse en los formularios sin cuentas de usuario.
12. **Servicios básicos:** selecciona casa y registra suministros, sus cuartos o casa completa y responsables previstos. En **Medidores y lecturas** registra equipos, valores o reemplazos. Los servicios fijos pueden funcionar sin medidor.
13. **Recibos y distribución:** copia un recibo existente del proveedor, elige método, calcula y revisa importes/días. Un administrador confirma; los casos ambiguos requieren resolución justificada. **Historial de servicios** conserva correcciones y repartos anteriores. Registrar o confirmar un reparto no registra un pago.
14. **Pagos y gastos:** selecciona casa. En **Por cobrar**, genera alquileres con vista previa o importa repartos confirmados. En **Registrar pago**, selecciona titular, pagador real y conceptos que cubre. El sobrante requiere elección expresa; **Anticipos** permite aplicarlo después sin registrar otra entrada.
15. **Garantías y gastos:** registra garantías separadas de renta; su aplicación/devolución exige autorización. Registra gastos y luego sus pagos reales, incluso parciales. **Recuperación de servicios** permite pagar un recibo antes de repartirlo y distingue el pago al proveedor de lo recibido después del inquilino. Consulta resumen por moneda e historial; instrucciones completas en el informe de fase 4.

## Permisos iniciales

| Rol | Propiedades visibles | Acciones |
| --- | --- | --- |
| Administrador general | Todas | Personas, propiedades, cuartos, cuentas y permisos; archivado de propiedades |
| Administrador de propiedades | Asignadas por el administrador general | Editar datos y cuartos; sin cambiar propietarios, accesos ni archivar propiedades |
| Propietario | Donde la persona vinculada sea propietaria | Consulta de propiedades, propietarios relacionados y cuartos |
| Operador | Asignadas | Consulta y alta/edición/habilitación/mantenimiento de cuartos |

Los permisos se verifican en el backend en cada solicitud, incluso si se manipula la interfaz o los identificadores. Las cuentas no habilitadas no pueden iniciar sesión. En fase 2 los administradores gestionan contratos vigentes; el operador prepara borradores y gestiona reservas de casas asignadas; el propietario solo consulta sus casas. En fase 3 los administradores registran, revisan y confirman repartos; el operador registra datos y calcula propuestas, sin confirmar ni corregir decisiones aprobadas; el propietario consulta. El historial solo se consulta dentro del mismo ámbito autorizado. No existe un visor global de auditoría para roles restringidos.

## Pruebas

Con una base de desarrollo preparada:

```bash
bash scripts/check.sh
```

Ejecuta migraciones, health/ready, pruebas SQLite, React y compilación. Los casos repetidos contra MySQL **solo** se habilitan con `PHASE1_TEST_DATABASE_URL`, cuyo nombre de base debe terminar en `_test`; el fixture borra y recrea sus tablas. Nunca apuntar esa variable a datos que deban conservarse. `DATABASE_URL` también debe apuntar a una base descartable para probar migraciones de ida/vuelta.

```bash
# Las dos URL deben configurarse de forma segura para una base descartable terminada en _test.
export RUN_MYSQL_TESTS=1
cd backend
../.venv/bin/alembic upgrade head
../.venv/bin/pytest -q
../.venv/bin/alembic check
```

Sin MySQL: desde `backend`, ejecutar `../.venv/bin/pytest -m 'not integration'`. La repetición MySQL se registra como omitida si falta su variable; no se cuenta como aprobada.

**Navegador:** iniciar ambos servidores contra una base descartable y crear un administrador de pruebas. Configurar `E2E_USERNAME` y `E2E_PASSWORD` sin incluirlos en Git; los E2E crean personas, propiedades y cuentas ficticias.

```bash
cd frontend
# Con Chromium del sistema:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
# Si no está instalado: npx playwright install chromium; npm run test:e2e
```

Las pruebas adicionales de migración requieren `PHASE11_MIGRATION_DATABASE_URL`, `PHASE2_MIGRATION_DATABASE_URL`, `PHASE3_MIGRATION_DATABASE_URL` y `PHASE4_MIGRATION_DATABASE_URL`, con bases descartables terminadas en `_test`; pueden compartir una base de CI solo cuando se ejecutan secuencialmente. Para ejecutar todas las comprobaciones, configura las cuatro y `PHASE1_TEST_DATABASE_URL`; revisa que no aparezcan omisiones. No ejecutes pruebas que recrean tablas mientras utilizas el navegador contra la misma base.

Para regenerar las capturas de fase 2 con datos ficticios: `CAPTURE_PHASE2_SCREENSHOTS=1 npm run test:e2e -- tenancy.spec.ts` desde frontend, con las mismas credenciales temporales y Chromium configurados.

Las capturas de fase 3 se regeneran con `CAPTURE_PHASE3_SCREENSHOTS=1 npm run test:e2e -- utilities.spec.ts`. Las de fase 4 usan `CAPTURE_PHASE4_SCREENSHOTS=1 npm run test:e2e -- finances.spec.ts`. La entrega de fase 4 tiene 276 pruebas backend, 34 React y 38 recorridos de navegador aprobados; ver [registro completo](docs/phase-4-tests.md).

La suite usa 1440 px y 390 px; también verifica sesión desde localhost. La configuración de CI ejecuta estos pasos sobre MySQL descartable, sin credenciales de usuarios reales.

## Organización y migraciones

- `backend/app/{models,schemas,services,api}`: persistencia, validación, reglas y rutas separadas.
- `backend/app/core`: configuración, contraseñas y reloj UTC; `bootstrap.py`: primera cuenta.
- `backend/migrations`: `0001_baseline`, `0002_phase1`, `0003_identity`, `0004_tenancy`, `0005_utilities` y `0006_finances`.
- `frontend/src/pages`: propiedades/cuarto, personas y usuarios; `components`: formularios comunes.
- `backend/tests`, `frontend/tests`, `frontend/e2e`: automatización de validaciones.
- `docs/phase-1.md`: entrega histórica de fase 1.
- `docs/phase-1.1-normalization.md`: análisis individual de formas normales, claves, dependencias y diagrama.
- `docs/phase-1.1-migration.md`: preservación de datos y recuperación; `docs/phase-1.1.md`: resultados de entrega.
- `backend/app/{models,schemas,services,api}/tenancy.py`, `services/periods.py`: contratos y ocupación.
- `frontend/src/pages/tenancy`: asistente de contratos, reservas, disponibilidad e historial.
- `docs/phase-2.md`, `docs/phase-2-api.md`: entrega y operaciones de fase 2; `docs/screenshots/phase-2-*`: capturas.
- `backend/app/{models,schemas,services,api}/utilities.py`, `services/utility_math.py`, `services/utility_distribution.py`: suministros, recibos y reparto exacto con historial.
- `frontend/src/pages/utilities`: configuración, medidores, recibos, revisión y confirmación; `docs/phase-3*.md` y `docs/screenshots/phase-3-*`: entrega y capturas.
- `backend/app/{models,schemas,services,api}/finances.py`, `services/finance_periods.py`: obligaciones, dinero y aplicaciones con trazabilidad.
- `frontend/src/pages/Finances.tsx`, `pages/finances/Forms.tsx`: módulo económico; `docs/phase-4*.md` y `docs/screenshots/phase-4-*`: entrega.

Desde backend: `../.venv/bin/alembic revision --autogenerate -m "descripción"`; revisar siempre el resultado antes de `upgrade head`. No usar `create_all` para actualizar bases de aplicación. `downgrade` de fase 1 elimina sus tablas y solo debe probarse en bases descartables.

Las dependencias están fijadas mediante `backend/requirements.lock` y `frontend/package-lock.json`. No se añadieron dependencias para la autenticación: PBKDF2-SHA256 (600.000 iteraciones y sal aleatoria), tokens de sesión opacos y hashes en base de datos.

## Límites de despliegue

El límite de intentos de acceso es de diez por IP y cinco minutos, en memoria por proceso. Para varios procesos o servidores requiere un almacén compartido o control en el proxy. La revisión integral de seguridad, recuperación de contraseña por canales externos y accesibilidad con usuarios mayores no se entregan como certificadas. No se implementan envíos ni servicios externos. La fase 5 requiere aprobación expresa. Los excesos pagados a proveedores se distinguen como devoluciones pendientes; no se registran devoluciones externas automáticas.
