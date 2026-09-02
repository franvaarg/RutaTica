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
