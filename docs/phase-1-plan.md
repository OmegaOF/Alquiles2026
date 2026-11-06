# Fase 1: alcance y aceptación

Base verificada: `main` = `c974652b0fbb8d5b809039c051d3403ee6d11f2a`. Desarrollo en rama `phase-1-properties-users`; sin reescribir main.

## Dependencias

Infraestructura de fase 0 (Python 3.11+, FastAPI, SQLAlchemy, Alembic, MySQL 8.4; React 18/TypeScript). No se requieren servicios externos ni nuevas librerías para la autenticación: PBKDF2-SHA256 y sesiones aleatorias opacas almacenadas mediante hash en base de datos. No habrá contraseñas iniciales publicadas.

## Criterios de aceptación

- Personas con documento opcional normalizado y único cuando esté presente, sin exigir correo ni teléfono; pueden ser propietarias sin usuario.
- Varias propiedades por propietario, copropietarios y participaciones opcionales; unidades únicas por propiedad.
- Listados, formularios de alta/edición y detalle utilizables desde navegador, sin botones ficticios.
- Usuarios separados de personas, roles y alcance por propiedad comprobados en servidor. Roles iniciales: administrador general (todo), administrador de propiedades (datos y unidades asignadas, sin conceder permisos), propietario (consulta de sus propiedades), operador (consulta de asignadas y mantenimiento de unidades).
- Autenticación con cookie HttpOnly, caducidad, cierre de sesión, protección de origen en mutaciones y control de intentos. Altas y cambios de acceso restringidos al administrador general.
- Archivado/deshabilitación sin borrar registros; auditoría de cambios sin contraseñas ni tokens.
- Migración versionada con claves foráneas y restricciones; comprobar ida/vuelta en MySQL descartable independiente.
- Pruebas de autenticación, autorización entre propiedades, duplicados e integridad; React y navegador en escritorio/móvil; conservar health/ready de fase 0.

## Límites

No hay contratos, reservas, estado ocupado manual, cálculos financieros, alquileres, recordatorios ni integraciones externas. La futura autorización de inquilinos se podrá agregar sobre el modelo de usuario/persona, pero no se habilita un rol sin operaciones definidas. No se tocan datos reales ni otros proyectos. Al completar fase 1 se detiene el desarrollo para revisión; no iniciar fase 2.
