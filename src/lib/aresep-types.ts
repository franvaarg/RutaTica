export type AresepRoute = {
  id: string; routeNumber: string; operator: string | null; description: string | null;
  source: 'ARESEP'; paths: Array<Array<{ lat: number; lon: number }>>;
};
export type CorridorStop = {
  id: string; name: string; lat: number; lon: number;
  province: string | null; canton: string | null; district: string | null;
  source: 'CTP'; relationship: 'Cercana al recorrido ARESEP';
};
