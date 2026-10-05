import assert from 'node:assert/strict'
import { test } from 'node:test'
import { tripProgress } from '../src/lib/trip-progress'
import { mapPlannedRoutes } from '../src/lib/planned-route'

test('progress follows selected calls and handles GTFS times after midnight', () => {
  const [route] = mapPlannedRoutes([{ totalTimeMinutes: 30, stops: [
    { name: 'A', departureTime: '23:50:00' },
    { name: 'B', departureTime: '24:00:00' },
    { name: 'C', arrivalTime: '24:20:00' },
  ] }], 'gtfs-local')
  assert.equal(tripProgress(route, -1, 0).nextStop?.name, 'A')
  assert.deepEqual(tripProgress(route, 1, 8), { nextStop: route._stops![2], remainingStops: 1, remainingMinutes: 20 })
  assert.deepEqual(tripProgress(route, 2, 30), { nextStop: null, remainingStops: 0, remainingMinutes: 0 })
  assert.equal(tripProgress(null, -1, 0).remainingMinutes, null)
})
