# Bitácora de Cambios - RutaTica

## Fecha

2 de septiembre de 2026 (America/Costa_Rica).

## Resumen

Intervención incremental sobre el planificador existente. Se corrigió la semántica de distancia/duración, se añadió un cliente desacoplado para OpenTripPlanner 2 con fallback GTFS, se mejoraron calendario, geometría, geolocalización, mapa y presentación móvil. `db/custom.db` fue auditada únicamente con lecturas: no se borró, recreó, migró ni modificó.

## Archivos modificados

### `.gitignore`
- Permite versionar `.env.example` sin exponer `.env`.
- Motivo: documentar la configuración OTP de forma segura.

### `.env.example`
- Documenta `DATABASE_URL` y `OPEN_TRIP_PLANNER_URL` sin credenciales ni endpoint hardcodeado.

### `src/lib/spatial.ts`
- Añade distancia acumulada de polilíneas y recorte ordenado de shapes entre subida/bajada.
- Motivo: distinguir línea recta de distancia realmente recorrida.

### `src/lib/time-utils.ts`
- Resuelve todos los `service_id` activos por fecha, rango, día semanal y excepciones de `calendar_dates`.
- Motivo: no asumir que los IDs siempre se llaman `weekday`, `saturday` o `sunday`.

### `src/lib/otp-client.ts`
- Cliente server-side del API GTFS GraphQL de OTP 2, timeout, validación básica, decodificación de geometría y fallback seguro.

### `src/app/api/best-route/route.ts`
- Prefiere OTP configurado; conserva GTFS local si falta o falla.
- Expone `distanceKm`, `transitDistanceKm`, `walkingDistanceKm`, `distanceSource`, `durationSource` y `routingSource`.
- Usa horarios GTFS y recorta la shape al tramo elegido; reconstruye por paradas cuando los datos no alcanzan.

### `src/app/page.tsx`
- Consume distancia total en lugar de presentar caminata como distancia del viaje.
- Dibuja primero geometría OTP/GTFS y sólo conserva OSRM como fallback existente.
- Presenta distancia y tiempo por separado.
- Elimina el banner gráfico grande, conserva el logo del menú y mejora controles/errores de geolocalización.
- Sustituye `100vh/100vw` rígidos por la clase móvil adaptativa.

### `src/components/map.tsx`
- Conserva Zoom In/Zoom Out y añade Set Focus accesible.
- Set Focus prioriza ruta, luego origen/destino y finalmente ubicación.
- Aumenta controles a 44 × 44 px sin interferir con zoom manual.

### `src/components/app-icons.tsx`
- Punto central para los iconos de mapa; aquí pueden sustituirse al recibir los definitivos.

### `src/app/globals.css`
- Añade `100svh`/`100dvh`, safe areas, prevención de overflow horizontal y comportamiento táctil/overscroll.

### `docs/OPEN_TRIP_PLANNER.md`
- Contrato, variable, fallback e infraestructura OTP pendiente.

### `docs/POSTGIS_MIGRATION_PROPOSAL.md`
- Propuesta no destructiva SQLite → PostgreSQL → PostGIS.

## Distancia y tiempo

Antes, la UI asignaba `walkingDistanceKm` al campo “distancia”, por lo que informaba sólo la aproximación Haversine desde A/B a sus paradas. La shape completa tampoco se recortaba al tramo abordado.

Ahora `distanceKm = caminata de acceso + recorrido de transporte + caminata de egreso`. La preferencia de fuentes es: OTP, diferencia de `shape_dist_traveled`, longitud del segmento de shape GTFS y, por último, geometría ordenada de paradas. Haversine se conserva para proximidad y para sumar segmentos cortos, no como distancia A–B del viaje. La duración OTP es la del itinerario; en fallback local se calcula con `departure_time` de subida, `arrival_time` de bajada, espera de transferencia y caminatas.

## Routing / OpenTripPlanner

Se implementó un cliente server-side para el endpoint GTFS GraphQL configurado en `OPEN_TRIP_PLANNER_URL`. Usa la consulta oficial `plan`, legs, distancias, duración y geometría. No hay dominio/puerto codificado ni resultados simulados. Timeout: 8 segundos. Ante variable ausente, HTTP/error GraphQL o respuesta inválida, se usa GTFS local.

Se eligió GTFS GraphQL porque el proyecto usa GTFS y la API REST de OTP fue retirada en 2025. `plan` sigue disponible pero está deprecado a favor de `planConnection`; la actualización debe validarse contra el esquema de la versión OTP fijada al desplegar. Pendientes de infraestructura: servidor OTP 2, GTFS ZIP, extracto OSM PBF, grafo, TLS, health checks y pruebas de zona/feed ID.

## GTFS

Conteos auditados: 3 agencias, 3 calendarios, 13 excepciones, 18 rutas, 88 paradas, 72 viajes, 396 stop_times, 169 puntos de shape (10 shape IDs), 6 tarifas, 19 reglas y 121 StopRoute.

Relaciones principales agency→route→trip→stop_times y stop→stop_times son correctas. `GtfsTrip.shape_id` no tiene relación Prisma porque `GtfsShape.shape_id` se repite por punto. Hallazgos: 50 de 72 viajes referencian un `shape_id` sin puntos; 0 stop_times contienen `shape_dist_traveled`; no hay excepciones de calendario huérfanas. Las shapes existentes sí pueden reconstruirse por `shape_pt_sequence`; las faltantes requieren corregir el feed. Los horarios y `stop_sequence` permiten duración y orden.

Índices actuales útiles: rutas por agencia, trips por ruta/service/shape, stop_times por trip/stop/arrival, shapes por shape_id y paradas por lat/lon. Recomendados para una migración revisada: `(trip_id, stop_sequence)`, `(shape_id, shape_pt_sequence)`, unicidad equivalente si el feed la cumple, `(service_id, date)` en excepciones y `(routeId, sequence)`/unicidad de StopRoute. No se aplicaron para evitar divergencia o escritura en SQLite.

Campos GTFS a evaluar: `feed_info`, `frequencies`, `transfers`, `pathways`, niveles, atributos completos de ruta/parada y GTFS Realtime. `CalendarDate` debería relacionarse lógicamente con service, considerando feeds válidos sin `calendar.txt`.

## PostGIS

PostGIS beneficiaría cercanía de paradas, corredores, transferencias y matching espacial. Se propone `geography(Point,4326)` + GiST, `ST_DWithin` para filtro y `ST_Distance` para orden; `ST_MakePoint`/`ST_SetSRID` para carga y `ST_Transform` sólo cuando se requiera otra proyección. Prisma cubre el CRUD general, pero estas funciones deben encapsularse en `$queryRaw` parametrizado. No se implementó migración ni cambio de provider.

## Mobile

- Altura dinámica con fallback `100vh`, `100svh` y `100dvh`.
- Safe areas superior/inferior para iPhone.
- Sin ancho `100vw`, `overflow-x` bloqueado y ancho mínimo controlado.
- Controles primarios del mapa/menú con objetivo táctil de 44 px.
- Panel lateral con overscroll contenido y scroll propio.
- Gestos del mapa contenidos; el zoom de rueda existente sigue desactivado para evitar scroll accidental.

## Mapa

- Zoom In y Zoom Out permanecen y llaman `map.zoomIn()`/`map.zoomOut()`.
- Set Focus usa `fitBounds` para ruta o A/B y `setView` para una única ubicación; tiene `title` y `aria-label`.
- Geolocalización inicial: alta precisión, timeout 12 s y caché 30 s. Tracking: alta precisión y caché 5 s. Se diferencian rechazo, timeout y falta de soporte sin bloquear el planificador.

## UI

- Se eliminó sólo `/RutaTica_bus.png` como banner de cabecera.
- Se conserva `/RutaTica_Logo.png` en el menú.
- Se añadió una fila explícita “Distancia” junto al “Tiempo”.
- Iconos nuevos centralizados en `src/components/app-icons.tsx`; los activos definitivos siguen pendientes.

## Bugs corregidos

- Distancia de caminata presentada incorrectamente como distancia total.
- Shape completa dibujada/medida en vez del segmento de viaje.
- Servicio GTFS elegido por nombre fijo en lugar de calendario real.
- Falta de mensajes diferenciados de geolocalización.
- Viewport móvil rígido y objetivos táctiles pequeños.
- Ausencia de control para reencuadrar el mapa.

## Tests ejecutados

- `npm run lint`: FAIL (23 errores de reglas React Compiler ya presentes en el código activo y dos directorios de backup; incluye declaraciones usadas antes de definirse, setters dentro de effects y `mapRef.current` en dependencias). No se alteraron los backups ni se amplió esta intervención a una refactorización completa de hooks.
- `npx prisma generate`: PASS (Prisma Client 6.19.3).
- `npx tsc --noEmit`: FAIL por errores preexistentes incluidos por `tsconfig` en backups, examples, seed y APIs antiguas (modelos Prisma obsoletos, dependencia websocket ausente y tipos históricos). Los errores de nulabilidad detectados en el archivo modificado fueron corregidos; el build real de Next sí compiló.
- `npm run build`: BLOQUEADO por Turbopack del entorno al intentar abrir un puerto interno; el primer intento también encontró red restringida para Google Fonts.
- `npx next build --webpack`: PASS; compiló, generó 19 páginas y todas las rutas API.
- `npm test -- --runInBand`: NO DISPONIBLE (`package.json` no define script `test`).
- Auditoría Prisma de sólo lectura: PASS; `custom.db` permaneció intacta.
- `git diff --check`: PASS.

## Cambios pendientes

- Desplegar y fijar una versión real de OTP 2; configurar `OPEN_TRIP_PLANNER_URL` y validar el esquema.
- Corregir/reimportar desde una fuente GTFS confiable los 50 `shape_id` sin geometría y poblar `shape_dist_traveled` cuando el productor lo ofrezca.
- Añadir pruebas automatizadas/browser E2E para permisos GPS, Safari iOS y controles Leaflet; no existe framework de tests hoy.
- Ejecutar la matriz manual en dispositivos físicos y navegadores reales.
- Recibir y sustituir los iconos definitivos en el punto central indicado.
- Provisionar PostgreSQL/PostGIS y ensayar la migración con copias, respaldos y validación antes de cualquier cambio de producción.
- Migrar de `plan` a `planConnection` cuando se fije la versión/esquema OTP objetivo.

---

## 2026-09-06 - Restauración y ajuste responsive del banner original del bus

**Fecha:** 2026-09-06

**Proceso:** Restauración y ajuste responsive del banner original del bus

### Problema

El banner superior había sido reemplazado por una franja roja plana.

### Cambio realizado

Se restauró la imagen original del bus usada anteriormente en el banner, reutilizando el asset existente `public/RutaTica_bus.png` sin modificarlo.

### Ajuste visual

- La imagen del bus fue adaptada al tamaño actual del banner.
- Se mantuvo su proporción mediante `object-fit: cover`.
- Se ajustó el encuadre para desktop y móvil.
- Se evitó que tape el logo o los controles mediante capas y ajustes responsive.
- Se mantuvo la identidad roja de RutaTica donde corresponde, con el fondo y el overlay del banner.

### Archivos modificados

- `src/app/page.tsx`: restauración de la imagen del bus y ajuste responsive del logo y del texto del encabezado.
- `src/app/globals.css`: encuadre y overlay del banner para desktop y móvil.
- `BITACORA_DESARROLLO.md`: registro de la implementación y sus validaciones.
- `BITACORA_CAMBIOS.md`: incorporación de esta entrada.

### Resultado

- Banner restaurado.
- Responsive validado en desktop (1440 × 900 px) y móvil (390 × 844 px) con Firefox headless, según la validación registrada en `BITACORA_DESARROLLO.md`.
- Funcionalidad del mapa sin cambios.

### Funciones no afectadas

- Zoom In
- Zoom Out
- Set Focus
- Routing
- OTP
- Base de datos
