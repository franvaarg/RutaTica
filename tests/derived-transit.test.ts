import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPassengerStop } from '../src/lib/passenger-stops'
import { normalizeDerivedRoute, planDerivedJourney } from '../src/lib/derived-transit'
import { estimateBusMinutes } from '../src/lib/transit-estimates'
import type { CorridorStop } from '../src/lib/aresep-types'

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
