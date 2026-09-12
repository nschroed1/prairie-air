'use client';

import { Wind } from 'lucide-react';
import {
  gustKnots,
  weatherAdvice,
  windLabel,
  type Weather,
} from '@/lib/weather';

export function CountyForecast({
  weather,
  next,
  now,
  stability = 0,
  compact = false,
}: {
  weather: Weather;
  next?: Weather;
  now: number;
  stability?: number;
  compact?: boolean;
}) {
  const seconds = Math.max(
    0,
    Math.ceil(((weather.nextChangeAt ?? now) - now) / 1000),
  );
  const rising = next && gustKnots(next) > gustKnots(weather) + 1;
  return (
    <div
      className={`weather-front ${compact ? 'front-compact' : ''} ${rising && seconds <= 60 ? 'front-warning' : ''}`}
    >
      <div className="front-heading">
        <Wind size={14} />
        <strong>{weather.front ?? weather.label}</strong>
        <span>
          {compact ? `Gusts ${gustKnots(weather)} kt` : weather.severity}
        </span>
      </div>
      {!compact && (
        <p>
          {weather.label} · {windLabel(weather)} · gusts {gustKnots(weather)} kt
        </p>
      )}
      {next && (
        <div className="front-next">
          <b>
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
          </b>
          <span>
            {rising
              ? 'Wind building'
              : next.windMps < weather.windMps
                ? 'Wind easing'
                : 'Next front'}{' '}
            · {windLabel(next)} · gusts {gustKnots(next)} kt
          </span>
        </div>
      )}
      {!compact && (
        <>
          <p>{weatherAdvice(weather)}</p>
          <small>
            {stability > 0
              ? `Your stabilizer reduces wind movement and spray drift by ${Math.round((1 - 1 / (1 + stability * 0.6)) * 100)}%. `
              : ''}
            Spring is gentler. Summer brings stronger crosswinds; fall brings
            the hardest gusts and more showers. Later contract waves pay more.
          </small>
        </>
      )}
    </div>
  );
}
