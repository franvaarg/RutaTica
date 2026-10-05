export const CTP_STOP_NOTICE = 'Parada registrada. Confirma el servicio y el sentido antes de abordar.';
export const CTP_ROUTING_NOTICE = 'Hay paradas registradas en esta zona, pero todavía no tenemos una conexión de autobús confirmada para este viaje. Prueba con otra localidad cercana.';
export type PublicStop = {
  id: string; stopId: string; name: string; lat: number; lon: number;
  source: 'GTFS' | 'CTP'; hasRouteData: boolean; routeCount: number;
  province: string | null; canton: string | null; district: string | null;
  code: string | null; desc: string | null; zoneId: string | null;
  wheelchairBoarding: number | null; distanceKm?: number;
};
export function stopNotice(stop: Pick<PublicStop, 'source' | 'hasRouteData'>) {
  return stop.source === 'CTP' ? CTP_STOP_NOTICE : stop.hasRouteData ? 'Parada con servicio de autobús.' : 'Parada sin servicio confirmado disponible.';
}
