'use client';

import { Flame, Droplets } from 'lucide-react';
import type { FirefightingState } from '@/lib/firefighting';
import { Progress } from '@/components/ui/progress';

export function FirefightingHud({
  state,
  spraying: _spraying,
  altitude: _altitude,
}: {
  state: FirefightingState;
  spraying?: boolean;
  altitude?: number;
}) {
  const percent = Math.round(state.containedFraction * 100);
  const activeHotspots = state.hotspots.filter((h) => h.intensity > 0.05).length;
  const tankPercent = Math.round((state.waterTank / state.waterCapacity) * 100);

  return (
    <div
      style={{
        position: 'absolute',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(18, 14, 12, 0.88)',
        border: '1px solid rgba(249, 115, 22, 0.4)',
        borderRadius: '12px',
        padding: '10px 20px',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 20,
        minWidth: '320px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontWeight: 700,
          fontSize: '13px',
          letterSpacing: '0.05em',
          color: '#fb923c',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Flame size={16} /> TIMBER WILDFIRE CONTAINMENT
        </span>
        <span style={{ color: percent >= 95 ? '#4ade80' : '#fdba74' }}>
          {percent}%
        </span>
      </div>

      <Progress
        value={percent}
        style={{
          height: '8px',
          background: 'rgba(255, 255, 255, 0.1)',
        }}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: '#d4d4d8',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Droplets size={13} color="#38bdf8" /> Retardant Tank: {tankPercent}%
        </span>
        <span>
          Hotspots: {activeHotspots} / {state.hotspots.length}
        </span>
      </div>

      {state.isScooping && (
        <div
          style={{
            background: 'rgba(14, 165, 233, 0.25)',
            border: '1px solid #38bdf8',
            borderRadius: '6px',
            padding: '3px 8px',
            fontSize: '11px',
            color: '#38bdf8',
            textAlign: 'center',
            fontWeight: 600,
            animation: 'pulse 1s infinite',
          }}
        >
          💧 SCOOPING RIVER WATER · TANK REFILLING
        </div>
      )}

      {tankPercent === 0 && !state.isScooping && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.2)',
            border: '1px solid #ef4444',
            borderRadius: '6px',
            padding: '3px 8px',
            fontSize: '11px',
            color: '#fca5a5',
            textAlign: 'center',
            fontWeight: 600,
          }}
        >
          ⚠️ RETARDANT EMPTY · Skim Cedar River &lt; 4.5m AGL to scoop
        </div>
      )}

      {percent >= 95 && (
        <div
          style={{
            background: 'rgba(34, 197, 94, 0.25)',
            border: '1px solid #22c55e',
            borderRadius: '6px',
            padding: '3px 8px',
            fontSize: '11px',
            color: '#86efac',
            textAlign: 'center',
            fontWeight: 700,
          }}
        >
          ✅ FIRE CONTAINED! Press ENTER to complete contract
        </div>
      )}
    </div>
  );
}
