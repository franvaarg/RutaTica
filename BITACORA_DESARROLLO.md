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

---

## 2026-09-02 - Desactivar la salida standalone en Vercel

### Problema

El build de Vercel fallaba con `ENOENT: no such file or directory, open '/vercel/path0/.next/next-server.js.nft.json'`.

### Causa probable

La opción `output: "standalone"` estaba activa de forma incondicional y entraba en conflicto con el proceso de trazado y empaquetado que realiza la integración de Next.js en Vercel.

Durante la validación local también se detectó que Next.js 16.3.4, ejecutado con Node.js 24.20.0, no conseguía capturar el JSON generado por el CLI de TypeScript mediante `--showConfig`, aunque el mismo comando ejecutado directamente sí devolvía JSON válido.

### Archivo modificado

- `next.config.ts`
- `BITACORA_DESARROLLO.md`

### Solución aplicada

- Se cambió `output: "standalone"` por `output: process.env.VERCEL ? undefined : "standalone"`, de modo que Vercel use su salida administrada y los demás entornos conserven la salida standalone.
- Se añadió `experimental.useTypeScriptCli: false`, conforme a la documentación incluida con Next.js 16.3.4, para usar la API de TypeScript 5 y permitir la validación local con Node.js 24.20.0.
- No se modificaron las demás opciones ni los scripts de `package.json`.

### Resultado del build

- `npx next build --webpack`: **PASS**.
- La compilación de producción terminó correctamente y generó las 19 páginas estáticas previstas.
- El primer intento falló antes de compilar porque Next.js no pudo interpretar la salida capturada de `TypeScript --showConfig`; tras aplicar el ajuste documentado para usar la API de TypeScript, el segundo intento finalizó con código de salida 0.

---

## 2026-09-02 - Validación segura de archivos en la API de descarga

### Error

El build reportaba un error de TypeScript en `src/app/api/download/route.ts` porque el resultado de `allowedFiles[filename]` podía ser `undefined` al pasarlo directamente a `path.join`.

### Causa

`filename` se obtiene del parámetro `file` de la query string mediante `request.nextUrl.searchParams.get`, por lo que puede ser `null`. Además, `allowedFiles` estaba declarado como `Record<string, string>` y la ruta se consultaba varias veces mediante una clave procedente de la solicitud, sin conservar en una variable el valor ya validado.

### Solución

- Se declaró `allowedFiles` como una allow-list literal e inmutable.
- Se añadió un type guard basado en `Object.hasOwn` para aceptar únicamente claves propias de `allowedFiles`.
- Se valida que `filename` exista, sea de tipo `string` y corresponda a una clave permitida antes de acceder a la allow-list.
- La ruta asociada se guarda en `relativePath` y se vuelve a validar antes de usarla, sin aserciones de tipo, operador de non-null ni desactivación de validaciones.
- La ruta final se resuelve desde `process.cwd()` y se comprueba que permanezca dentro del directorio del proyecto, evitando path traversal. No se aceptan rutas arbitrarias enviadas por el usuario.

### Validación

- `npx next build --webpack`: **PASS**. Compilación completada y 19 páginas generadas.
- Comprobación TypeScript aislada de `src/app/api/download/route.ts`: **PASS**.
- `git diff --check`: **PASS**.
