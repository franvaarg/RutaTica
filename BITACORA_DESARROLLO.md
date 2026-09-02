# Bitácora de Desarrollo - RutaTica

Este archivo es un registro acumulativo. Las nuevas entradas deben agregarse al final sin borrar ni sobrescribir las anteriores.

---

## 2026-09-02 - Mejora integral de cálculo de rutas, mapa y geolocalización

### Objetivo

Corregir la distancia y duración mostradas entre origen y destino, preparar la integración con OpenTripPlanner 2, mejorar el uso del GTFS local y optimizar la experiencia móvil y los controles del mapa.

### Problema encontrado

- La UI presentaba `walkingDistanceKm` como si fuera la distancia total del viaje.
- La duración local dependía de horarios GTFS, pero la distancia del tramo de transporte no se incorporaba correctamente.
- Las shapes se cargaban completas y no se limitaban al segmento entre las paradas de subida y bajada.
- 50 de los 72 viajes GTFS referencian un `shape_id` sin puntos existentes.
- Ninguno de los 396 `stop_times` contiene `shape_dist_traveled`.
- La selección de servicio GTFS asumía nombres fijos como `weekday`, `saturday` y `sunday`.
- No existía un control explícito para volver a encuadrar el mapa.
- La altura principal usaba `100vh`/`100vw`, con riesgo de problemas en navegadores móviles.
- OpenTripPlanner todavía no cuenta con infraestructura desplegada en el proyecto.

### Cambios realizados

- Se añadió un cliente server-side desacoplado para el API GTFS GraphQL de OTP 2.
- Se configuró OTP mediante `OPEN_TRIP_PLANNER_URL`, sin host, dominio ni puerto hardcodeados.
- Se implementaron timeout, manejo de errores y fallback al planificador GTFS local.
- Se separaron distancia total, distancia de transporte y distancia caminada.
- Se añadió cálculo de longitud acumulada sobre polilíneas.
- Se recortan las shapes al segmento entre subida y bajada.
- Cuando faltan shapes o `shape_dist_traveled`, se reconstruye la distancia mediante la secuencia geográfica de paradas.
- La duración local conserva como fuente `departure_time` y `arrival_time`, incluyendo caminatas y espera de transferencia.
- Se corrigió la resolución de servicios activos usando rango de calendario, día semanal y `calendar_dates`.
- La UI muestra distancia y tiempo por separado.
- Se eliminó el banner gráfico grande del encabezado y se conservó el logo del menú.
- Se conservaron Zoom In y Zoom Out y se añadió Set Focus.
- Se mejoraron opciones y estados de geolocalización.
- Se añadieron `100svh`, `100dvh`, safe areas, prevención de overflow horizontal y controles táctiles de 44 px.
- Se centralizaron los iconos de los controles del mapa.
- Se documentaron la infraestructura OTP pendiente y una propuesta futura PostgreSQL/PostGIS.

### Archivos modificados

- `.gitignore`
- `.env.example`
- `BITACORA_CAMBIOS.md`
- `src/app/api/best-route/route.ts`
- `src/app/globals.css`
- `src/app/page.tsx`
- `src/components/app-icons.tsx`
- `src/components/map.tsx`
- `src/lib/otp-client.ts`
- `src/lib/spatial.ts`
- `src/lib/time-utils.ts`
- `docs/OPEN_TRIP_PLANNER.md`
- `docs/POSTGIS_MIGRATION_PROPOSAL.md`

### Decisiones técnicas

- OTP 2 GTFS GraphQL será la fuente preferida cuando exista un servidor configurado.
- El planificador GTFS local permanece como fallback para no eliminar funcionalidad existente.
- Haversine se conserva para cercanía y suma de segmentos, pero no como distancia directa A–B del viaje.
- Se utiliza primero `shape_dist_traveled`; después geometría de shape; finalmente secuencia de paradas.
- No se añadieron migraciones ni índices a SQLite para evitar modificar o desalinear `custom.db`.
- Se documentó PostGIS como migración futura y no como cambio inmediato.
- Se mantuvieron los controles personalizados de Leaflet para preservar el comportamiento actual.

### Comandos ejecutados

- `rg`, `find`, `sed` y consultas Prisma de solo lectura para inspección arquitectónica y auditoría GTFS.
- `npm run lint`
- `npx prisma generate`
- `npm run build`
- `npx next build --webpack`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

### Resultado de pruebas

- `npx prisma generate`: **PASS**. Prisma Client 6.19.3 generado correctamente.
- `npx next build --webpack`: **PASS**. Compilación completada y 19 páginas generadas.
- `git diff --check`: **PASS**.
- Auditoría Prisma de solo lectura: **PASS**.
- `npm run lint`: **FAIL**. Se detectaron 23 errores de reglas React Compiler en código activo y directorios de respaldo; incluyen funciones usadas antes de declararse, actualizaciones de estado dentro de effects y acceso a `mapRef.current` en dependencias.
- `npm run build`: **FAIL** en Turbopack por una restricción del entorno al intentar enlazar un puerto interno. La compilación equivalente con webpack fue exitosa.
- `npx tsc --noEmit`: **FAIL** por errores preexistentes incluidos por `tsconfig` en backups, examples, seed y APIs antiguas, además de modelos Prisma obsoletos y dependencias websocket ausentes.
- `npm test -- --runInBand`: **FAIL** porque `package.json` no define un script `test`.

### Errores encontrados

- Turbopack no pudo crear un proceso que enlazara un puerto dentro del entorno de ejecución.
- La primera compilación tampoco pudo descargar Google Fonts por restricciones de red; se reintentó con acceso autorizado.
- ESLint analiza directorios de backup y reporta errores históricos además de los del código activo.
- TypeScript incluye backups, examples y scripts antiguos incompatibles con el esquema Prisma actual.
- No existe infraestructura ni servidor OTP real contra el cual ejecutar una prueba de integración.

### Estado final

La mejora quedó implementada y el build de producción fue validado con webpack. Zoom In, Zoom Out y Set Focus están presentes. La aplicación dispone de fallback GTFS cuando OTP no está configurado. `db/custom.db` **no fue modificada**, eliminada, recreada ni migrada; todas las operaciones sobre ella fueron de solo lectura. No se ejecutó `prisma migrate reset`.

### Pendientes

- Desplegar y configurar un servidor OTP 2 real con GTFS y OpenStreetMap.
- Validar el contrato GraphQL contra la versión OTP fijada y migrar de `plan` a `planConnection` cuando corresponda.
- Corregir en el feed los 50 `shape_id` sin geometría.
- Incorporar `shape_dist_traveled` desde una fuente GTFS confiable si está disponible.
- Probar geolocalización y UI en Android/iOS reales.
- Añadir un framework de pruebas automatizadas y casos E2E.
- Separar backups/examples del alcance de lint y TypeScript o corregir su deuda técnica.
- Sustituir los iconos centralizados cuando se reciban los activos definitivos.
- Evaluar PostgreSQL/PostGIS en una etapa futura con respaldos e infraestructura aprobados.
