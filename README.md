# Mi Casa · Administración de propiedades

Fase 0: infraestructura y diseño base. No contiene reglas de alquileres, servicios, pagos ni recordatorios. Requiere aprobación para iniciar la fase 1.

## Requisitos

Python 3.11+ (validado con 3.12), Node.js 22 o 24 y Docker con Compose. MySQL 8.4. No se usa ni modifica Pisco Ñawi IA ni ninguna base de datos previa.

## Preparación

Desde la raíz del repositorio:

```bash
cp .env.example .env
# Editar las contraseñas de desarrollo en .env y ajustar DATABASE_URL para coincidir.
bash scripts/install.sh
docker compose up -d --wait mysql
cd backend
../.venv/bin/alembic upgrade head
```

`.env.example` contiene valores públicos de ejemplo para desarrollo local, nunca credenciales reales. `.env` queda fuera de Git. El puerto MySQL se publica únicamente en la interfaz local. Para una base externa, configurar DATABASE_URL y omitir el servicio Docker; no ejecutar migraciones sobre datos reales sin autorización.

## Probar en el navegador

En una terminal, desde `backend`:

```bash
../.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

En otra terminal, desde `frontend`:

```bash
npm run dev
```

Abrir el puerto 5173 en el navegador del entorno de desarrollo. En una máquina local, visitar `http://localhost:5173`. Pulsar **Comprobar conexión**: debe aparecer “Conexión correcta. El sistema está disponible.” La documentación de la API está en el puerto 8000, ruta `/docs`. No hay usuarios ni inicio de sesión en esta fase.

Vite usa `http://127.0.0.1:8000` por defecto. Para acceder desde otro dispositivo, configurar `frontend/.env.local` con `VITE_API_BASE_URL` apuntando al servidor accesible y añadir el origen exacto del frontend a `CORS_ORIGINS` en `.env`. Reiniciar ambos procesos. No exponer esta base sin autenticación a Internet.

## Verificación

Desde la raíz, con MySQL iniciado:

```bash
bash scripts/check.sh
```

Para la prueba completa desde el navegador, iniciar ambos servidores y ejecutar desde `frontend`:

```bash
# Si Chromium ya está instalado, indicar su ruta:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
# En otros equipos: npx playwright install chromium; npm run test:e2e
```

Incluye migraciones, pruebas unitarias e integración con MySQL, comprobación de diferencias de esquema, pruebas de componentes y compilación TypeScript/Vite. Sin base disponible se pueden ejecutar pruebas unitarias en `backend` con `../.venv/bin/pytest -m 'not integration'`.

## Migraciones

Desde `backend`, usar `../.venv/bin/alembic revision --autogenerate -m "descripción"`, revisar el archivo y ejecutar `../.venv/bin/alembic upgrade head`. Los nuevos modelos deberán importarse en el registro de metadatos antes de autogenerar. La revisión `0001_baseline` no crea tablas de negocio; Alembic mantiene su tabla de versión. Las pruebas de reversión solo deben ejecutarse en una base descartable.

## Organización

- `backend/app`: rutas API, configuración, sesiones de base, modelos, esquemas y servicios separados.
- `backend/migrations`: historial versionado de Alembic.
- `backend/tests`: pruebas unitarias e integración.
- `frontend/src`: interfaz React, estilos y cliente de API.
- `frontend/tests`: pruebas de componentes.
- `docs/architecture.md`: decisiones, límites y criterios de fases futuras.
- `docs/phase-0.md`: informe y evidencia de entrega.

Las dependencias Python quedan fijadas en `backend/requirements.lock`; npm utiliza `frontend/package-lock.json`.
