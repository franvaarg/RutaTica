export interface LocationSuggestion {
 id: string | number; name: string; displayName: string; type: 'barrio' | 'localidad' | 'ciudad' | 'lugar' | 'parada'; lat: number; lon: number; fullAddress: string; resultType?: 'PLACE' | 'STOP'; stopId?: string; stopName?: string; locationData?: { barrio?: string; localidad?: string; canton?: string; provincia?: string; postcode?: string };
}
/** Rank passenger-facing names before matches found only in their address. */
export function searchResultRank(result: LocationSuggestion, query: string): number {
 const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
 const words = (text: string) => fold(text).match(/[\p{L}\p{N}]+/gu)?.filter(word => !['de','del','el','la','los','las'].includes(word)) || [];
 const name = words(result.name), terms = words(query);
 const exact = fold(result.name) === fold(query) || (terms.length > 0 && name.join(' ') === terms.join(' '));
 if (exact) return result.resultType === 'STOP' ? 1 : 0;
 if (result.resultType !== 'STOP' && terms.length > 0 && terms.every(term => name.some(word => word.startsWith(term)))) return 2;
 return result.resultType === 'STOP' ? 3 : 4;
}
export const COSTA_RICA_LOCATIONS: LocationSuggestion[] = [
  { id: '1', name: 'San José', displayName: 'San José - San José', type: 'ciudad', lat: 9.9281, lon: -84.0907, fullAddress: 'San José, San José, Costa Rica', locationData: { provincia: 'San José', canton: 'San José', localidad: 'San José', barrio: '' } },
  { id: '2', name: 'Alajuela', displayName: 'Alajuela - Alajuela', type: 'ciudad', lat: 10.0163, lon: -84.2169, fullAddress: 'Alajuela, Alajuela, Costa Rica', locationData: { provincia: 'Alajuela', canton: 'Alajuela', localidad: 'Alajuela', barrio: '' } },
  { id: '3', name: 'Cartago', displayName: 'Cartago - Cartago', type: 'ciudad', lat: 9.8652, lon: -83.9145, fullAddress: 'Cartago, Cartago, Costa Rica', locationData: { provincia: 'Cartago', canton: 'Cartago', localidad: 'Cartago', barrio: '' } },
  { id: '4', name: 'Heredia', displayName: 'Heredia - Heredia', type: 'ciudad', lat: 10.0020, lon: -84.1170, fullAddress: 'Heredia, Heredia, Costa Rica', locationData: { provincia: 'Heredia', canton: 'Heredia', localidad: 'Heredia', barrio: '' } },
  { id: '5', name: 'Puntarenas', displayName: 'Puntarenas - Puntarenas', type: 'ciudad', lat: 9.9779, lon: -84.8331, fullAddress: 'Puntarenas, Puntarenas, Costa Rica', locationData: { provincia: 'Puntarenas', canton: 'Puntarenas', localidad: 'Puntarenas', barrio: '' } },
  { id: '6', name: 'Limón', displayName: 'Limón - Limón', type: 'ciudad', lat: 10.0015, lon: -83.0583, fullAddress: 'Limón, Limón, Costa Rica', locationData: { provincia: 'Limón', canton: 'Limón', localidad: 'Limón', barrio: '' } },
  { id: '7', name: 'Liberia', displayName: 'Liberia - Guanacaste', type: 'ciudad', lat: 10.6324, lon: -85.4363, fullAddress: 'Liberia, Guanacaste, Costa Rica', locationData: { provincia: 'Guanacaste', canton: 'Liberia', localidad: 'Liberia', barrio: '' } },
  { id: '8', name: 'San Pedro', displayName: 'San Pedro - Montes de Oca', type: 'localidad', lat: 9.9349, lon: -84.0520, fullAddress: 'San Pedro, Montes de Oca, San José, Costa Rica', locationData: { provincia: 'San José', canton: 'Montes de Oca', localidad: 'San Pedro', barrio: '' } },
  { id: '9', name: 'Desamparados', displayName: 'Desamparados - Desamparados', type: 'ciudad', lat: 9.9023, lon: -84.0737, fullAddress: 'Desamparados, Desamparados, San José, Costa Rica', locationData: { provincia: 'San José', canton: 'Desamparados', localidad: 'Desamparados', barrio: '' } },
  { id: '10', name: 'San Isidro', displayName: 'San Isidro - Pérez Zeledón', type: 'localidad', lat: 9.3768, lon: -83.6979, fullAddress: 'San Isidro, Pérez Zeledón, San José, Costa Rica', locationData: { provincia: 'San José', canton: 'Pérez Zeledón', localidad: 'San Isidro', barrio: '' } },
  { id: '11', name: 'Ciudad Quesada', displayName: 'Ciudad Quesada - Alajuela', type: 'ciudad', lat: 10.3275, lon: -84.4372, fullAddress: 'Ciudad Quesada, San Carlos, Alajuela, Costa Rica', locationData: { provincia: 'Alajuela', canton: 'San Carlos', localidad: 'Ciudad Quesada', barrio: '' } },
  { id: '12', name: 'Guápiles', displayName: 'Guápiles - Limón', type: 'ciudad', lat: 10.2149, lon: -83.7777, fullAddress: 'Guápiles, Pococí, Limón, Costa Rica', locationData: { provincia: 'Limón', canton: 'Pococí', localidad: 'Guápiles', barrio: '' } },
  { id: '13', name: 'San Ramón', displayName: 'San Ramón - Alajuela', type: 'ciudad', lat: 10.0870, lon: -84.4798, fullAddress: 'San Ramón, San Ramón, Alajuela, Costa Rica', locationData: { provincia: 'Alajuela', canton: 'San Ramón', localidad: 'San Ramón', barrio: '' } },
  { id: '14', name: 'Grecia', displayName: 'Grecia - Alajuela', type: 'ciudad', lat: 9.9554, lon: -84.3179, fullAddress: 'Grecia, Grecia, Alajuela, Costa Rica', locationData: { provincia: 'Alajuela', canton: 'Grecia', localidad: 'Grecia', barrio: '' } },
  { id: '15', name: 'Orotina', displayName: 'Orotina - Alajuela', type: 'ciudad', lat: 9.9090, lon: -84.5242, fullAddress: 'Orotina, Orotina, Alajuela, Costa Rica', locationData: { provincia: 'Alajuela', canton: 'Orotina', localidad: 'Orotina', barrio: '' } },
  { id: '16', name: 'Atenas', displayName: 'Atenas - Alajuela', type: 'ciudad', lat: 9.9815, lon: -84.3835, fullAddress: 'Atenas, Atenas, Alajuela, Costa Rica', locationData: { provincia: 'Alajuela', canton: 'Atenas', localidad: 'Atenas', barrio: '' } },
  { id: '17', name: 'Puriscal', displayName: 'Puriscal - San José', type: 'ciudad', lat: 9.8511, lon: -84.3294, fullAddress: 'Santiago, Puriscal, San José, Costa Rica', locationData: { provincia: 'San José', canton: 'Puriscal', localidad: 'Santiago', barrio: '' } },
  { id: '18', name: 'Escazú', displayName: 'Escazú - San José', type: 'ciudad', lat: 9.9280, lon: -84.1417, fullAddress: 'Escazú, Escazú, San José, Costa Rica', locationData: { provincia: 'San José', canton: 'Escazú', localidad: 'Escazú', barrio: '' } },
  { id: '19', name: 'Santa Ana', displayName: 'Santa Ana - San José', type: 'ciudad', lat: 9.9333, lon: -84.1817, fullAddress: 'Santa Ana, Santa Ana, San José, Costa Rica', locationData: { provincia: 'San José', canton: 'Santa Ana', localidad: 'Santa Ana', barrio: '' } },
  { id: 'sjf', name: 'San Joaquín', displayName: 'San Joaquín - Flores - Heredia', type: 'localidad', lat: 10.0031, lon: -84.1546, fullAddress: 'San Joaquín, Flores, Heredia, Costa Rica' },
  { id: '20', name: 'Alajuelita', displayName: 'Alajuelita - San José', type: 'ciudad', lat: 9.9017, lon: -84.1028, fullAddress: 'Alajuelita, Alajuelita, San José, Costa Rica', locationData: { provincia: 'San José', canton: 'Alajuelita', localidad: 'Alajuelita', barrio: '' } },
]
