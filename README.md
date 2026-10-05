# RutaTica

Planifica viajes en autobús entre localidades y lugares de Costa Rica.

**Producción:** https://ruta-tica.vercel.app

## Experiencia de viaje

- Busca el origen y destino por ciudad, distrito, barrio, localidad o lugar. San Joaquín aparece como localidad de Flores, Heredia. La búsqueda ampliada de lugares y direcciones usa un proveedor compatible con Nominatim; los planteles, garajes y otras instalaciones de empresas se excluyen de las opciones normales.
- El mapa inicial está limpio. Elegir un destino no carga paradas genéricas. “Mi ubicación” utiliza el GPS del navegador como origen sin llenar el mapa de puntos.
- “Paradas cerca de mí” es una acción independiente, con radios de 300 m, 500 m, 1 km y 2 km. Iniciar una búsqueda de viaje borra estos marcadores.
- “Tu viaje” muestra duración, buses, caminata, parada de subida, parada de bajada y paradas del segmento seleccionado. El tiempo y **Iniciar viaje** permanecen visibles en el pie de los detalles.
- La ruta seleccionada es azul. El mapa muestra únicamente las paradas entre la subida y la bajada, incluidos los extremos e intermedias; no muestra paradas de otros recorridos. Las etiquetas permanentes se limitan a “Sube aquí” y “Baja aquí”; tocar una parada muestra sus detalles.
- Guarda cualquier origen o destino en este navegador, cambia su nombre a Casa/Trabajo y elimínalo cuando quieras. Las ubicaciones guardadas aparecen al enfocar un campo vacío y en el menú. Se conserva el almacenamiento de versiones anteriores.
- **Iniciar viaje** activa el seguimiento directamente. **Viaje en curso** muestra destino, próxima parada, paradas restantes, minutos restantes estimados y dónde bajar. El panel es inferior y compacto en móvil. El destino permanece visible al iniciar el viaje.
- Durante la consulta se muestra **Buscando ruta...** y se bloquean envíos repetidos. Cambiar origen, destino o reiniciar limpia el recorrido y el seguimiento anterior y cancela la consulta pendiente. Los fallos muestran mensajes en español y permiten volver a buscar.

## Datos y duración

El planificador encuentra paradas de pasajeros próximas a las localidades; las coordenadas de una localidad no se convierten en una parada. Un viaje programado exige subida y bajada en orden válido en el mismo viaje, o dos tramos compatibles para un transbordo. Se respetan calendario, horario y restricciones de subida/bajada. Las instalaciones de empresas no son opciones normales de abordaje ni transbordo.

El modelo interno distingue `OFFICIAL_GTFS` (datos de viajes importados en formato GTFS) de `DERIVED_GTFS` (normalización de paradas físicas y trazados). El nombre del primer tipo no certifica la procedencia ni vigencia del feed local: eso requiere evidencia del operador. La aplicación conserva procedencia internamente y no muestra identificadores de fuentes ni secuencias técnicas al pasajero.

- GTFS local: **88 paradas, 18 rutas y 72 viajes**. Los tiempos programados vienen de sus `stop_times`; la caminata es aproximada. El feed tiene principalmente salidas matutinas y cobertura geográfica limitada.
- Paradas físicas: **38.657 registros**. Las rutas y geometrías externas se normalizan bajo demanda en campos compatibles (`routes`, `stops`, `shapes`, `stop_times` con secuencia y minutos estimados), conservando procedencia. No se fabrican calendarios ni horas oficiales.
- Las secuencias inferidas mediante proyección sobre un trazado son candidatas internas. No demuestran que el autobús atienda esas paradas. Solo las asociaciones y el sentido confirmados mediante evidencia revisada pueden producir viajes derivados utilizables; `src/lib/verified-derived-routes.ts` contiene ese registro, actualmente vacío. Tampoco se unen trazados desconectados ni se inventa el sentido inverso.
- Un viaje derivado confirmado usa distancia del recorrido, velocidad promedio, cantidad de paradas y tiempo de detención. Los valores están centralizados en `src/lib/transit-estimates.ts`. Su duración se muestra como **minutos estimados**, sin horas oficiales de salida/llegada. El seguimiento usa la misma estimación.

El bloqueo actual para ampliar viajes es la falta de relaciones confirmadas parada–ruta/sentido y horarios vigentes de los operadores. La aplicación no presenta un recorrido cercano como un servicio confirmado. Sin una conexión utilizable, muestra un mensaje claro en vez de una ruta irrelevante.

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

`scripts/verify-active-trip.cjs` verifica el flujo de escritorio/móvil y puede ejecutarse con `APP_URL=https://ruta-tica.vercel.app` y `PLAYWRIGHT_MODULE` apuntando a una instalación externa de Playwright. Usa el planificador real con una salida matutina para probar el calendario limitado; `LIVE_CURRENT_TIME=1` conserva la hora actual de la consulta. El movimiento GPS se simula. También comprueba que finalizar limpie el recorrido, las paradas, los resultados y el destino. `tests/derived-transit.test.ts` verifica filtrado de instalaciones, orden del tramo y rechazo de asociaciones sin confirmar.

La búsqueda pública de Nominatim se activa mediante **Buscar lugares**, no con cada pulsación; se cachea y limita a una solicitud por segundo por instancia. El proveedor puede cambiarse con `NOMINATIM_SEARCH_URL`. El uso público debe mantenerse moderado, con el límite agregado de una solicitud por segundo para la aplicación, según la [política de Nominatim](https://operations.osmfoundation.org/policies/nominatim/). Para escalar se necesita un proveedor o instancia propios. La atribución de OpenStreetMap permanece en el mapa.

GitHub `main` dispara el despliegue de Vercel. Después de cada publicación se verifica la aplicación live; una compilación local no sustituye esa comprobación.
