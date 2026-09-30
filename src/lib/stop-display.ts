export const CTP_STOP_NOTICE = 'Parada oficial registrada por CTP. Ruta/horario todavía no disponible en RutaTica.';
export const CTP_ROUTING_NOTICE = 'Hay paradas oficiales registradas en esta zona, pero no hay un itinerario GTFS disponible para este trayecto. Puedes explorar recorridos ARESEP y paradas CTP en el mapa.';
export type PublicStop = {
  id: string; stopId: string; name: string; lat: number; lon: number;
  source: 'GTFS' | 'CTP'; hasRouteData: boolean; routeCount: number;
  province: string | null; canton: string | null; district: string | null;
  code: string | null; desc: string | null; zoneId: string | null;
  wheelchairBoarding: number | null; distanceKm?: number;
};
export function stopNotice(stop: Pick<PublicStop, 'source' | 'hasRouteData'>) {
  return stop.source === 'CTP' ? CTP_STOP_NOTICE : stop.hasRouteData ? 'Parada con rutas asociadas en GTFS.' : 'Parada GTFS sin rutas asociadas disponibles.';
}
