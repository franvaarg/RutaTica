# OpenTripPlanner 2

RutaTica admite un servicio OTP externo mediante `OPEN_TRIP_PLANNER_URL`. El valor debe ser el endpoint completo del API **GTFS GraphQL** de OTP 2 (normalmente termina en `/otp/gtfs/v1`); no hay host ni puerto codificado en la aplicación.

El cliente envía una consulta `plan`, obtiene itinerarios, legs, distancias, duraciones y geometrías codificadas, y aplica un timeout de 8 segundos. Si la variable falta, OTP falla o devuelve un contrato inválido, `/api/best-route` continúa con el planificador GTFS local. No se presentan datos simulados como OTP.

La elección de GTFS GraphQL se debe a que el proyecto usa GTFS. La API REST fue retirada de OTP en 2025. `plan` sigue disponible en OTP 2, aunque está deprecado en favor de `planConnection`; antes de actualizar la consulta se debe probar el esquema exacto de la versión desplegada.

## Infraestructura pendiente

- Empaquetar el GTFS validado como ZIP y obtener un extracto OSM `.pbf` de Costa Rica.
- Desplegar una versión OTP 2 fijada (no una etiqueta flotante), asignar memoria y persistencia suficientes.
- Crear/buildar el grafo con GTFS + OSM, revisar el reporte de importación y `maxStopToShapeSnapDistance`.
- Habilitar GTFS GraphQL, TLS, health checks, límites de tiempo y observabilidad.
- Configurar CORS sólo si el endpoint se expone directamente; RutaTica lo consume desde el servidor.
- Probar IDs/feed ID, zona `America/Costa_Rica`, calendario y resultados representativos antes de producción.

## Revisión de release — 2026-09-08

- Fecha y hora se envían en `America/Costa_Rica`, independientemente del host. La búsqueda local usa la hora actual si no se indica `departAfter` (hora local de hoy, 00–23).
- Se validan coordenadas, valores numéricos no negativos, legs y polilíneas; los errores HTTP, GraphQL, de red y contrato activan el fallback local. El timeout sigue siendo 8 segundos. Los logs de fallback no incluyen URL, credenciales ni payload.
- OTP se consulta antes de leer el calendario SQLite: un OTP operativo puede responder aunque la base local falle. Si el fallback también falla, la API devuelve error; no se afirma que no haya servicio.
- El cliente conserva geometría de transporte al seleccionar tarjetas. Distancia y duración se presentan como estimaciones; una tarifa ausente no se muestra como gratuita.
- La consulta `plan` existente NO fue migrada ni validada contra un servidor OTP real en esta revisión. Su compatibilidad debe probarse con la versión y esquema desplegados. Las afirmaciones históricas sobre disponibilidad/deprecación no sustituyen esa prueba.
- Limitaciones locales: no se buscan viajes del día de servicio anterior después de medianoche; los transbordos usan geometría de paradas; con shapes sin distancias, el recorte por proximidad puede ser ambiguo en bucles. Duración local incluye caminata y espera de transbordo, pero no espera inicial. La caminata es una aproximación, no navegación peatonal validada.
