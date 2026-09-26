'use client';

import { Flame, Droplets, Navigation, AlertTriangle } from 'lucide-react';
import type { FirefightingState, FireHotspot } from '@/lib/firefighting';
import type { Simulation } from '@/lib/simulation';
import { Progress } from '@/components/ui/progress';

export function FirefightingHud({
  state,
  spraying: _spraying,
  altitude: _altitude,
  sim,
}: {
  state?: FirefightingState;
  spraying?: boolean;
  altitude?: number;
  sim?: Simulation;
}) {
  const current = sim?.firefightingState ?? state;
  if (!current) return null;

  const percent = Math.round(current.containedFraction * 100);
  const activeHotspots = current.hotspots.filter((h: FireHotspot) => h.intensity > 0.05);
  const tankPercent = Math.round((current.waterTank / current.waterCapacity) * 100);

  // Compute navigation guidance to the nearest burning hotspot
  let navGuide: {
    dist: number;
    text: string;
    arrow: string;
    isOverhead: boolean;
  } | null = null;

  if (sim && activeHotspots.length > 0) {
    let closestDist = Infinity;
    let closestSpot = activeHotspots[0];

    for (const spot of activeHotspots) {
      const d = Math.hypot(spot.x - sim.x, spot.z - sim.z);
      if (d < closestDist) {
        closestDist = d;
        closestSpot = spot;
      }
    }

    const distM = Math.round(closestDist);
    const isOverhead = distM <= (closestSpot.radius + 20);

    // Target bearing angle relative to plane heading
    // dx = target.x - sim.x, dz = target.z - sim.z
    // In our sim, heading 0 points North (-Z), sin(heading) is +X, -cos(heading) is +Z
    const dx = closestSpot.x - sim.x;
    const dz = closestSpot.z - sim.z;
    const targetAngle = Math.atan2(dx, -dz);
    let headingDiff = targetAngle - (sim.heading ?? 0);
    while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
    while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
    const degDiff = Math.round((headingDiff * 180) / Math.PI);

    let arrow = '▲';
    let text = 'ON HEADING';
    if (Math.abs(degDiff) > 12) {
      if (degDiff < 0) {
        arrow = '◄';
        text = `TURN LEFT ${Math.abs(degDiff)}°`;
      } else {
        arrow = '►';
        text = `TURN RIGHT ${degDiff}°`;
      }
    }

    navGuide = {
      dist: distM,
      text,
      arrow,
      isOverhead,
    };
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(18, 14, 12, 0.90)',
        border: '1px solid rgba(249, 115, 22, 0.45)',
        borderRadius: '12px',
        padding: '10px 20px',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 20,
        minWidth: '340px',
        maxWidth: '92vw',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
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
          Hotspots: {activeHotspots.length} / {current.hotspots.length}
        </span>
      </div>

      {/* Realtime Navigational Bearing & Waypoint Indicator */}
      {navGuide && percent < 95 && (
        <div
          style={{
            background: navGuide.isOverhead
              ? 'rgba(220, 38, 38, 0.35)'
              : 'rgba(249, 115, 22, 0.18)',
            border: navGuide.isOverhead
              ? '1px solid #ef4444'
              : '1px solid rgba(249, 115, 22, 0.5)',
            borderRadius: '6px',
            padding: '4px 10px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            color: navGuide.isOverhead ? '#fca5a5' : '#fed7aa',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Navigation
              size={13}
              style={{
                transform:
                  navGuide.arrow === '◄'
                    ? 'rotate(-90deg)'
                    : navGuide.arrow === '►'
                      ? 'rotate(90deg)'
                      : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
              }}
            />
            {navGuide.isOverhead
              ? '🎯 DROP RETARDANT NOW [SPACE]'
              : `FIRE LINE: ${navGuide.dist}m · ${navGuide.text}`}
          </span>
          <span style={{ fontSize: '13px' }}>{navGuide.arrow}</span>
        </div>
      )}

      {current.isScooping && (
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
          }}
        >
          💧 SCOOPING RIVER WATER · TANK REFILLING
        </div>
      )}

      {tankPercent === 0 && !current.isScooping && (
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
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
          }}
        >
          <AlertTriangle size={13} /> RETARDANT EMPTY · Skim Cedar River &lt; 4.5m AGL to scoop
        </div>
      )}

      {current.smokeExposure > 0.45 ? (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.3)',
            border: '1px solid #ef4444',
            borderRadius: '6px',
            padding: '3px 8px',
            fontSize: '11px',
            color: '#fecaca',
            textAlign: 'center',
            fontWeight: 700,
            letterSpacing: '0.04em',
          }}
        >
          ⚠️ ZERO VISIBILITY · DENSE SMOKE HAZARD
        </div>
      ) : current.smokeExposure > 0.15 ? (
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.22)',
            border: '1px solid #f59e0b',
            borderRadius: '6px',
            padding: '3px 8px',
            fontSize: '11px',
            color: '#fde68a',
            textAlign: 'center',
            fontWeight: 600,
          }}
        >
          🌫️ SMOKE PLUME · VISIBILITY COMPROMISED ({Math.round(current.smokeExposure * 100)}%)
        </div>
      ) : null}

      {current.thermalLift > 1.0 && (
        <div
          style={{
            background: 'rgba(249, 115, 22, 0.25)',
            border: '1px solid #ea580c',
            borderRadius: '6px',
            padding: '3px 8px',
            fontSize: '11px',
            color: '#fdba74',
            textAlign: 'center',
            fontWeight: 600,
          }}
        >
          🔥 CONVECTIVE UPDRAFT +{current.thermalLift.toFixed(1)} m/s · HOLD CONTROLS
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
