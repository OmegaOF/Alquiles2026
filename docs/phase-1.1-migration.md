# Migración y recuperación de fase 1.1

## Revisión incremental

`0003_identity` sucede a `0002_phase1`. Las migraciones 0001 y 0002 se conservan sin cambios. Solo se ejecutaron las operaciones descritas en bases MySQL 8.4 nuevas y descartables; no se migró ninguna base real.

La revisión requiere ejecución online: realiza lecturas para conservar nombres, validar relaciones y completar identidades. No se genera un SQL offline que suponga conocer esos datos.

## Datos y restricciones conservados

- IDs de personas existentes, usuarios, propiedades y unidades.
- Usuario de acceso, hash de contraseña, rol y habilitación de cada cuenta.
- Sesiones y sus hashes/fechas; asignaciones de acceso; propietarios/participaciones; cuartos.
- Eventos de auditoría existentes sin reescribir su contenido histórico.
- Claves primarias, índices de unicidad y FK con RESTRICT; la FK users.person_id se repone al modificar su nulabilidad en MySQL.

## Etapas de upgrade

1. Comprobar que los enlaces de persona existentes no sean huérfanos.
2. Añadir `users.display_name VARCHAR(160) NULL` si aún no existe.
3. En una transacción de datos: crear una persona distinta para cada usuario sin vínculo y enlazarlo; copiar el nombre anterior a alias únicamente si difiere del nombre canónico. No unir personas por nombres o contactos. Copiar las fechas de la cuenta en la identidad creada.
4. Confirmar el backfill antes de los siguientes DDL. Verificar que ninguna cuenta carezca de persona.
5. Cambiar `users.person_id` a NOT NULL, manteniendo su FK.
6. Ampliar `audit_events.details` de TEXT a MEDIUMTEXT en MySQL.
7. Eliminar `users.full_name` solo después de preservar su información.

Se conservan ocho tablas. `full_name` sigue disponible en las respuestas API mediante la persona vinculada. `display_name` es un alias independiente y opcional, no una copia sincronizada del nombre personal.

## Antes de aplicar en una base con datos que deban conservarse

Esta tarea no autoriza operaciones sobre una base real. Para una aplicación posterior autorizada:

1. Detener la aplicación, tareas y otros escritores; no es una migración con escrituras concurrentes soportadas.
2. Identificar inequívocamente la base y comprobar `alembic current` con su configuración segura.
3. Realizar un respaldo y verificar su restauración en otra base vacía antes de continuar.
4. Conservar el código compatible con 0002, además del respaldo.
5. Ejecutar upgrade y validaciones primero sobre una copia representativa.

Ejemplo de respaldo mediante un perfil seguro de MySQL, sustituyendo los nombres y usando una ubicación fuera del repositorio:

```bash
mysqldump --login-path=alquiles --single-transaction --routines --triggers --events --hex-blob NOMBRE_BD > /ruta/segura/antes_0003.sql
```

`--single-transaction` se utiliza con tablas InnoDB; el mantenimiento evita cambios de esquema concurrentes. El perfil se configura fuera de Git y no se imprime su contraseña. No se ha ejecutado este respaldo sobre una base real durante esta entrega.

Desde `backend`, con DATABASE_URL apuntando a la base autorizada:

```bash
../.venv/bin/alembic current
../.venv/bin/alembic upgrade head
../.venv/bin/alembic current
../.venv/bin/alembic check
```

La versión esperada es `0003_identity`. Probar acceso con una cuenta existente, nombre/alias, propiedades, unidades y permisos antes de volver a habilitar el servicio. No ejecutar los fixtures de pruebas sobre esa base: borran tablas de bases descartables explícitas terminadas en `_test`.

## Si el upgrade falla

MySQL realiza commits implícitos al ejecutar DDL: **un fallo no garantiza que todo el esquema vuelva a 0002**, aunque Alembic siga mostrando esa revisión.

- El backfill de personas y sus enlaces usa una transacción explícita; un fallo en medio hace rollback de esos datos. La columna nueva añadida previamente puede permanecer.
- Las operaciones son reentrantes y consultan el esquema: una vez diagnosticado/corregido el fallo y manteniendo detenidos los escritores, repetir `alembic upgrade head` puede completar el proceso. Se probó la interrupción durante el backfill y antes/después de eliminar la columna antigua, sin duplicar personas ni perder nombres.
- No usar `alembic stamp` para simular que terminó, ni editar manualmente la versión para saltar pasos. Si aparece una combinación no recuperable o se desconoce qué se modificó, usar el respaldo verificado.
- No arrancar el código antiguo contra un esquema parcial sin comprobar su compatibilidad.

## Downgrade y restauración exacta son operaciones diferentes

```bash
# Solo después de respaldo y con escritores detenidos:
../.venv/bin/alembic downgrade 0002_phase1
```

El downgrade reconstruye `users.full_name` desde el alias si existe, o desde el nombre de la persona. Devuelve la FK a nullable y elimina la columna de alias, conservando las personas y enlaces creados: borrarlos podría eliminar identidades utilizadas posteriormente.

Por tanto, reconstruye nombres compatibles pero **no restaura exactamente las filas ni toda la semántica anterior**: las cuentas que antes tenían person_id NULL mantienen su nueva identidad. Si hubo cambios de nombres después de migrar, se reconstruyen los nombres actuales compatibles con 0002, no una instantánea antigua. Un alias explícito igual al nombre canónico no puede distinguirse de ese nombre al volver al esquema antiguo; una nueva subida puede convertirlo en alias NULL. Para conservar exactamente esa intención y los vínculos originales hay que restaurar el respaldo, no hacer un roundtrip de esquema.

Antes de modificar el esquema, comprueba el tamaño de la auditoría. Si algún evento supera 65.535 bytes, bloquea el downgrade a TEXT. Nunca trunca eventos ni elimina historial para permitirlo. En ese caso, mantener 0003 o recuperar el respaldo compatible.

Para regresar exactamente a los datos previos, restaurar el respaldo en una **base separada y vacía**, verificarlo y cambiar el despliegue al código 0002 y a esa base, preservando la base fallida para diagnóstico:

```bash
mysql --login-path=alquiles NOMBRE_BD_RECUPERACION < /ruta/segura/antes_0003.sql
```

La base de recuperación debe crearse vacía previamente. No restaurar a ciegas encima de una base con cambios posteriores. Los cambios legítimos posteriores al respaldo requieren conciliación antes de sustituirla.

## Pruebas reproducibles de migración

Las pruebas de `backend/tests/test_migration_11.py` requieren una URL MySQL explícita `PHASE11_MIGRATION_DATABASE_URL` cuya base termine en `_test`. Su fixture borra el contenido y deja el esquema en HEAD al finalizar. La URL debe señalar únicamente una base descartable. Desde backend:

```bash
../.venv/bin/pytest -q tests/test_migration_11.py
```

El informe de entrega registra los resultados realmente ejecutados, separados del análisis formal de 3FN.
