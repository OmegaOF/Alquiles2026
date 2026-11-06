# Mi Casa · Administración de propiedades

Fase 1.1: identidad normalizada sobre personas, propietarios, propiedades, cuartos, usuarios y permisos. Backend FastAPI/SQLAlchemy/MySQL y frontend React 18/TypeScript, independientes de Pisco Ñawi y del sistema antiguo. No hay contratos, ocupación, alquileres, servicios, pagos ni recordatorios todavía.

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

**Bases existentes:** antes de aplicar 0003, detener escritores, hacer y verificar un respaldo y leer [migración y recuperación](docs/phase-1.1-migration.md). MySQL no revierte automáticamente todos los DDL. Revisar las migraciones antes de aplicarlas. La validación de esta fase usó únicamente una base nueva descartable, no datos reales. No migrar bases de otros proyectos.

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

## Permisos iniciales

| Rol | Propiedades visibles | Acciones |
| --- | --- | --- |
| Administrador general | Todas | Personas, propiedades, cuartos, cuentas y permisos; archivado de propiedades |
| Administrador de propiedades | Asignadas por el administrador general | Editar datos y cuartos; sin cambiar propietarios, accesos ni archivar propiedades |
| Propietario | Donde la persona vinculada sea propietaria | Consulta de propiedades, propietarios relacionados y cuartos |
| Operador | Asignadas | Consulta y alta/edición/habilitación/mantenimiento de cuartos |

Los permisos se verifican en el backend en cada solicitud, incluso si se manipula la interfaz o los identificadores. Las cuentas no habilitadas no pueden iniciar sesión. No se expone el historial de auditoría a roles restringidos; en esta fase se conserva en base de datos para revisión administrativa técnica.

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

Las pruebas adicionales de migración requieren `PHASE11_MIGRATION_DATABASE_URL` con base descartable terminada en `_test`; pueden compartir la base CI solo cuando se ejecutan secuencialmente.

La suite usa 1440 px y 390 px; también verifica sesión desde localhost. La configuración de CI ejecuta estos pasos sobre MySQL descartable, sin credenciales de usuarios reales.

## Organización y migraciones

- `backend/app/{models,schemas,services,api}`: persistencia, validación, reglas y rutas separadas.
- `backend/app/core`: configuración, contraseñas y reloj UTC; `bootstrap.py`: primera cuenta.
- `backend/migrations`: `0001_baseline`, `0002_phase1` y `0003_identity`.
- `frontend/src/pages`: propiedades/cuarto, personas y usuarios; `components`: formularios comunes.
- `backend/tests`, `frontend/tests`, `frontend/e2e`: automatización de validaciones.
- `docs/phase-1.md`: entrega histórica de fase 1.
- `docs/phase-1.1-normalization.md`: análisis individual de formas normales, claves, dependencias y diagrama.
- `docs/phase-1.1-migration.md`: preservación de datos y recuperación; `docs/phase-1.1.md`: resultados de entrega.

Desde backend: `../.venv/bin/alembic revision --autogenerate -m "descripción"`; revisar siempre el resultado antes de `upgrade head`. No usar `create_all` para actualizar bases de aplicación. `downgrade` de fase 1 elimina sus tablas y solo debe probarse en bases descartables.

Las dependencias están fijadas mediante `backend/requirements.lock` y `frontend/package-lock.json`. No se añadieron dependencias para la autenticación: PBKDF2-SHA256 (600.000 iteraciones y sal aleatoria), tokens de sesión opacos y hashes en base de datos.

## Límites de despliegue

El límite de intentos de acceso es de diez por IP y cinco minutos, en memoria por proceso. Para varios procesos o servidores requiere un almacén compartido o control en el proxy. La revisión integral de seguridad, recuperación de contraseña por canales externos y accesibilidad con usuarios mayores no se entregan como certificadas. No se implementan envíos ni servicios externos. La fase 2 requiere aprobación expresa.
