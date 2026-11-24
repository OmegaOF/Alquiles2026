# Listados de Alquiles2026

## Casas y cuartos

- **Mis casas** busca en las propiedades autorizadas por nombre, dirección, zona, ciudad o ID. El detalle muestra propietarios y porcentajes registrados, administradores autorizados y accesos a contratos, disponibilidad, servicios y cobros. Las asignaciones de administradores conservan sus permisos.
- **Disponibilidad de hoy** muestra seis conteos de la API y una cuadrícula de códigos con estado. El resultado para la casa completa aparece junto al resumen con el motivo principal.
- **Cuartos y unidades** muestra el inventario paginado, con filtros independientes de tipo, habilitación y mantenimiento. La columna de ocupación refleja contratos que coinciden con la fecha de negocio. Las descripciones y las observaciones se consultan en el detalle.
- **Disponibilidad por fechas** muestra resultados paginados. El total filtrado y los conteos por estado se calculan sobre el conjunto completo. Cada fila muestra el impedimento principal y permite abrir los demás contratos o reservas aplicables. Los formularios existentes reciben casa, cuarto y fechas. El regreso a disponibilidad conserva los criterios y la página y vuelve a consultar la API.

### API

- `GET /properties/{id}/unit-inventory` admite `page`, `q`, `unit_type`, `enabled` y `maintenance`. La respuesta entrega hasta 20 unidades, su ocupación actual, el total filtrado y los tipos que existen en la propiedad. `GET /properties/{id}/units/{unit_id}` obtiene un cuarto autorizado por ID.
- `GET /properties/{id}/availability` mantiene la consulta completa existente. Con `page`, entrega hasta 20 unidades y el motivo principal de la casa completa. Admite `q` y `state`. `summary` cuenta todas las unidades por estado y `total` cuenta las que coinciden con los filtros. Cada impedimento contractual incluye el ID y las fechas efectivas.
- `POST /contracts?check_availability=true` permite al flujo de disponibilidad verificar el período dentro de la transacción antes de crear un contrato, incluso como borrador. Los borradores ordinarios conservan su comportamiento. Las reservas conservan la validación de conflictos al crear, editar o confirmar.

## Extensión a otros módulos

Personas, Usuarios, las propiedades asignables de una cuenta, Contratos, Reservas, Inquilinos, el historial de contratos, tipos de servicio, suministros y recibos comparten buscadores y páginas de 20 registros. En estos listados y en Mis casas, la búsqueda usa el conjunto completo ya cargado por la pantalla o por los catálogos compartidos. Migrar esas colecciones a consultas en servidor sigue pendiente cuando el volumen justifique evitar su carga inicial.

| Módulo | Listados pendientes |
| --- | --- |
| Inicio | Vista de propiedades y resúmenes con vínculos a deudas y avisos. |
| Avisos y Pendientes | Listado principal de avisos, historial de atención, consentimientos e historial, comunicaciones e historial de eventos, pagos reportados y sus decisiones, destinatarios configurables. |
| Anticréticos | Contratos y vencimientos, titulares y responsables, entregas y devoluciones, asignaciones, correcciones y versiones de condiciones e historial. |
| Cobros y gastos | Obligaciones y deudas, pagos recibidos, anticipos, garantías, gastos, pagos realizados y devoluciones, servicios por recuperar, movimientos e historial, métodos de pago y categorías. |
| Servicios | Medidores, lecturas, configuraciones por unidad, repartos y versiones de cada recibo. |
| Reportes | Los detalles ya se paginan desde el servidor. Falta aplicar el tamaño de 20 en la pantalla y añadir búsqueda textual según los campos de cada reporte. |

Los selectores de registro utilizan la búsqueda accesible existente. Las filas editables de un formulario y los totales agregados se mantienen como controles y resúmenes de sus pantallas.
