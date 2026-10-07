# RutaTica

Planifica viajes en autobús entre localidades, lugares y paradas de Costa Rica.

**Producción:** https://ruta-tica.vercel.app

## Experiencia de viaje

- La búsqueda unificada de origen y destino combina localidades, lugares y paradas de pasajeros. Identifica cada opción como **Localidad**, **Lugar** o **Parada de bus**, ignora mayúsculas y acentos, y permite lugar → lugar, parada → parada y combinaciones. Prioriza el nombre del lugar buscado sobre coincidencias parciales de paradas o direcciones, también al omitir artículos como “de”. Elegir una parada conserva su identidad como extremo del viaje; elegir un lugar busca paradas útiles próximas. Busca por ciudad, distrito, barrio, localidad o lugar. San Joaquín aparece como localidad de Flores, Heredia. La búsqueda ampliada de lugares y direcciones usa un proveedor compatible con Nominatim; los planteles, garajes y otras instalaciones de empresas se excluyen de las opciones normales.
- El mapa inicial está limpio. **Planificar ruta** abre los campos de origen y destino; **Buscar Ruta** aparece solo con ambos extremos válidos. Elegir un destino no carga paradas genéricas. “Mi ubicación” utiliza el GPS del navegador como origen sin llenar el mapa de puntos.
- “Paradas cerca de mí” es una acción independiente, con radios de 300 m, 500 m, 1 km y 2 km. Iniciar una búsqueda de viaje borra estos marcadores.
- “Tu viaje” muestra duración, buses, caminata, parada de subida, parada de bajada y paradas del segmento seleccionado. El tiempo y **Iniciar viaje** permanecen visibles en el pie de los detalles.
- La ruta seleccionada es azul. El mapa muestra únicamente las paradas entre la subida y la bajada, incluidos los extremos e intermedias; no muestra paradas de otros recorridos. Las etiquetas permanentes se limitan a “Sube aquí” y “Baja aquí”; tocar una parada muestra sus detalles.
- Guarda cualquier origen o destino en este navegador, cambia su nombre a Casa/Trabajo y elimínalo cuando quieras. Las ubicaciones guardadas aparecen al enfocar un campo vacío y en el menú. Se conserva el almacenamiento de versiones anteriores.
- **Iniciar viaje** activa el seguimiento directamente. **Viaje en curso** muestra destino, próxima parada, paradas restantes, cuenta regresiva en minutos y segundos, minutos restantes estimados y dónde bajar. El GPS sigue al pasajero sobre el recorrido; sin permiso de ubicación el viaje continúa con el tiempo transcurrido. Muestra **BAJA EN LA PRÓXIMA PARADA**, **BAJA AQUÍ** y **HAS LLEGADO**, con la caminata final cuando corresponde. El viaje activo conserva su hora de inicio y estimación al recargar. El panel es inferior y compacto en móvil. El destino permanece visible al iniciar el viaje.
- Durante la consulta se muestra **Buscando ruta...** y se bloquean envíos repetidos. Cambiar origen, destino o reiniciar limpia el recorrido y el seguimiento anterior y cancela la consulta pendiente. Los fallos muestran mensajes en español y permiten volver a buscar; un fallo del buscador conserva su aviso hasta la siguiente consulta.

## Datos y duración

El planificador encuentra paradas de pasajeros próximas a las localidades; las coordenadas de una localidad no se convierten en una parada. Un viaje programado exige subida y bajada en orden válido en el mismo viaje, o dos tramos compatibles para un transbordo. Se respetan calendario, horario y restricciones de subida/bajada. Las instalaciones de empresas no son opciones normales de abordaje ni transbordo.

El modelo interno distingue `OFFICIAL_GTFS` (datos de viajes importados en formato GTFS) de `DERIVED_GTFS` (normalización de paradas físicas y trazados). El nombre del primer tipo no certifica la procedencia ni vigencia del feed local: eso requiere evidencia del operador. La aplicación conserva procedencia internamente y no muestra identificadores de fuentes ni secuencias técnicas al pasajero.

- GTFS local: **88 paradas, 18 rutas, 72 viajes y 396 stop_times**. Los tiempos programados vienen de sus `stop_times`; la caminata es aproximada. El feed tiene principalmente salidas matutinas y cobertura geográfica limitada.
- Snapshot normalizado de paradas físicas: **38.657 registros originales**, **37.824 paradas de pasajeros aceptadas**, **833 excluidas** por instalaciones identificadas o coordenadas inválidas. Cada registro tiene `stop_id`, nombre legible, coordenadas WGS84 válidas, `location_type=0` y contexto administrativo. Los IDs originales se conservan internamente. La búsqueda utiliza índices de palabras en el servidor; el navegador recibe como máximo 12 resultados.
- **1.103 features de ARESEP** con geometría aceptada producen **3.487 rutas/trazados separados**, **581.902 puntos de shapes** y **159.398 asociaciones ordenadas**. Los segmentos desconectados de geometrías múltiples permanecen separados. **1.663** trazados tienen paradas y **1.475** tienen al menos dos. Los **1.824** sin paradas no pueden producir itinerarios.
- `db/normalized.db` es un snapshot de producción, incluido en las funciones de Vercel. Contiene `NormalizedStop`, `StopToken`, `RouteFeed`, `RouteStop` y `NormalizationReport`. Cada ruta contiene campos compatibles con GTFS (`route_id`, nombres disponibles, `route_type=3`, `shape_id`), shape con secuencia/distancia acumulada y un viaje mínimo. Hay **3.487 viajes derivados** y **159.398 stop_times**, con secuencia y distancia; **no contienen horas de llegada/salida ni calendarios inventados**.
- Las asociaciones son **inferidas**, con proyección a un corredor estricto de **50 m**, nunca orden de base de datos. Un itinerario estimado exige extremos útiles y subida anterior a bajada en el mismo trazado. No se crea automáticamente el sentido inverso. La geometría y proximidad no certifican horarios, operación vigente ni atención de cada parada; la aplicación distingue `feedType=DERIVED_GTFS` y `scheduleType=ESTIMATED/UNKNOWN` de datos verificados.
- El planificador usa los trazados derivados cuando el GTFS local no ofrece un viaje, incluidos extremos seleccionados por parada. Su duración usa solo el segmento elegido, caminatas, velocidad y detenciones. Los valores se centralizan en `src/lib/transit-estimates.ts`. Se muestra como **tiempo estimado**, nunca como horario oficial.
- `/api/search?q=san%20joaquin` devuelve resultados estructurados de localidades y paradas. `places=1` amplía mediante el proveedor de lugares tras una acción explícita. `/api/transit-data` proporciona conteos y registros representativos del runtime para verificar la publicación.

Para regenerar el snapshot normalizado: `python3 scripts/normalize-transit.py /ruta/a/aresep-features.json`. La entrada es un arreglo de features con paths Esri o geometrías GeoJSON LineString/MultiLineString en EPSG:4326; las geometrías inválidas se rechazan. La normalización conserva separado el snapshot GTFS existente.

## Desarrollo y validación

Next.js 16.3.4, React 19, TypeScript, Leaflet y Prisma/SQLite. La producción de Vercel utiliza el snapshot SQLite incluido; las ubicaciones guardadas usan `localStorage`.

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run build -- --webpack
git diff --check
```

El entorno de desarrollo requiere su configuración de base de datos; no se publican credenciales ni archivos `.env`. Consultar `AGENTS.md` y las guías de la versión instalada de Next.js antes de modificar código.

`scripts/verify-active-trip.cjs` verifica el flujo de escritorio/móvil y puede ejecutarse con `APP_URL=https://ruta-tica.vercel.app` y `PLAYWRIGHT_MODULE` apuntando a una instalación externa de Playwright. Usa el planificador real con una salida matutina para probar el calendario limitado; `LIVE_CURRENT_TIME=1` conserva la hora actual de la consulta. El movimiento GPS se simula. También comprueba que finalizar limpie el recorrido, las paradas, los resultados y el destino. `tests/derived-transit.test.ts` verifica filtrado de instalaciones y el modo estricto de asociaciones confirmadas. El planificador de producción habilita explícitamente itinerarios derivados estimados.

`scripts/verify-unified-journey.cjs` consulta el snapshot real y comprueba búsqueda con/sin acentos, exclusión de instalaciones, las cuatro combinaciones lugar/parada, selección de paradas en la interfaz, mapa con solo las paradas del tramo, contador, persistencia, GPS simulado, aviso de bajada y llegada en móvil/escritorio, además del modo sin GPS. Para verificar el despliegue:

```bash
APP_URL=https://ruta-tica.vercel.app PLAYWRIGHT_MODULE=/ruta/a/playwright node scripts/verify-unified-journey.cjs
```

La búsqueda pública de Nominatim se activa mediante **Buscar lugares**, no con cada pulsación; se cachea y limita a una solicitud por segundo por instancia. El proveedor puede cambiarse con `NOMINATIM_SEARCH_URL`. El uso público debe mantenerse moderado, con el límite agregado de una solicitud por segundo para la aplicación, según la [política de Nominatim](https://operations.osmfoundation.org/policies/nominatim/). Para escalar se necesita un proveedor o instancia propios. La atribución de OpenStreetMap permanece en el mapa.

GitHub `main` dispara el despliegue de Vercel. Después de cada publicación se verifica la aplicación live; una compilación local no sustituye esa comprobación.
