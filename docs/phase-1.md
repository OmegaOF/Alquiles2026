# Entrega de fase 1 · Propiedades, unidades, personas y usuarios

## Alcance implementado

- Personas con nombre, documento opcional normalizado/único, teléfono, WhatsApp, correo opcional, dirección y observaciones. Propietarios sin cuenta de usuario y varias casas por propietario.
- Propiedades: alta/edición/listado/detalle, copropietarios con participación opcional, dirección/zona/ciudad/descripción y administradores autorizados. La participación indicada no puede superar 100% y no se repiten dueños.
- Unidades: identificador único dentro de la casa, nombre/tipo/descripción, habilitación, mantenimiento y observaciones. El mismo número se permite en casas diferentes. No existe un estado manual de ocupado, ni contratos o cálculos de alquiler.
- Usuarios: alta/edición de cuentas, cuatro roles, alcance por propiedad, deshabilitación y cambio de contraseña. Una persona no necesita una cuenta para ser propietaria.
- Acceso: contraseñas derivadas PBKDF2-SHA256 con sal, cookies HttpOnly, ocho horas de sesión, cierre y rotación de sesión, expiración y revocación por cambio sensible. No hay contraseñas predeterminadas. CLI segura para crear el primer administrador.
- Backend valida cada permiso: propietarios consultan sus casas; administradores de propiedades editan solo asignadas sin conceder accesos; operadores consultan asignadas y editan sus unidades; administrador general gestiona todo. No se confía en ocultar botones como mecanismo de seguridad.
- Auditoría transaccional de cambios con actor, fecha UTC, valores antes/después y relaciones (dueños, participaciones y accesos). Sin contraseñas, hashes o tokens en el historial. No se ofrece eliminación física por API.
- Frontend: inicio de sesión, propiedades/detalle/cuarto, personas y usuarios/permisos; formularios en español, texto grande, controles visibles, confirmaciones y mensajes de error. Diseño de escritorio y móvil; las acciones se muestran según rol.

## Base de Git y organización

Base: `main` publicada, commit `c974652b0fbb8d5b809039c051d3403ee6d11f2a`. Cambios separados en rama local `phase-1-properties-users`; main y su historial no fueron modificados. El commit de entrega se informa en el mensaje final. Esta tarea no publica la rama ni modifica el borrador del entorno cloud.

Archivos principales: `backend/app/models/entities.py`, `schemas/registry.py`, `services/registry.py`, `api/{auth,registry}.py`, `core/{security,clock}.py`, `bootstrap.py`; `frontend/src/pages/{People,Properties,Users}.tsx`, `components/Form.tsx`, `App.tsx`, `api.ts`; pruebas en backend/tests, frontend/tests y frontend/e2e; workflow `.github/workflows/checks.yml`.

No se añadieron dependencias externas de autenticación ni se alteraron paquetes de negocio de otros proyectos.

## Migración y modelos

`0002_phase1` sucede a `0001_baseline`. Tablas:

| Tabla | Uso |
| --- | --- |
| persons | Identidad y contacto opcional |
| users | Cuenta independiente, rol y referencia opcional a persona |
| properties | Casa o inmueble, habilitación y auditoría temporal |
| property_owners | Copropietarios y porcentajes opcionales |
| property_access | Asignaciones de administradores y operadores |
| units | Cuartos/unidades, número único por propiedad |
| auth_sessions | Hash de sesión y vencimiento |
| audit_events | Historial de cambios con actor e instante |

Claves foráneas con restricciones; unicidad de documento, usuario, token y número de unidad por propiedad; restricciones de rol y participación. Se probaron upgrade → downgrade a 0001 → upgrade en MySQL 8.4 descartable, y Alembic no detectó diferencias entre esquema y modelos. El downgrade destruye las tablas de fase 1: no ejecutarlo sobre datos a conservar.

## Resultados ejecutados

| Comprobación | Resultado |
| --- | --- |
| Backend completo con repetición SQLite/MySQL | **46 aprobadas**, sin omitidas |
| Frontend componentes, fase 0 y errores | **9 aprobadas** |
| Navegador Chromium, 1440×1000 y 390×844 | **14 aprobadas** |
| Asignación de propiedad y teclado en acceso tras ampliar los casos | **4 ejecuciones adicionales aprobadas** (casos incluidos en los 14 anteriores) |
| TypeScript y compilación Vite | Aprobados |
| Migración ida/vuelta e inspección Alembic | Aprobadas; sin diferencias |
| Sintaxis Python y revisión de diff | Aprobadas |

Se cubrieron los 14 criterios obligatorios del pedido: dos propietarios, varias casas para el mismo dueño, varios cuartos, duplicado por casa, mismo número en casas diferentes, propietario sin cuenta, acceso válido/incorrecto, operaciones sin sesión, casas ajenas, formularios React, tamaños móvil/escritorio, migraciones descartables y regresión de fase 0. Además: sesiones caducadas/revocadas, hashes, cambio exacto de contraseña con espacios, rechazo de origen externo, intento de escalamiento, IDs anidados ajenos, porcentajes, rollback ante duplicados y protección del último administrador.

Se detectó y corrigió un selector de E2E que no encontraba el desplegable de propietario. El flujo completo pasó después usando el rol accesible del control. También se corrigió el origen de API mediante proxy, para que SameSite=Strict funcione desde localhost. La comprobación de teclado se ajustó para esperar a que terminara la carga inicial antes de pulsar Tab; después pasó en ambos tamaños. No se deshabilitó ninguna validación para aprobar pruebas.

La CI quedó actualizada para ejecutar pruebas en MySQL descartable con una contraseña aleatoria de acceso generada durante la ejecución. **No se ejecutó la nueva CI en GitHub durante esta tarea** y no se afirma un despliegue productivo.

## Capturas reales de pruebas

Los datos mostrados son ficticios y proceden exclusivamente de la base descartable.

- [Inicio de sesión](screenshots/01-login.png)
- [Lista de propiedades](screenshots/02-propiedades.png)
- [Detalle y cuartos en escritorio](screenshots/03-detalle-cuartos.png)
- [Detalle y cuartos en móvil](screenshots/04-detalle-movil.png)
- [Personas y propietarios](screenshots/05-personas.png)
- [Usuarios y permisos](screenshots/06-usuarios.png)

## Instrucciones desde el navegador

Seguir [README](../README.md) para instalar, migrar y crear la primera cuenta mediante `python -m app.bootstrap`. Iniciar API y React y abrir el puerto 5173. Secuencia sugerida:

1. Ingresar con la cuenta creada, sin contraseña publicada de ejemplo.
2. Personas → Registrar persona → marcar propietario → guardar y confirmar. Repetir para un segundo propietario.
3. Propiedades → Registrar propiedad → elegir dueño(s), dirección y ciudad → guardar.
4. Ver propiedad → Registrar cuarto → guardar; probar que repetir su número da un error sin duplicar datos. Registrar otra propiedad y reutilizar allí el número.
5. Editar propiedad y cuarto; probar mantenimiento y habilitación. No hay ocupación manual.
6. Usuarios y permisos → crear administrador de propiedades/operador y asignar casas; crear propietario con cuenta vinculado a una persona. Salir y entrar con esas cuentas para comprobar acciones permitidas y aislamiento.
7. Inicio → Comprobar conexión para verificar API y MySQL; Cerrar sesión al terminar.

Los procesos actuales se validaron sobre una base de pruebas exclusiva en puerto 3307, sin alterar `.env` ni datos existentes. Para uso propio, arrancar con la base de desarrollo elegida y crear la primera cuenta con su contraseña. La contraseña de la cuenta automática de pruebas no se publica ni se propone para uso real.

## Problemas conocidos y pendientes

- Aviso ya existente de Starlette: su cliente con httpx está deprecado; las pruebas pasan. No se ocultó la advertencia.
- El límite de login (diez intentos por IP en cinco minutos) es por proceso; el despliegue con varios procesos requiere un control compartido. HTTPS y configuración de origen siguen siendo necesarios para un despliegue productivo.
- No se implementa recuperación de contraseña por correo, visor de auditoría ni acceso de inquilinos; el modelo de personas/cuentas y roles permite extenderlos posteriormente.
- Listas sin paginación ni búsqueda avanzada; apropiadas para la validación de esta fase, con mejora posible para volúmenes grandes.
- Accesibilidad revisada mediante estructura, contraste visual, controles, teclado/foco y tamaños probados; falta evaluación con usuarios mayores en la fase 8. No se afirma certificación WCAG.
- No se tocaron datos reales, Pisco Ñawi ni el sistema antiguo. No se inició fase 2.

## Regresión de fase 0

Health, readiness con MySQL, seguridad de mensajes de conexión, CORS, compilación, tres pruebas del diseño base y flujo de conexión desde Inicio siguen funcionando. El registro de migración evoluciona a 0002 sin retirar la línea base 0001. El informe histórico de fase 0 se conserva en docs/phase-0.md.
