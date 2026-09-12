export type WeatherKind = 'clear' | 'haze' | 'overcast' | 'rain';
export type Weather = {
  id: number;
  kind: WeatherKind;
  label: string;
  temperature: number;
  windMps: number;
  /** Meteorological direction: where the wind comes from, in degrees. */
  windFrom: number;
  gust: number;
  cloud: number;
  fog: number;
  sunlight: number;
  rain: number;
  nextChangeAt?: number;
  front?: 'Building' | 'Peak winds' | 'Easing';
  severity?: 'Gentle' | 'Challenging' | 'Demanding';
};

// A shared front builds, peaks, then eases. Four-minute stages give pilots
// enough time to plan a pass, but make the forecast matter within a session.
export const WEATHER_PERIOD = 12 * 60 * 1000;
export const WEATHER_STAGE = WEATHER_PERIOD / 3;
const profiles = {
  clear: {
    label: 'Clear skies',
    temperature: 76,
    cloud: 0.08,
    fog: 0.00008,
    sunlight: 3.15,
    rain: 0,
  },
  haze: {
    label: 'Prairie haze',
    temperature: 82,
    cloud: 0.26,
    fog: 0.00036,
    sunlight: 2.1,
    rain: 0,
  },
  overcast: {
    label: 'Cloud cover',
    temperature: 67,
    cloud: 0.86,
    fog: 0.00024,
    sunlight: 0.95,
    rain: 0,
  },
  rain: {
    label: 'Light showers',
    temperature: 63,
    cloud: 0.98,
    fog: 0.00042,
    sunlight: 0.65,
    rain: 0.8,
  },
} as const;

function random(seed: number) {
  let n = seed >>> 0;
  return () => {
    n = (Math.imul(n ^ (n >>> 16), 0x45d9f3b) + 0x9e3779b9) >>> 0;
    return n / 4294967296;
  };
}

export function weatherFromSeed(seed: number): Weather {
  const roll = random(seed);
  const pick = roll();
  const kind: WeatherKind =
    pick < 0.35
      ? 'clear'
      : pick < 0.55
        ? 'haze'
        : pick < 0.8
          ? 'overcast'
          : 'rain';
  return {
    ...profiles[kind],
    id: seed,
    kind,
    temperature: profiles[kind].temperature + Math.floor(roll() * 9) - 4,
    windMps: 0.8 + roll() * (kind === 'rain' ? 1.6 : 1.2),
    windFrom: [225, 270, 315, 90, 135][Math.floor(roll() * 5)],
    gust: kind === 'rain' ? 0.32 : 0.12 + roll() * 0.12,
  };
}

export const LESSON_WEATHER: Weather = {
  ...profiles.clear,
  id: -1,
  kind: 'clear',
  temperature: 72,
  windMps: 0.65,
  windFrom: 270,
  gust: 0.32 / 0.65,
};

export function countyWeather(now: number, phaseIndex = 0): Weather {
  const period = Math.floor(now / WEATHER_PERIOD);
  const stage = Math.floor(now / WEATHER_STAGE) % 3;
  const phase = Math.max(0, Math.min(2, Math.floor(phaseIndex)));
  const base = weatherFromSeed(period + 1701);
  const roll = random(period + 4703);
  const kind: WeatherKind =
    roll() < [0.1, 0.3, 0.55][phase]
      ? 'rain'
      : base.kind === 'rain'
        ? 'overcast'
        : base.kind;
  const wind = [1.4, 3.2, 5.2][phase] + roll() * [1, 1.7, 2][phase];
  return {
    ...base,
    ...profiles[kind],
    kind,
    id: period * 9 + phase * 3 + stage,
    temperature:
      base.temperature +
      profiles[kind].temperature -
      profiles[base.kind].temperature,
    label:
      kind === 'rain'
        ? (['Light showers', 'Rain showers', 'Passing squalls'] as const)[phase]
        : profiles[kind].label,
    windMps: wind * [0.65, 1, 0.78][stage],
    gust: [0.18, 0.35, 0.55][phase] * [0.7, 1, 0.8][stage],
    rain: kind === 'rain' ? [0.4, 0.7, 1][phase] : 0,
    front: (['Building', 'Peak winds', 'Easing'] as const)[stage],
    severity: (['Gentle', 'Challenging', 'Demanding'] as const)[phase],
    nextChangeAt: (Math.floor(now / WEATHER_STAGE) + 1) * WEATHER_STAGE,
  };
}

export function gustKnots(weather: Weather, strength = 1) {
  return Math.round(weather.windMps * (1 + weather.gust) * strength * 1.944);
}

export function buffeting(
  weather: Weather | null,
  elapsed: number,
  strength = 1,
  stability = 0,
) {
  if (!weather?.front) return { roll: 0, pitch: 0 };
  const power =
    (weather.windMps * weather.gust * strength) / (1 + stability * 0.6);
  return {
    roll: Math.sin(elapsed * 1.8) * power * 0.025,
    pitch: Math.sin(elapsed * 1.3) * power * 0.012,
  };
}

export function weatherAdvice(weather: Weather) {
  if (weather.windMps >= 4)
    return 'Gusts rock the aircraft: correct small banks, aim upwind, and leave room at field edges.';
  if (weather.kind === 'rain')
    return 'Showers reduce visibility. Follow the field map and release spray before turning.';
  if (weather.windMps >= 2)
    return 'Watch the landing footprint: gusts push both your aircraft and spray downwind.';
  return 'A gentler window for clean passes. Build savings before the stronger seasonal winds.';
}

export function practiceWeather(jobId: number, seed: number): Weather {
  if (jobId === 0) return { ...LESSON_WEATHER };
  const weather = weatherFromSeed(seed);
  // The crosswind lesson keeps its promised west wind while the sky varies.
  if (jobId === 1)
    return {
      ...weather,
      windFrom: 270,
      windMps: Math.min(1.1, weather.windMps),
    };
  return weather;
}

export function windVector(
  weather: Weather,
  elapsed: number,
  strength = 1,
  stability = 0,
) {
  const speed =
    (weather.windMps *
      (1 + Math.sin(elapsed * 0.8) * weather.gust) *
      strength) /
    (1 + stability * 0.6);
  const towards = ((weather.windFrom + 180) * Math.PI) / 180;
  return { x: Math.sin(towards) * speed, z: -Math.cos(towards) * speed };
}

export function windLabel(weather: Weather, strength = 1) {
  const direction = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][
    Math.round(weather.windFrom / 45) % 8
  ];
  return `${direction} ${Math.max(1, Math.round(weather.windMps * strength * 1.944))} kt`;
}
