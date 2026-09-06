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
};

export const WEATHER_PERIOD = 30 * 60 * 1000;
const profiles = {
  clear: {
    label: 'Clear skies',
    temperature: 76,
    cloud: 0.08,
    fog: 0.00014,
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

export function countyWeather(now: number): Weather {
  const period = Math.floor(now / WEATHER_PERIOD);
  return {
    ...weatherFromSeed(period + 1701),
    nextChangeAt: (period + 1) * WEATHER_PERIOD,
  };
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
