import { contracts, type Contract } from './simulation';
import type { Weather } from './weather';

// A repeatable local practice condition, within the late-season wind range.
export const LOCAL_STORM: Weather = {
  id: -2,
  kind: 'rain',
  label: 'Heavy showers',
  temperature: 61,
  windMps: 7,
  windFrom: 225,
  gust: 0.55,
  cloud: 1,
  fog: 0.00065,
  sunlight: 0.5,
  rain: 1,
  front: 'Peak winds',
  severity: 'Demanding',
};

export function isLocalStorm(location: { hostname: string; search: string }) {
  return (
    ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) &&
    new URLSearchParams(location.search).get('weather') === 'storm'
  );
}

export function stormContract(job: Contract = contracts[1]): Contract {
  return {
    ...job,
    name: 'The squall run',
    windStrength: 1,
    difficulty: 'Storm practice',
    briefing:
      'Heavy showers. Southwest wind 14 kt, gusting 21 kt. Correct small banks, aim upwind, and stop spraying before the field edge. This storm stays in place for repeatable practice.',
  };
}
