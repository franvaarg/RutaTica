import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasTransitConnection } from '../src/lib/transit-coverage';
const trip = (ids: string[]) => ids.map((stop_id, i) => ({ stop_id, stop_sequence: i + 1, arrival_time: `0${6 + i}:00:00`, departure_time: `0${6 + i}:00:00`, pickup_type: 0, drop_off_type: 0 }));
test('coverage distinguishes an ordered scheduled connection from missing route data', () => {
  assert.equal(hasTransitConnection([trip(['A','B','C'])], ['A'], ['C']), true);
  assert.equal(hasTransitConnection([trip(['A','B','C'])], ['C'], ['A']), false);
  assert.equal(hasTransitConnection([trip(['A','B','C'])], ['A'], ['Pital']), false);
  assert.equal(hasTransitConnection([], ['A'], ['C']), false);
});
test('one-transfer coverage needs usable ordered stops on both legs', () => {
  assert.equal(hasTransitConnection([trip(['A','X']), trip(['X','B'])], ['A'], ['B']), true);
  assert.equal(hasTransitConnection([trip(['X','A']), trip(['X','B'])], ['A'], ['B']), false);
  const blocked = trip(['X','B']); blocked[0].pickup_type = 1;
  assert.equal(hasTransitConnection([trip(['A','X']), blocked], ['A'], ['B']), false);
  assert.equal(hasTransitConnection([trip(['A','X']), trip(['X','Y']), trip(['Y','B'])], ['A'], ['B']), false);
});
