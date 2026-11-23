# Rediseño de navegación de Alquiles2026

## Menú y contenido

Al iniciar sesión se abre **Inicio**. La barra superior contiene los seis grupos en el orden acordado. El panel izquierdo muestra únicamente las opciones del grupo activo. En teléfonos la barra se abre con «Cambiar grupo» y las opciones de la sección quedan encima del contenido. La selección de sección mueve el foco al contenido principal.

| Grupo | Opciones disponibles | Contenido |
| --- | --- | --- |
| Inicio | Resumen, Avisos, Pendientes | Casas autorizadas, cuartos disponibles, vencimientos de contratos, saldos por moneda, recordatorios y pagos reportados por verificar. |
| Casas y cuartos | Mis casas, Cuartos, Disponibilidad | Ficha de casa con propietarios, cuartos y disponibilidad. Registro y edición de cuartos. Consulta de fechas para casa completa y unidades. |
| Alquileres | Contratos, Reservas, Inquilinos, Anticréticos | Asistente de contratos, reservas y conversión, ocupantes actuales e historial, condiciones y movimientos de capital. |
| Cobros y gastos | Cobros, Deudas, Servicios, Gastos | Importes por cobrar, registro e historial de ingresos, anticipos, garantías, recuperación de servicios, suministros, medidores, lecturas, recibos, reparto, gastos y pagos realizados. |
| Reportes | Ingresos, Ocupación, Historial, PDF | Reportes con filtros, gráficos de ocupación y economía, registros paginados y descarga PDF con los mismos criterios de la consulta. |
| Configuración | Personas, Usuarios, Seguridad | Personas y propietarios, cuentas y permisos para el administrador general, información de la cuenta y comprobación de la conexión. |

La administración de cuentas permite restablecer contraseñas y asignar acceso por propiedad según el rol. La aplicación carece de una operación de respaldos para el usuario. La opción se omite hasta que exista esa capacidad.

## Selección y creación en contexto

El buscador muestra opciones mientras se escribe. Puede consultarse por nombre y otros datos de la entidad, entre ellos apellido, documento, teléfono, correo, código, dirección o referencia externa. El ID interno admite búsqueda opcional. El texto seleccionado presenta una descripción y el formulario usa el ID autorizado. Las flechas recorren resultados, Intro selecciona, Escape cierra y los controles Cambiar y Quitar permiten revisar la selección. Los estados simples conservan sus desplegables.

Las búsquedas de casas, personas, propietarios, contactos y cuartos contemplan paginación de 12 registros en el backend para conjuntos grandes. El servidor aplica el alcance de registro y la propiedad autorizada. Los resultados transaccionales acotados a una casa o reporte se filtran sobre el conjunto ya cargado. Las validaciones de escritura siguen comprobando cada relación.

- **Casa y cuarto.** La ficha de una casa abre su cuarto con la casa seleccionada. El listado Cuartos permite elegir una casa o iniciar su alta. En la casa se puede crear un propietario. Cada registro exige su propia confirmación y al volver queda seleccionado. El código del cuarto es el que ve la persona. MySQL genera los ID internos.
- **Contratos y reservas.** El contrato guía por casa, espacio y fechas, inquilino y firmantes, precio y condiciones, y confirmación. Se puede dar de alta una casa, un cuarto o un inquilino desde el asistente. La reserva permite registrar una casa, un cuarto o una persona sin perder fechas ni modalidad. La conversión conserva el origen y las fechas de la reserva. Los contratos pueden guardarse como borrador y abrirse nuevamente en Contratos.
- **Cobro desde deuda.** Abre el importe pendiente con el titular y la moneda. El registro propone aplicar a esa deuda hasta su saldo disponible y muestra el importe antes de confirmar. El sobrante dispone de los tratamientos explícitos existentes. La clave de operación se conserva durante los reintentos.
- **Servicios.** Un recibo puede empezar sin suministro. El formulario abre el alta del suministro, vuelve con la cuenta seleccionada y conserva los importes y referencias ya introducidos. Medidores, lecturas, repartos y correcciones conservan su historial.
- **Otras personas y cuentas.** Los formularios de finanzas pueden registrar personas para gastos, cobros y pagos. Las condiciones de anticréticos admiten alta contextual de titulares, responsables y personas autorizadas. La creación de una cuenta puede conservar el alta de persona en la misma operación según el rol.

Los diálogos mantienen montado el formulario precedente. Los formularios de alta y las operaciones con cambios detectados confirman antes de cambiar de sección, cancelar o salir. Los borradores persistentes se apoyan en los estados existentes del servidor, como los de contratos y recibos. Los formularios abiertos conservan sus valores en memoria durante la interacción. Las credenciales y los importes introducidos no se almacenan en `localStorage` ni `sessionStorage`.

## Cambios por pantalla

| Vista | Situación anterior | Corrección | Archivos | Prueba | Estado de verificación |
| --- | --- | --- | --- | --- | --- |
| Entrada e Inicio | Tras entrar se abría Propiedades. | Inicio muestra saldos y próximos vencimientos autorizados. | `App.tsx`, `WorkspaceHome.tsx` | `navigation.spec.ts`, `connection.spec.ts`, resumen de backend. | Inicio de sesión, resumen y conexión comprobados. |
| Menú superior y lateral | Las funciones estaban juntas en una lista extensa. | Seis grupos, opciones contextuales y menú plegable. | `WorkspaceNavigation.tsx`, `workspace.css` | `navigation.spec.ts`, `accessibility.spec.ts`. | Orden, lateral, pantalla pequeña y Axe comprobados. |
| Avisos y Pendientes | Los avisos estaban en un módulo separado. | Acceso desde Inicio, filtro de atención y vínculos al origen. | `Reminders.tsx`, `PaymentReports.tsx`, `App.tsx` | `reminders.spec.ts`. | Vencimientos, atención y verificación de pagos comprobados. |
| Mis casas | Se pedía salir a Personas para registrar propietarios. | Filtrado de casas, alta de propietario en un diálogo y enlaces a operaciones de la casa. | `Properties.tsx`, `People.tsx` | `registry.spec.ts`, `contextual-registry.spec.ts`. | Registro, edición y alcance por rol comprobados. |
| Cuartos | El alta se iniciaba en una ficha de casa. | Alta directa y desde ficha, buscador de casas y creación encadenada. | `Properties.tsx`, `ContextDialog.tsx` | `contextual-registry.spec.ts`. | Tres caminos de alta y conservación de datos comprobados. |
| Disponibilidad e inquilinos | Consulta mediante selector de propiedad en módulos separados. | Búsqueda por casa, acceso desde la ficha y ocupación bajo Inquilinos. | `tenancy/Screens.tsx`, `App.tsx` | `tenancy.spec.ts`, `navigation.spec.ts`. | Fechas, disponibilidad e historial comprobados. |
| Contratos | Ocho pasos con selectores largos. | Cuatro pasos, buscadores, altas de dependencias, restauración de borrador. | `ContractWizard.tsx`, `tenancy/Shared.tsx` | `Tenancy.test.tsx`, `tenancy.spec.ts`. | Alquiler diario y mensual, edición y borrador comprobados. |
| Reservas | Para seleccionar relaciones se recorrían listas. | Búsqueda de espacio y persona, alta contextual y continuidad en la conversión. | `ReservationForm.tsx`, `Tenancy.tsx` | `tenancy.spec.ts`. | Alta de persona, alta de cuarto y conversión comprobadas. |
| Anticréticos | La búsqueda se hacía recorriendo tarjetas y listas. | Filtros por contrato y casa, búsqueda y alta de personas relacionadas. | `Anticreticos.tsx`, `ConditionsForm.tsx`, `CapitalForm.tsx` | `Anticreticos.test.tsx`, `anticreticos.spec.ts`. | Entregas, devoluciones, responsables y permisos comprobados. |
| Cobros y deudas | El cobro salía de una persona sin fijar la obligación. | Área por operación, búsquedas por obligación y deuda preseleccionada al cobrar. | `Finances.tsx`, `finances/Forms.tsx` | `Finances.test.tsx`, `finances.spec.ts`. | Cobro completo y parcial, sobrante y vínculo a deuda comprobados. |
| Gastos, anticipos y garantías | Se mezclaban como pestañas del mismo nivel. | Gastos y desembolsos en su sección, cobros con garantías, saldos y recuperación. | `Finances.tsx`, `finances/Forms.tsx` | `finances.spec.ts`. | Garantía, anticipo, desembolso y pago a tercero comprobados. |
| Servicios y medidores | Selección por listas y alta de suministro separada del recibo. | Búsqueda de casa, cuentas, responsables, cuartos y recibos, con alta contextual. | `Utilities.tsx`, `utilities/ReceiptForm.tsx`, `Services.tsx`, `Meters.tsx` | `Utilities.test.tsx`, `utilities.spec.ts`. | Recibo, suministro nuevo, lecturas, reemplazo e historial comprobados. |
| Repartos | Las referencias a personas y contratos eran desplegables. | Búsqueda por persona y contrato dentro de las relaciones válidas del recibo. | `ConfigurationFields.tsx`, `ResolutionForm.tsx` | `utilities.spec.ts` y suite de backend. | Umbral de 15 días y correcciones comprobados. |
| Consentimientos y pagos informados | El usuario recorría selectores para elegir personas y movimientos. | Buscadores por destinatario, titular, obligación e ingreso; confirmación manual conservada. | `Consents.tsx`, `MessageComposer.tsx`, `PaymentReports.tsx` | `Reminders.test.tsx`, `reminders.spec.ts`. | Consentimientos, envío manual y verificación comprobados. |
| Reportes y PDF | Filtros por listas y contrato identificado principalmente por número. | Filtros buscables y descripciones de contexto, entradas de ocupación, historial y PDF. | `Reports.tsx`, `reports.ts`, `backend/app/services/reports.py` | `Reports.test.tsx`, `reports.spec.ts`, pruebas de metadatos. | Filtros, gráficos, permisos, conciliación y PDF comprobados. |
| Personas | Había que recorrer el listado. | Filtrado y formulario reutilizable de altas. | `People.tsx` | `PhaseOne.test.tsx`, `registry.spec.ts`. | Altas, edición y permisos comprobados. |
| Usuarios y seguridad | La vinculación de cuenta usaba una lista y repetía datos. | Búsqueda de persona, cuenta y casas autorizadas, con límites según rol. | `Users.tsx`, `App.tsx` | `UserIdentity.test.tsx`, `registry.spec.ts`. | Cuenta nueva, asignaciones, alias y conexión comprobados. |

Las rutas de búsqueda y del resumen usan FastAPI y consultas de lectura. El resumen de Inicio reutiliza los importes del reporte sin bloquear las tablas de operaciones. La estructura de MySQL y las migraciones Alembic se conservan. Las reglas de contrato, reparto, contabilidad, capital, auditoría y envío manual siguen en los servicios vigentes.
