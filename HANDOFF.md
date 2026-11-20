# Celeste Air — Handoff del proyecto

Actualizado: 20 nov 2026
Estado: app funcional, `npm run build` pasa, persistencia local en `localStorage`, sin backend.

## Cómo retomar

```powershell
cd C:\Users\dublan\celeste
npm install        # solo si falta node_modules
npm run dev        # http://localhost:5173
npm run build      # verificación de producción
npm run preview    # opcional, sirve dist/
```

Prompt sugerido para una sesión nueva:

> Continúo el proyecto Celeste Air en `C:\Users\dublan\celeste`. Lee primero `HANDOFF.md`, `src/App.jsx`, `src/data.js` y `src/index.css`. Mantén la funcionalidad actual y la estética de aerolínea clásica en blanco.

## Objetivo original

Rehacer `Celeste Air · Sistema de reservas.html` (HTML monolítico original, intacto en la raíz) como app React + Vite + Tailwind, conservando toda la funcionalidad y cambiando la estética a blanco clásico de aerolínea. Sustituir las tarjetas SVG de ciudades por fotografías reales libres de regalías, servidas localmente.

## Stack y configuración

- React 19.3.1 + React DOM 19.3.1
- Vite 8.3.8, `@vitejs/plugin-react` 6.3.0
- Tailwind CSS 4.3.5 vía `@tailwindcss/vite`
- Sin router, sin librería de estado, sin librería UI
- Fuentes Google: Bodoni Moda (display) y Archivo (UI) en `index.html`
- Scripts: `dev`, `build`, `preview`
- `sharp` y `playwright-core` se usaron solo para convertir imágenes y capturar pantallas; ya fueron desinstalados.

## Archivos clave

- `src/App.jsx` — toda la UI y lógica en componentes: `Header`, `Home`, `Results`, `SeatSelection`, `Checkout`, `Ticket`, `Login`, `Trips`, `Payments`, `Profile`, `Panel`, `Footer`, además de `Plane`, `Photo`, `Steps`, `QR`, `PaymentReceipt`, `CancellationDialog`, `CancellationReceiptDialog` y `Kiosco`. Integra catálogos y sesión derivada de `Usuario`; el módulo `kioscoService` expone `leerBoleto`, `validarPasajero`, `registrarCheckIn` e `imprimirPase`. Los perfiles de pasajero se derivan/normalizan en `defaultProfile` y `normalizePassengerProfiles`; `acumularMillasPorVuelo` aplica `MILES_FACTOR` con idempotencia por `clave` de vuelo. El bloqueo de asientos usa `SEAT_HOLD_MS`, `SEAT_HOLD_WARNING_MS`, `SEAT_HOLD_CLEANUP_MS`, `expirarBloqueo` y `reservaService.confirmar`.
- `src/catalogs.js` — semillas de catálogos, esquemas por entidad, validadores, unicidad, integridad referencial y migración desde `AP` + `celeste.airports.v1`. Incluye `ROLE_INFO`, esquema `aviones` con capacidades calculadas, esquemas `tripulantes`/`horariosVuelo` con acción “Generar vuelos” y esquema `dispositivosCheckIn` con 2 kioscos semilla.
- `src/seats.js` — disposición por clase, capacidades, generación de asientos y helpers para resolver el avión de un vuelo, clase/precio de un asiento y aviones con reservas.
- `src/operations.js` — vuelos instanciados por horario: `AsientoVuelo`, asignación de tripulación, detección de solapamientos (avión 45 min / tripulante 60 min), transiciones de estado, generación con resumen de creados/omitidos y siembra de vuelos demo para los próximos 30 días desde los horarios activos.
- `src/pricing.js` — motor de búsqueda pública: vuelos vendibles filtrando por ruta/fecha y estados no vendibles, tarifas activas con precio `precioBase × factorPrecio`, precio mínimo por destino y fechas cercanas sugeridas; también propaga `politicaCancelacion` y `moneda` de la tarifa vendida.
- `src/CrudManager.jsx` — motor CRUD genérico: tabla con búsqueda/orden/paginación, formulario modal accesible, campos calculados, vista previa de mapa, acciones por fila con rango de fechas, confirmación de eliminación y mensajes de éxito/error. Exporta `Dialog` para reutilizarlo en el panel.
- `src/data.js` — aeropuertos `AP`, generación determinista de vuelos con `rnd`, filas/columnas, precios por cabina, asientos ocupados, reservas semilla `BOOK`, vuelos admin `ADM`, utilidades (`COP`, `tm`, `du`, `fd`, `iso`) y rutas de imágenes `IMAGES` + créditos `CREDITS`.
- `src/index.css` — tokens de Tailwind (`@theme`), estilos base, `.airmail`, `.perf`, animaciones de hero, pulso del contador `.hold-timer--warning` y reglas de impresión.
- `src/storage.js` — `usePersistedState`, claves versionadas (`KEYS`, incluidas `celeste.deviceActivity.v1`, `celeste.passengerProfiles.v1` y `celeste.seatHold.v1`), lectura tolerante a JSON inválido, escritura silenciosa si el almacenamiento falla y `clearPersisted()`.
- `src/main.jsx` — entrada React.
- `index.html` — metadatos, fuentes, `viewport-fit=cover`, tema blanco.
- `public/photos/*.webp` — 9 fotos locales optimizadas: hero, Barranquilla, Bogotá, Medellín, Cartagena, Cali, Panamá, Miami, Madrid.
- `Celeste Air · Sistema de reservas.html` — referencia original, no modificar.
- `dist/` — generado por build; no es fuente.

## Rutas y guards

Rutas por hash, sin dependencias: `home`, `results`, `seats`, `checkout`, `ticket`, `login`, `trips`, `payments`, `profile` (alias `perfil`), `panel`, `checkin`, `boarding`, `luggage`, `kiosco`.

Guards en `App.jsx`: `seats` requiere vuelo, `checkout` requiere vuelo y usuario `pas`, `ticket` requiere reserva, `trips`/`panel` requieren usuario, `payments` y `profile`/`perfil` requieren usuario `pas`, `checkin` requiere reserva confirmada, `boarding` requiere un pasajero con check-in realizado, `luggage` requiere reserva. `#kiosco` es público, oculta Header/Footer y usa barra propia con solo “Celeste Air” y el código del dispositivo; si el dispositivo deja de estar `Activo`, vuelve a la selección. Hash inválido vuelve a `home`; cambio de hash hace scroll al inicio.

## Funcionalidad implementada

- Búsqueda con validación de origen distinto y fecha obligatoria; consume los vuelos reales de `celeste.operations.v1` generados desde horarios del panel.
- Resultados por ruta/fecha, ordenables por precio, hora de salida o duración; solo aparecen vuelos con tarifa vigente activa, excluyendo `Cancelado` y `Finalizado`.
- Precio mostrado = menor `precioBase × factorPrecio` entre las tarifas activas vigentes para la fecha; `tarifaBase` viaja aparte para que `seatPrice` no vuelva a aplicar el factor de clase.
- Si no hay resultados se muestra `No hay vuelos para esa fecha. Prueba con estas fechas cercanas` con hasta 3 fechas alternativas con vuelos vendibles.
- La siembra inicial crea tarifas en `Activo`, horarios activos y vuelos generados para los próximos 30 días, así que la búsqueda pública nunca nace vacía; desactivar una tarifa oculta al instante los vuelos que solo dependían de ella.
- Reservas antiguas se migran desde `celeste.flights.v1`/`ADM` a `celeste.operations.v1` y siguen funcionando en ticket, check-in y mis reservas.
- Selección de asientos con mapa dinámico según el avión asignado al vuelo: Primera 2 plazas por fila (A/F), Business 4 (A/C/D/F) y Económica 6 (A–F). Precios por cabina, asientos ocupados deterministas y desplazamiento del asiento más antiguo si se supera el número de pasajeros.
- Checkout por pasajero + pago con validaciones; crea reserva al inicio de la lista, guarda entidad `Pago` (`codigoPago`, `codigoReserva`, `monto`, `moneda`, `metodoPago`, `fechaPago`, `estadoPago`, `referenciaTransaccion`, `numeroCuotas`) y copia en la reserva la política de cancelación vigente de la tarifa; abre ticket.
- Login sin contraseña: lista usuarios `Activo` del catálogo `Usuario`; los inactivos no aparecen ni pueden mantener sesión. `next` redirige a checkout solo para `pas`.
- “Mis reservas”: ver ticket, hacer check-in, ver pases, anular check-in, abrir “Historial de pagos” y cancelar con confirmación previa. Cancelar calcula horas restantes, tramo de la política copiada, porcentaje, monto pagado, reembolsado y retenido; solo permite reservas `Confirmada` con vuelo no salido y sin check-in; al confirmar marca `Cancelada`, libera asientos, actualiza `Pago` a `Reembolsado`/`Reembolso parcial`/`Sin reembolso`, crea `Reembolso` si el monto es mayor que cero y registra auditoría. Si la tarifa no tiene política, se usa `DEFAULT_CANCEL_POLICY` (`>72 h 100%`, `24–72 h 50%`, `<24 h 0%`) y se avisa en checkout y en la confirmación.
- “Historial de pagos” (`#payments`): tabla por reserva con método, cuotas, monto, estado del pago y reembolso; comprobante imprimible `.receipt` con datos del pago y del reembolso. Las reservas migradas sin `Pago` reciben uno automáticamente al cargar.
- Dispositivo de check-in (`#kiosco`): selección inicial de dispositivo `Activo`, sin bienvenida ni temporizador; botones táctiles de ≥56 px, alto contraste, una acción principal por pantalla e indicador de progreso. `kioscoService.leerBoleto` acepta código de reserva, código `RESERVA-ASIENTO` o boletos de demostración; rechaza reservas inexistentes y vuelos de otro aeropuerto indicando dónde hacer el check-in. El paso 2 reutiliza reserva `Confirmada`, ventana 24 h–1 h y pasajero sin check-in, muestra nombre/vuelo/asiento/equipaje y permite elegir pasajero. `registrarCheckIn` escribe `p.checkin.codigoDispositivo`, reutiliza `.bp`, `imprimirPase` usa `window.print` y `.kiosco-screen` oculta el resto al imprimir; “Nuevo pasajero” reinicia sin perder el dispositivo.
- Panel admin: pestaña “Actividad de dispositivos” con fecha, dispositivo, aeropuerto, pasajero y vuelo de cada check-in de kiosco. Aeropuertos con dispositivos no se pueden desactivar/eliminar; los dispositivos `Inactivo` o `Fuera de servicio` desaparecen de la lista del kiosco.
- Perfil del pasajero (`#profile` / `#perfil`): vista “Mi perfil” con datos personales editables, validación en vivo (correo, celular solo dígitos, fecha de nacimiento no futura, documento obligatorio), botón “Guardar cambios” y mensaje de éxito. Los cambios se guardan en `celeste.passengerProfiles.v1` y se reflejan en la sesión y el catálogo `Usuario`.
- Preferencias de asiento: `ubicación` (`ventana`/`pasillo`/`sin preferencia`) y `zona` (`delantera`/`trasera`/`sin preferencia`). El mapa resalta coincidencias con anillo/discreta marca y la leyenda “Coincide con tus preferencias”, sin seleccionar asientos automáticamente.
- Millas: `distanciaKm` de la ruta × `MILES_FACTOR` (`Económica 0.5`, `Business 1`, `Primera 1.5`). Se acumulan al pasar un vuelo a `Finalizado` para pasajeros de reservas `Confirmada` con check-in, emparejando por documento normalizado; cada vuelo registra un solo movimiento con `clave: codigoVuelo`. El perfil muestra saldo e historial (fecha, vuelo, millas).
- Checkout y boleto muestran “Con este vuelo acumularás N millas”; el checkout precarga nombre, apellido y documento del pasajero principal desde el perfil. No se incluyeron canje de millas, niveles de membresía ni registro/recuperación de contraseña.
- Bloqueo temporal de asientos: al llegar a checkout se persiste `{ codigoVuelo, asientos, expira }` en `celeste.seatHold.v1` por 10 minutos (`SEAT_HOLD_MS`). El checkout muestra “Tus asientos están reservados por mm:ss”; a menos de 2 minutos cambia a estilo de advertencia con `role="status"`. Al vencer se liberan asientos, se muestra “Tu tiempo terminó. Elige tus asientos de nuevo” y se vuelve al mapa. Salir del checkout también libera. `reservaService.confirmar` valida vigencia, vuelo, asientos y que ninguno fue reservado por otra reserva/check-in antes de cobrar; si falla, explica el asiento perdido y no crea reserva ni pago. Limpieza de bloqueos vencidos al cargar y cada 15 segundos. El contador usa `Date.now()` real, no el reloj simulado; no hay sincronización entre pestañas ni estado “Bloqueado por otra persona” en el mapa.
- Ticket tipo pase de abordar con QR determinista (viewBox 21×21) e impresión con CSS `@media print`.
- Check-in `#checkin`: selección de pasajeros (todos marcados por defecto), cambio de asiento con el mapa reutilizado (bloquea ocupados y asientos de otros pasajeros de la reserva), equipaje opcional y confirmación.
- Ventana de check-in: 24 h antes → 1 h antes de la salida; botón deshabilitado fuera de ventana con motivo visible (“Se habilita el …” / “Cerró el …”). Solo reservas `Confirmada`.
- Pase de abordar `.bp`: mismo diseño airmail/perf/QR del ticket, con puerta, terminal, grupo por cabina (Primera 1, Business 2, Económica 3), equipaje y texto “Check-in realizado”.
- Reloj simulado en el footer (“Fecha simulada de hoy”, fecha + hora, “Usar fecha real”): `now()` respeta la simulación para toda la ventana de check-in.
- Equipaje por pasajero (`pax[i].bags`): piezas con id, peso, tipo (Maleta/Mochila/Equipo especial), exceso, costoExtra, `codigoBarras` y estado (`Registrado`/`Pagado`/`Retirado`). Reglas en `BAGGAGE`: Económica 23 kg, Business 32 kg, Primera 40 kg; máximo 3 piezas y 32 kg por pieza; exceso a $15.000 COP/kg. “Anular check-in” deja `pax[i].checkin.hecho` en `false`, libera el pase y marca las piezas como `Retirado`.
- Editor de equipaje en el paso 2 del check-in y en vista `#luggage` (“Equipaje” en Mis reservas): cálculo en vivo, barra de progreso, desglose y validaciones (peso inválido, >32 kg, >3 piezas).
- Pago simulado de exceso con tarjeta (misma validación del checkout): sin pagar el pase dice “Equipaje pendiente de pago”; al pagar las piezas quedan `Pagado` y persisten.
- Cada pieza genera una etiqueta imprimible `.bag-tag` con código `CL-XXXXXX`, barras SVG decorativas, ruta y pasajero; reglas `@media print`.
- Motor CRUD genérico en `src/CrudManager.jsx`: un solo componente configurado por esquema, con búsqueda, orden por columna, paginación de 10, alta/edición en modal accesible (Escape, foco atrapado, foco restaurado), confirmación antes de eliminar y validación en vivo.
- Catálogos administrables: Aerolínea, Aeropuerto, ClaseCabina, Ruta, Tarifa, Usuario, Avión, Tripulante, HorarioVuelo y DispositivoCheckIn. Aeropuerto y Usuario usan `Activo`/`Inactivo`; DispositivoCheckIn usa `Activo`/`Inactivo`/`Fuera de servicio`; los demás borrado duro con bloqueo por referencias.
- CRUD de Avión: modelo, fabricante, aerolínea, año (1990–año actual), estado y filas por clase; capacidades calculadas en solo lectura y vista previa del mapa en vivo. Al guardar se regeneran los asientos con `codigoAsiento`, `numeroAsiento`, fila, columna, clase y ubicación (ventana/pasillo/centro).
- Integridad referencial: no se elimina una aerolínea con aviones, ni un avión con vuelos; tampoco clases/rutas con tarifas. No se puede cambiar la configuración de un avión que ya tiene vuelos con reservas; el mensaje indica cuántos vuelos lo usan.
- Validaciones de catálogo: IATA/ICAO exactos y únicos, correo válido/único, teléfono solo dígitos, URL válida, origen≠destino y par único en rutas, precio>0 y vigencias sin solape en tarifas.
- Panel admin: dashboard con KPIs y gráficos SVG calculados desde reservas/vuelos reales con filtro por rango de fechas, vuelos con edición manual, detalle y transiciones de estado, calendario semanal, notificaciones, pestaña de auditoría y pestañas de catálogos. El toggle activo/inactivo de aeropuertos vive dentro del CRUD.
- Dashboard real: “Reservas en rango”, “Ocupación media”, “Ingresos en rango” y “Cancelaciones”, barras horizontales de ocupación por vuelo/ingresos por ruta/reservas por estado y línea de ingresos por día; SVG a mano, sin librerías, colores del tema y valores en etiqueta.
- Auditoría: cada creación, edición, eliminación y cambio de estado registra `{ fechaHora, usuario, rol, entidad, idRegistro, accion, antes, despues }`; pestaña filtrable por entidad, acción y fecha con detalle expandible de campos cambiados; historial limitado a 500 registros.
- Agente de reservas: solo ve la pestaña “Reservas”, con vuelos/reservas filtrados por `codigoAeropuertoAsignado`, y no recibe catálogos ni auditoría.
- Catálogos ampliados: `Tripulante` (ID, nombre, tipo, licencia, fecha de nacimiento, celular, correo, horas y estado) y `HorarioVuelo` (código, ruta, avión, hora de salida, días, vigencia, temporada y estado). Duración y hora de llegada del horario se calculan desde `tiempoEstimado` de la ruta.
- Generación de vuelos: acción por fila “Generar vuelos” con rango `desde`/`hasta`; crea vuelos únicos en `Programado`, puerta/terminal vacías y `AsientoVuelo` en `disponible`. Resumen exacto: `Se crearon 12 vuelos. Se omitieron 2 por conflicto.`
- Detalle de vuelo: resumen, estado de asientos (`disponible`, `bloqueado`, `reservado`, `ocupado`) y asignación de tripulación; para pasar a `Abordando` exige 1 Piloto, 1 Copiloto y 2 Auxiliares.
- Validaciones de operación: al generar o guardar un vuelo manual se rechazan aviones en `Mantenimiento`/`Retirado`, códigos duplicados y solapamientos de avión (45 min) o tripulación (60 min). No se eliminan tripulantes asignados, aviones con vuelos, rutas con horarios/vuelos ni horarios con vuelos generados.
- Calendario semanal con filtros por aeropuerto y avión, vista por día y acceso al detalle del vuelo. Cancelar un vuelo marca sus reservas `Confirmada` como `Vuelo cancelado`, crea reembolsos 100% sin importar la política de tarifa, actualiza los pagos a `Reembolsado`, crea una notificación con `N reservas reembolsadas` en el texto y en el mensaje del panel, y muestra el contador de avisos en el Header.
- Búsqueda y precios consumen vuelos generados y tarifas del catálogo; el equipaje mantiene las reglas `BAGGAGE`. Los vuelos llevan `codigoAvion` y el mapa público usa los asientos generados.
- Header responsive; en <640 px oculta “Vuelos” y usa “Reservas”/“Panel”.
- Foto con fallback a placeholder si la imagen falla; créditos de fotografía en `<details>` del footer.

## Persistencia (importante)

- Persistencia local en `localStorage` mediante `src/storage.js` (`usePersistedState`), sin backend.
- Claves versionadas: `celeste.bookings.v1`, `celeste.flights.v1` (legacy migrado), `celeste.airports.v1` (solo migración), `celeste.catalogs.v1`, `celeste.operations.v1`, `celeste.audit.v1`, `celeste.user.v1`, `celeste.ticket.v1`, `celeste.query.v1`, `celeste.clock.v1`, `celeste.checkin.v1`, `celeste.pass.v1`, `celeste.luggage.v1`, `celeste.payments.v1`, `celeste.refunds.v1`, `celeste.deviceActivity.v1`, `celeste.passengerProfiles.v1`, `celeste.seatHold.v1`.
- Se guardan: reservas y cancelaciones, pagos y reembolsos, vuelos instanciados con sus estados de asiento/asignaciones/notificaciones, los nueve catálogos (incluidos aviones con sus asientos generados), auditoría (máximo 500 entradas nuevas primero), sesión del perfil con `codigoAeropuertoAsignado`, búsqueda activa, boleto abierto, reloj simulado, reserva en check-in, pase consultado y bloqueo temporal de asientos.
- `celeste.catalogs.v1` se siembra desde `AP`, `AIRCRAFT_SEED`/`PLANE_BY_MODEL`, `ROLE_INFO`, rutas/tarifas base, `CREW_SEED` y `SCHEDULE_SEED`; `BASE_KEYS` permite migrar almacenamientos viejos sin perder los siete catálogos originales.
- Si no existe `celeste.operations.v1`, se inicializa desde `celeste.flights.v1`/`ADM`, normalizando `codigoVuelo`/`codigoAvion`, generando los estados de asiento iniciales y creando vuelos desde los horarios activos para los próximos 30 días.
- `tarifas` usa borrado suave vía `estado`: `Desactivar` deja la fila en el CRUD pero la excluye del motor de precios y de la búsqueda pública.
- `celeste.passengerProfiles.v1` guarda un perfil por `idUsuario` con datos personales, `preferencias`, `movimientos` y `millasAcumuladas`. Al cargar se normaliza contra los usuarios `pas`, se deduplican movimientos por `clave` y se recalcula el saldo; si no hay datos semilla se crea un perfil por usuario pasajero.
- `pax[i].checkin = { hecho, asiento, fecha, equipaje, codigoDispositivo }` se normaliza al cargar (`addCheckin`), así que reservas antiguas sin el campo migran sin perder datos; `codigoDispositivo` solo aparece cuando el check-in lo hizo un kiosco/lector.
- El check-in se escribe en `bookings` (no en un estado paralelo), por eso sobrevive recargas y se refleja en “Mis reservas” y en el pase.
- Boleto se deriva de `bookings` por `bookingCode`: sobrevivir recargas en `#ticket` y reflejar cancelaciones sin estado duplicado.
- Carga tolerante: JSON inválido o forma inesperada cae al valor semilla; si `localStorage` falla, la app sigue en memoria.
- `confirmCancel` y `anularCheckin` comparan por `code` (ya no por identidad de objeto), más robustos tras rehidratación; la reserva guarda copia de `politicaCancelacion`, `codigoTarifa`, `politicaPorDefecto` y `cancelacion`.
- Botón “Restablecer datos de prueba” en el footer: pide confirmación, limpia las claves `celeste.*` y recarga con semillas frescas (`BOOK`/`ADM` con fechas relativas al día).
- Los datos de vuelos y ocupación siguen siendo deterministas por semilla, así que se repiten entre recargas.

## Sistema visual

- Tokens: `paper #ffffff`, `mist #f3f7fa`, `ink #12293d`, `slate #5b6f80`, `rule #dbe4ea`, `azure #1d6e9e`, `azure-deep #14516f`, `celeste #a9d3e6`, `celeste-pale #e6f2f8`, `airmail #bf3b2b`.
- Estética: blanco dominante, tipografía editorial Bodoni, hairlines, esquinas rectas (`rounded-[2px]`), franja airmail roja/azul, ticket con perforación.
- Modo oscuro eliminado intencionalmente (`color-scheme: light`).
- Ajustes recientes: logo del header sin salto de línea a 320 px, hero con mínimo `2.3rem`, layout de asientos centrado, QR corregido, foco visible, `scroll-padding-top`, impresión del ticket y de comprobantes `.receipt`.

## QA realizado

- Capturas desktop 1440 px y mobile 390 px / 320 px; sin overflow horizontal a 320 px (`scrollWidth === innerWidth`).
- Flujo completo probado: búsqueda → asiento → login pasajero → pago → ticket → mis reservas → admin → agente.
- Imágenes verificadas como cargadas (`complete`, ancho natural 960).
- Artefactos conocidos de capturas full-page: header sticky repetido y huecos de lazy-load; no son bugs de la app.
- Check-in probado en flujo completo: fecha simulada dentro de ventana → asiento nuevo → equipaje → pase → recarga (estado “Realizado” y pase persistidos).
- Equipaje probado con Económica: 2 piezas de 20 kg → exceso 17 kg y $255.000; pase emitido sin pago muestra “Equipaje pendiente de pago”; tras pago simulado queda `Pagado` y persiste tras recarga; etiquetas visibles.
- CRUD probado E2E: borrar aerolínea con aviones muestra el motivo y deshabilita el botón; ruta duplicada BAQ→BOG muestra `Ya existe una ruta con ese origen y destino.`; ruta válida se crea y persiste tras recarga; BOG pasa a Inactivo y persiste; tarifas muestran 36 filas en 4 páginas; usuario inactivo desaparece del Login.
- Modal verificado: foco dentro al abrir, cierre con Escape y foco restaurado.
- Flota probada E2E con CDP: los 4 aviones se editan a 2/3/20 y muestran `4 + 12 + 120 = 136` en la vista previa y la tabla; se persisten 136 asientos por avión; el mapa público muestra 136 asientos, 2 en fila 1 y 6 en fila 21; editar un avión con 1 vuelo con reserva muestra `No puedes cambiar la configuración de este avión: tiene 1 vuelo con reserva.`; sin excepciones JS.
- Tarea 3 probada E2E con CDP: persistencia en `celeste.operations.v1`; pestañas de Tripulantes/Horarios/Calendario/Notificaciones; generación HV001 del 23–29 nov 2026 con resumen `Se crearon 7 vuelos. Se omitieron 0 por conflicto.` y 8 → 15 vuelos; asignación Elena/Camila/Lucía/Mateo alcanza `Piloto 1/1 · Copiloto 1/1 · Auxiliares 2/2`; transición a `Abordando`; cancelación con reserva de prueba marca `Vuelo cancelado`, crea aviso y muestra contador en Header; vuelo manual a 08:00 rechazado por `El avión AV-001 choca con el vuelo VL-HV001-20261123.` y a 05:00 guardado; calendario semanal y sin errores JS.
- Tarea 4 probada E2E con CDP (70 checks): 97 vuelos demo en 30 días, 36 tarifas activas, precio demo `53.000` calculado desde tarifa vigente, sin cancelados/finalizados, estado vacío con 3 fechas sugeridas que llevan a resultados, creación completa R-CLO-BAQ + `T-CLO-BAQ-ECO-1` + HV005 + 3 vuelos generados, vuelo `VL-HV005-20261121` visible a `$100.000`, 2 reservas antiguas conservadas y vuelo desaparece al desactivar la tarifa; sin errores JS.
- Tarea 5 probada E2E con CDP (43 checks): dashboard inicial `1` reserva / `$158k` / `0` cancelaciones coincide con `localStorage`, 4 SVG, filtro enero 2026 deja el dashboard en `0`, reserva nueva creada por flujo público cambia KPIs a `2` reservas / `$364k` y genera entrada de auditoría; editar `T-BAQ-BOG-ECO-1` de `53000` a `60000` aparece en Auditoría con ambos valores y en el detalle expandible `precioBase`; agente `BOG` ve solo pestaña “Reservas”, 2 reservas filtradas, sin catálogos ni auditoría; 600 entradas inyectadas se normalizan a 500; sin errores JS.
- Tarea 1 de la nueva ronda probada E2E con CDP (37 checks): cancelación a 50 h muestra desglose `Faltan 50 h`, tramo `Entre 24 h y 72 h antes`, 50% y `$50.000 de $100.000` antes de confirmar; al confirmar reserva `Cancelada`, pago `Reembolso parcial`, `Reembolso` de $50.000 al 50%, auditoría, asiento libre en mapa público y comprobante en “Historial de pagos”; cancelación a 10 h muestra 0%, deja pago `Sin reembolso` y no crea reembolso; check-in bloquea la cancelación hasta “Anular check-in” (equipaje `Retirado`); cancelar vuelo desde panel reembolsa 100% y muestra `1 reserva reembolsada`; sin errores JS.
- Tarea 2 de la nueva ronda probada E2E con CDP (30 checks): semilla `KIO-001`/`KIO-002`, kiosco sin navegación normal, boleto de BOG rechazado en BAQ con indicación de aeropuerto, boleto válido en 3 pasos con multi-pasajero y equipaje, `.bp` e impresión, check-in persistido con `codigoDispositivo`, actividad visible en el panel, fuera de ventana con “Tu check-in abre el …” y confirmación deshabilitada, `Fuera de servicio` oculta el dispositivo, y BAQ no se puede desactivar mientras tenga dispositivos; sin errores JS.
- Tarea 3 de la nueva ronda probada E2E con CDP (46 checks): validación en vivo y guardado persistente del perfil (nombre/documento/correo/preferencias sobreviven recarga), leyenda y resaltado de asientos sin auto-selección, checkout precargado y mensaje de millas en checkout/boleto, vuelo `VL-PER-001` de BAQ→BOG finalizado desde panel con 1.050 millas para el asiento 1A (Primera), movimiento visible en el perfil y sin duplicados al finalizar una segunda vez; sin errores JS.
- Tarea 4 de la nueva ronda probada E2E con CDP (38 checks): llegar a checkout persiste el bloqueo y muestra 10:00 sin tocar el reloj simulado; +8,25 min activa `.hold-timer--warning` con `role="status"` y texto de advertencia; pago a tiempo crea reserva/pago y limpia el bloqueo; +11 min vuelve al mapa con “Tu tiempo terminó. Elige tus asientos de nuevo”, selección y bloqueo limpios, fecha simulada intacta; abandonar checkout libera; bloqueo vencido inyectado se elimina al cargar; una reserva competidora inyectada en el asiento retenido hace que `reservaService.confirmar` rechace el pago sin crear reserva ni pago; sin errores JS.
- Último build: CSS ~44.80 kB, JS ~426.39 kB (gzip ~8.90 / ~119.75 kB).

## Pendientes / ideas

1. Autenticación, backend y pagos reales.
2. Tests unitarios/E2E y auditoría de accesibilidad.
3. Despliegue estático (hash routing no necesita rewrites).
4. Descarga de boleto, etiquetas y comprobantes en PDF (hoy solo impresión CSS).

## Decisiones a conservar

- Mantener paridad funcional con el HTML original.
- No añadir router ni librerías UI.
- Fotos locales WebP, no hotlinks; créditos visibles.
- Datos deterministas para pruebas repetibles.
- Interfaz siempre en blanco; no reintroducir tema oscuro.
- Los vuelos generados desde horarios son la fuente de la búsqueda pública; se filtran por tarifa vigente activa y estado vendible.
- Operación se persiste en clave separada (`celeste.operations.v1`), sin reemplazar el catálogo ni la clave legacy de vuelos.
- Tripulación se asigna en el detalle del vuelo; avisos se consultan desde campana del Header y pestaña “Notificaciones”.
- Dashboard y auditoría se calculan desde `bookings`/`operations`/`catalogs`; no se reintroducen KPIs ni valores de ejemplo fijos.
- Auditoría guarda instantáneas antes/después y el detalle muestra solo campos cambiados; el historial se recorta a 500 para no inflar `localStorage`.
- El rol `age` se resuelve desde el usuario activo y su `codigoAeropuertoAsignado`; la segmentación ocurre antes de pasar datos al panel.
- La política de cancelación se copia en la reserva al vender; cambios posteriores en la tarifa no alteran reservas existentes.
- Pagos y reembolsos son entidades persistidas en claves separadas; el pago se migra desde reservas antiguas al cargar.
- El kiosco es una vista pública sin sesión: la identidad del dispositivo se elige al abrir y se guarda en el check-in y en la actividad; el aeropuerto del dispositivo limita los boletos que puede leer.
- Cancelar nunca elimina la reserva: cambia estado, libera asientos y deja rastro en auditoría e historial de pagos.
- El perfil del pasajero es la fuente de datos personales y preferencias; se persiste por `idUsuario` y empareja reservas por documento normalizado (`docKey`).
- Las millas son solo movimientos por vuelo finalizado con check-in, con `clave: codigoVuelo` para garantizar idempotencia; no hay canje ni niveles.
- Las preferencias solo resaltan asientos: nunca sustituyen la selección manual del pasajero.
- El bloqueo de asientos es simple y local: cuenta con `Date.now()` real, se libera al pagar, expirar o abandonar checkout, y no sincroniza pestañas ni muestra “Bloqueado por otra persona” en el mapa.
