import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPassengerStop } from '../src/lib/passenger-stops'
import { normalizeDerivedRoute, planDerivedJourney } from '../src/lib/derived-transit'
import { estimateBusMinutes } from '../src/lib/transit-estimates'
import type { CorridorStop } from '../src/lib/aresep-types'
import { searchResultRank, type LocationSuggestion } from '../src/lib/search-localities'

test('search prioritizes the named place over stop substrings and unrelated address matches', () => {
  const result = (name: string, resultType: 'PLACE' | 'STOP'): LocationSuggestion => ({id:name,name,displayName:name,type:resultType==='PLACE'?'lugar':'parada',resultType,lat:10,lon:-84,fullAddress:'San José'});
  const candidates=[result('Frente al Parque Central','STOP'),result('Parque Central de Escazú','PLACE'),result('Parque Central de San José','PLACE')];
  candidates.sort((a,b)=>searchResultRank(a,'parque central san jose')-searchResultRank(b,'parque central san jose'));
  assert.equal(candidates[0].name,'Parque Central de San José');
  assert.ok(searchResultRank(result('San Joaquín','PLACE'),'san joaquin')<searchResultRank(result('San Joaquín','STOP'),'san joaquin'));
  assert.ok(searchResultRank(result('Parque Central de San José','PLACE'),'parque central')<searchResultRank(result('Frente al Parque Central','STOP'),'parque central'));
  assert.ok(searchResultRank(result('Parque Central','STOP'),'parque central')<searchResultRank(result('Parque Central de San José','PLACE'),'parque central'));
});

test('facilities are excluded unless passenger use is explicit', () => {
  for (const name of ['Plantel de buses', 'Depósito', 'Garaje de autobuses', 'Taller de la empresa']) assert.equal(isPassengerStop(name), false)
  assert.equal(isPassengerStop('Parada frente al parque'), true)
  assert.equal(isPassengerStop('Plantel', 'Plataforma de abordaje'), true)
})

test('derived route inference never becomes a usable journey without confirmed membership and direction', () => {
  const route = { id: '42', source: 'ARESEP' as const, routeNumber: '42', operator: null, description: 'A a D', paths: [[{lat:10,lon:-84},{lat:10.04,lon:-84}]] }
  const stops = ['A','B','C','D','Plantel'].map((name,index) => ({ id: name, name, lat:10 + index * 0.01, lon:-84, source:'CTP', relationship:'Cercana al recorrido ARESEP',province:null,canton:null,district:null })) as CorridorStop[]
  const [candidate] = normalizeDerivedRoute(route, stops)
  assert.equal(candidate.provenance.schedules, null)
  assert.equal(candidate.stops.length, 4)
  assert.equal(planDerivedJourney(candidate,{lat:10.01,lon:-84},{lat:10.03,lon:-84}),null)
  const [verified] = normalizeDerivedRoute(route, stops, {stopIds:['A','B','C','D'],directionConfirmed:true})
  const journey=planDerivedJourney(verified,{lat:10.01,lon:-84},{lat:10.03,lon:-84})!
  assert.deepEqual(journey.stops.map(s=>s.name),['B','C','D'])
  assert.equal(journey.durationSource,'estimated')
  assert.ok(journey.totalTimeMinutes>0)
  assert.equal(journey.departTime,'')
  assert.ok(Math.abs(journey.shapePoints[0].lat - 10.01) < 1e-8)
  assert.ok(Math.abs(journey.shapePoints.at(-1)!.lat - 10.03) < 1e-8)
  assert.equal(planDerivedJourney(verified,{lat:10.03,lon:-84},{lat:10.01,lon:-84}),null)
  assert.equal(planDerivedJourney(verified,{lat:10.01,lon:-84},{lat:11,lon:-84}),null)
  assert.ok(estimateBusMinutes(10,10)>estimateBusMinutes(10,2))
})
