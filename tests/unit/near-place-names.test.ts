// Places listed under their Welsh or Gaelic name first: the name the buyer
// typed is matched and shown, as postcodes.io answers for Newport in Wales.
import { describe, expect, it } from 'vitest';
import { findPlace } from '../../src/lib/near';

const answer = (result: unknown) => (async () => new Response(JSON.stringify({ status: 200, result }), { status: 200 })) as unknown as typeof fetch;

describe('place names', () => {
  it('matches the second name and shows it', async () => {
    const result = [
      { name_1: 'Newport', local_type: 'Town', latitude: 52.7691, longitude: -2.3786 },
      { name_1: 'Casnewydd', name_2: 'Newport', local_type: 'City', latitude: 51.5877, longitude: -2.9984 },
    ];
    expect(await findPlace('Newport', answer(result))).toEqual({ kind: 'found', place: { name: 'Newport', lat: 51.5877, lon: -2.9984 } });
  });

  it('skips a candidate whose names do not fit the pattern', async () => {
    const result = [
      { name_1: '<b>Bristol</b>', local_type: 'City', latitude: 51.45, longitude: -2.58 },
      { name_1: 'Bristol', local_type: 'Town', latitude: 51.46, longitude: -2.59 },
    ];
    expect(await findPlace('Bristol', answer(result))).toEqual({ kind: 'found', place: { name: 'Bristol', lat: 51.46, lon: -2.59 } });
  });
});
