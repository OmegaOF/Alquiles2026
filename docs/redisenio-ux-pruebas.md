# Verificación del rediseño de Alquiles2026

## Entorno y comandos

Las pruebas de integración usaron MySQL 8.4 en un contenedor temporal con un volumen en memoria. La pasada final de Playwright usó `alquiles_browser_final_test`. Las pasadas anteriores usaron `alquiles_ux_test`. Las pruebas de backend que recrean tablas y ejercitan migraciones usaron otra base descartable, `alquiles_fixtures_test`. Las credenciales de prueba se generaron para el contenedor.

Con las dependencias del repositorio instaladas, configura `DATABASE_URL` hacia la base de la API y `PHASE1_TEST_DATABASE_URL` hacia la base de las pruebas que recrean tablas. Configura además `E2E_USERNAME` y `E2E_PASSWORD` para una cuenta de esa base descartable.

```bash
export RUN_MYSQL_TESTS=1
for phase in 11 2 3 4 5 6; do
  export "PHASE${phase}_MIGRATION_DATABASE_URL=$PHASE1_TEST_DATABASE_URL"
done

(cd backend && ../.venv/bin/alembic upgrade head)
(cd backend && ../.venv/bin/pytest -q)
(cd backend && ../.venv/bin/alembic check)

npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run test:e2e -- --workers=1 --timeout=90000
```

Para Playwright, inicia FastAPI en el puerto 8000 y sirve la compilación de producción de Vite en el 5173. Usa Chromium de Playwright o configura `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` para un Chromium local. Los proyectos usan 1440 × 1000 y 390 × 844. Las capturas y descargas de reportes se guardan en la salida de pruebas. La regeneración intencional de los ejemplos históricos requiere `CAPTURE_PHASE7_SCREENSHOTS=1`.

## Resultados

| Verificación | Resultado |
| --- | --- |
| Backend con SQLite y MySQL descartable | 533 aprobadas, sin omisiones en la suite completa. Incluye migraciones históricas, permisos y concurrencia financiera. Aparecieron 77 avisos de deprecación de bibliotecas de pruebas y Alembic. |
| Verificación posterior de resumen y metadatos de reportes | 4 aprobadas en SQLite y MySQL. Comprueba que el resumen de Inicio reutiliza saldos, aplica permisos y realiza lecturas sin `FOR UPDATE`. |
| Búsqueda paginada y aislamiento | 2 aprobadas en SQLite y MySQL. Comprueba nombre, ID, documento, teléfono, código, páginas y propiedades fuera del alcance de un operador. |
| Salud y reintento de conflictos MySQL | 6 aprobadas, incluida la respuesta 409 con un mensaje seguro. |
| Alembic | `upgrade head` en la base descartable y `alembic check` sin operaciones nuevas. |
| React | 67 aprobadas en 12 archivos. |
| Compilación | TypeScript y Vite completaron la compilación de producción. |
| Playwright | 92 recorridos verificados sobre la compilación de producción. La pasada integral dio 90 aprobados y 2 fallos en una aserción del orden de Tab del reporte. La repetición con la aserción corregida dio 2 de 2 aprobados. Cobertura de 46 casos en escritorio y 46 en móvil. |

## Cobertura y límites

Las pruebas de backend cubren alquiler diario con servicios incluidos, el umbral de 15 días, garantías, anticipos, correcciones, duplicación de solicitudes, servicios, capital separado e historial. Los recorridos de navegador verifican las operaciones sobre MySQL y la navegación con ambos tamaños de pantalla. Los detalles de cada vista se cruzan con las pruebas en [la tabla de navegación](redisenio-ux-navegacion.md#cambios-por-pantalla).

Las ejecuciones intermedias detectaron selectores que apuntaban a nombres del menú anterior, una prueba de teclado que avanzaba antes de recibir resultados remotos y conflictos transitorios MySQL 1213 durante ejecuciones simultáneas. Se corrigieron los selectores y la espera. El resumen de Inicio dejó de tomar bloqueos globales de reportes. Ante un conflicto transitorio de escritura, la API devuelve un mensaje de reintento y conserva las reglas de la transacción. La última pasada de navegador usa una compilación fija, tras detectar que una pasada anterior cargó un módulo desactualizado durante la recarga en caliente de Vite.

Axe encontró cero infracciones en las comprobaciones ejecutadas de WCAG 2.2 AA en el acceso, Inicio, la apertura del menú móvil, el buscador sin resultados y el diálogo de alta. Playwright también comprueba la selección por teclado y la salida con Escape. Quedan fuera de esta medición una auditoría manual exhaustiva con tecnologías de asistencia y una certificación completa de conformidad.

Los catálogos transaccionales de cada casa y las opciones de reportes consultadas se filtran sobre el conjunto autorizado que ya usa el módulo. Falta extender la paginación del servidor a los conjuntos transaccionales y de reportes que puedan crecer más allá de los catálogos básicos. Los borradores persistentes se limitan a los estados admitidos por cada módulo. Algunas validaciones de negocio se anuncian en el resumen del formulario. Sigue pendiente una revisión de los mensajes de validación campo por campo. La interfaz carece de una operación de respaldo.
