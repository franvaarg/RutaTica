# Propuesta de migración a PostgreSQL + PostGIS

No se ha migrado ni modificado `db/custom.db`. Esta es una propuesta para una etapa con infraestructura y respaldo aprobados.

## Estado actual

Prisma usa SQLite. Las búsquedas de paradas aplican primero un cuadro delimitador sobre `lat`/`lon` y después Haversine en Node.js. Es adecuado para el volumen actual, pero trae candidatos a la aplicación y no dispone de índice espacial real.

## Modelo futuro

1. Provisionar PostgreSQL y habilitar `CREATE EXTENSION postgis` fuera de la aplicación.
2. Restaurar una copia validada en un entorno de ensayo; nunca transformar la única copia de SQLite.
3. Cambiar el provider Prisma a `postgresql`, conservar `lat`/`lon` durante la transición y añadir una columna geográfica `location geography(Point,4326)` mediante migración revisada.
4. Poblar `location` con `ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography` y crear un índice GiST.
5. Comparar conteos, claves y rutas antes del cambio de tráfico.

Las consultas de cercanía usarían `ST_DWithin` para filtrar e índice, y `ST_Distance` para ordenar en metros. `ST_Transform` sólo sería necesario para cálculos en una proyección específica; `geography` ya resuelve distancias terrestres. Prisma no expone estas funciones geoespaciales como filtros tipados completos, por lo que conviene encapsular consultas parametrizadas con `$queryRaw` y mantener el resto del acceso con Prisma. No deben concatenarse coordenadas en SQL.

También se beneficiarían la búsqueda de paradas en un corredor, la unión de paradas con shapes y la detección de transferencias cercanas. El routing multimodal sigue correspondiendo a OTP; PostGIS mejora consulta y análisis, no reemplaza el motor de rutas.

## Condiciones de release — 2026-09-08

El snapshot SQLite actual se conserva sin modificaciones. Para Vercel se incluye explícitamente `db/custom.db` en el trazado de las API. `DATABASE_URL=file:../db/custom.db` se resuelve respecto de `prisma/schema.prisma`; la configuración no debe contener una ruta de una máquina de desarrollo. `prebuild` regenera Prisma para evitar clientes obsoletos en caché.

Este modelo sólo contempla lecturas del snapshot. Favoritos, historial y ajustes del servidor responden 503 hasta disponer de identidad autenticada y persistencia adecuada; no tenían consumidores en `src`. No se ha desplegado ni comprobado el filesystem de Vercel en esta revisión. No usar `/tmp` como almacenamiento durable ni ejecutar importaciones durante requests.

La migración sigue pendiente. El GTFS incluido contiene 88 paradas y 72 viajes, sin cobertura alrededor de Ciudad Quesada (consulta a 10 km: cero paradas). PostgreSQL por sí solo no corrige esa ausencia: es necesario importar y validar un feed de San Carlos/zona norte o disponer de OTP con dicha cobertura.
