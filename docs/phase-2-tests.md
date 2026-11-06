# Verificación de fase 2

Fecha: 2026-11-06. Resultados de ejecución local, sin publicación de la rama ni ejecución declarada de CI en GitHub.

## Entorno y comandos

Python 3.12, Node 24, MySQL 8.4 y Chromium del sistema. Dos instancias MySQL creadas exclusivamente para la tarea: una base `_test` para API/regresión y otra `_test` para migraciones. SQLite se usa además para repetir reglas de dominio. Ninguna URL de prueba apunta a datos reales.

Las variables `DATABASE_URL`, `PHASE1_TEST_DATABASE_URL`, `PHASE11_MIGRATION_DATABASE_URL`, `PHASE2_MIGRATION_DATABASE_URL`, `E2E_USERNAME` y `E2E_PASSWORD` se proporcionaron fuera de Git, sin publicar sus valores. Las bases de migración 1.1 y 2 comparten una instancia solamente durante su ejecución secuencial. Las pruebas recrean tablas: no deben ejecutarse contra bases que deban conservarse.

```bash
# Con las variables anteriores configuradas de forma segura:
bash scripts/check.sh
# Incluye: upgrade head, pytest, alembic check, Vitest y build TypeScript/Vite.

# Después, con API y React iniciados y administrador temporal recién creado:
cd frontend
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
CAPTURE_PHASE2_SCREENSHOTS=1 npm run test:e2e
```

El administrador de navegador se creó con una contraseña aleatoria mediante stdin, después de terminar los fixtures que recrean las tablas. No se publican contraseñas predeterminadas. No se ejecutaron pruebas MySQL y navegador simultáneamente sobre la misma base.

## Resultados definitivos

Resultados del código final. Se incluyen casos nuevos y regresiones de fases 0, 1 y 1.1.

| Comprobación | Resultado |
| --- | --- |
| Backend completo | **141 aprobadas, 0 fallidas, 0 omitidas**, en 80,59 s; 66 regresiones previas y 75 casos nuevos parametrizados. |
| Migraciones 0001 → 0004 en MySQL limpio | Aprobado, incluido entre los 141 casos. Trece tablas de aplicación y versión 0004. |
| 0003 con datos → 0004 → 0003 → 0004 | Aprobado. Comparación completa de registros de las ocho tablas anteriores. |
| Concordancia modelos/migración (`alembic check`) | Aprobado: `No new upgrade operations detected.` |
| React/Vitest | **21 aprobadas, 0 fallidas, 0 omitidas**: 14 previas y 7 nuevas; 5 archivos. |
| TypeScript y build de producción | Aprobados. Vite compila 40 módulos. |
| Playwright escritorio y móvil | **22 aprobadas, 0 fallidas, 0 omitidas**, en 33,8 s: 16 regresiones previas y 6 recorridos nuevos. |

Salidas reales conservadas: [comprobación completa](verification/phase-2-check.txt) y [navegador](verification/phase-2-browser.txt). No se cuentan los intentos fallidos anteriores como resultados definitivos. Se revisaron también las diez capturas de entrega y los enlaces locales del informe.

## Cobertura de los 22 criterios pedidos

Los nombres se refieren a pruebas de `backend/tests/test_tenancy.py`, salvo donde se indica otro archivo. Los casos de dominio y permisos se ejecutan en SQLite y MySQL; las cuatro carreras se ejecutan solamente en MySQL con conexiones independientes, no se simulan con SQLite.

| Criterio | Comprobación concreta |
| --- | --- |
| 1. Diario | `test_daily_count_and_services_long_stay`, flujo React y navegador. |
| 2. Semanal | `test_weekly_complete_and_partial`: 7 días completos y 9 días con permiso explícito. |
| 3. Mensual | `test_monthly_calendar_actual_days`, `test_anniversary_anchor_does_not_drift_and_first_complete`; React guarda configuración elegida. |
| 4. Casa completa | `test_whole_property_and_unit_conflicts_in_both_directions`. |
| 5. Cuarto individual | Alta de cuartos distintos, disponibilidad derivada y flujo de navegador. |
| 6. Casa y cuarto incompatibles | Prueba en ambos sentidos y carrera MySQL `whole_vs_room`. |
| 7. Mismo cuarto superpuesto | `test_exact_daily_and_nights_boundaries`, carrera contrato/contrato. |
| 8. Consecutivos | Salida el 3 y entrada el 4 admitida. |
| 9. Límites exactos | Entrada el mismo día de salida anterior rechazada, también cuando el precio cuenta noches. |
| 10. Del 1 al 3 son tres días | Conteo inclusivo y navegador real. |
| 11. Noches | Del 1 al 3 son dos noches y tres días ocupados; cero noches se rechaza. |
| 12. Reservas superpuestas | Reserva repetida rechazada; carrera reserva/reserva. |
| 13. Conversión | `test_reservation_confirm_convert_once_and_self_exclusion` y carrera conversión/conversión. Se verifica una única fila. |
| 14. Cancelación/vencimiento | `test_cancel_and_expire_release_reservations`; tiempo controlado para vencimiento, consulta y nueva ocupación. |
| 15. Finalización e historia | `test_finish_early_keeps_occupants_and_original_owners`, navegador y salida pactada/real separadas. |
| 16. Varios ocupantes | `test_multiple_occupants_and_database_relationship_keys`: dos adicionales, responsable separado, duplicados y FK rechazados. |
| 17. Permisos entre casas | `test_tenancy_permission_scope_and_people_privacy`: tres roles; consulta, edición, acciones, reservas, disponibilidad, personas e historial ajenos rechazados. |
| 18. Entradas incorrectas | Fechas, XOR de destino, modalidad, importes negativos/NaN, personas repetidas y condiciones específicas; comprobaciones SQL directas en MySQL migrado. |
| 19. Concurrencia | Tres carreras de ocupación/reserva devuelven 201/409 y una sola ocupación; dos conversiones devuelven 201/200 y el mismo contrato. Barrera previa al bloqueo reproduce lecturas anteriores bajo REPEATABLE READ. |
| 20. Fases 0/1/1.1 | Suite previa de backend, 14 casos React previos y 16 recorridos de navegador previos, incluyendo identidad, alias, contraseñas, sesiones, roles y varias casas por propietario. |
| 21. Migración limpia y anterior | `backend/tests/test_migration_2.py`: tablas, FK/PK, DECIMAL, preservación de registros y subida/bajada/subida. Suite de migración 1.1 conservada. |
| 22. Escritorio y móvil | `frontend/e2e/tenancy.spec.ts`: contrato guiado/modificación/prórroga/disponibilidad; reserva/nueva persona/edición/confirmación/conversión; finalización e historial. Tres recorridos repetidos en ambos tamaños. |

## Comprobaciones adicionales

- Meses de febrero de 28 y 29 días, abril de 30 y enero de 31. Aniversarios del día 31 no se desplazan permanentemente al 28. Primer periodo completo/proporcional y vencimiento al final/personalizado sin día obligatorio. Al finalizar un mensual en febrero bisiesto se conservan los 60 días pactados, con 15 ocupados de los 29 reales de febrero.
- Diario de 20 días: servicios incluidos, indicador de cargos adicionales falso y ausencia de tablas financieras. El navegador verifica 20 días después de prorrogar.
- Contrato de un solo día inclusivo y servicios implícitos cuando se omite el flag. Diario con flag falso y noches sin noche real se rechazan.
- Activar un borrador vuelve a comprobar disponibilidad; borrador corregido se activa y una cancelación previa a entrada libera fechas.
- Contrato iniciado no puede trasladar su intervalo pasado a otro espacio; el borrador sí permite corregir destino. Se consulta la ocupación del cuarto original. Navegador verifica el control deshabilitado.
- Anticrético sin capital/tabla financiera; mixto solo borrador, con activación rechazada.
- Firmantes históricos explícitos distintos del dueño actual; cambiar titularidad no reescribe el contrato. No se permite sustituir firmantes de un vigente.
- Relaciones nuevas: PK compuestas y FK impiden duplicados/huérfanos; vínculo explícito de persona idempotente con una sola auditoría que identifica casa y persona.
- Formularios con versión antigua rechazados. No existe eliminación física por API. Modificar adicionales conserva sus IDs anteriores en auditoría y su identidad consultable.
- Cambiar rápidamente de casa descarta respuestas anteriores: prueba React controlando una respuesta tardía. El guardado completa la recarga antes de habilitar acciones del detalle.
- Reserva editada conserva la hora local de vencimiento; E2E con `America/La_Paz` y configuración regional española. Fecha de negocio del frontend/backend consistente con Bolivia.
- Textos/estados visibles, confirmaciones y ausencia de desbordamiento horizontal en recorridos nuevos; capturas de cinco pantallas por tamaño.

## Fallos encontrados y corregidos

Se registran para distinguir el resultado final de intentos anteriores:

1. El JSON literal de un fixture se interpretaba como parámetro de `sqlalchemy.text`; se cambió por parámetro enlazado.
2. La reversión autogenerada intentaba quitar índices todavía utilizados por FK de InnoDB. La nueva revisión deja retirarlos junto con la tabla; se repitió ida/vuelta y preservación.
3. Un tipo de opciones de Testing Library no admite `exact`; se corrigió el test y se volvió a compilar TypeScript.
4. El navegador móvil expuso respuestas tardías del historial y acciones habilitadas antes de finalizar la recarga tras guardar. Se descartaron respuestas antiguas y se mantuvo el asistente ocupado hasta cargar el detalle; se añadió regresión React y se repitieron los recorridos.
5. Al editar reservas, el input mostraba UTC como hora local. Se corrigió la conversión y se verificó conservar exactamente la hora en Bolivia.
6. La revisión de historia detectó que mover una estancia ya iniciada podía reubicar su intervalo pasado. Se exige finalizar y registrar otro contrato; se verifica la ocupación anterior y el control de interfaz.
7. La revisión visual detectó que los eventos anidados del historial heredaban columnas flexibles de las tarjetas. Se corrigió la presentación en bloques legibles y se regeneraron las capturas.
8. Un mensual con vencimiento escrito personalizado todavía exigía un día numérico y lo mostraba en el detalle. Se permitió la regla escrita sin día, conservando `due_day` nulo y verificando ese caso en API y React.
9. El conteo mostrado después de finalizar anticipadamente seguía usando el plazo pactado como días ocupados. Se separaron `contracted_days` y `occupancy_days`: el primero conserva el acuerdo y el segundo termina en la salida real. Se verifica explícitamente una estancia pactada de 21 días finalizada tras nueve días, sin crear cargos ni devoluciones.

No se cuentan los intentos fallidos como aprobados. Se conservan únicamente las salidas finales limpias en los documentos de resultados; los registros temporales de diagnóstico no se versionan.

## Límites y avisos

No se ejecutaron pruebas de carga, despliegue productivo ni validación presencial con usuarios mayores. Las variantes móviles corresponden a Chromium a 390 px, no a todos los dispositivos físicos. No se prueba ni implementa la regla financiera de servicios de 15 días, ni pagos/capital/WhatsApp/PDF, que quedan fuera de fase 2.

El backend emite avisos de deprecación ya presentes: integración Starlette/httpx y configuración antigua de separación de rutas de Alembic. No son fallos ni omisiones. Playwright puede mostrar aviso de variables de color del terminal. Las limitaciones operativas de autenticación y HTTPS siguen en README.
