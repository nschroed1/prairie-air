'use client';

import {
  Flame,
  Droplets,
  Navigation,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import {
  CEDAR_DIP_POND,
  type FirefightingState,
  type FireHotspot,
} from '@/lib/firefighting';
import type { Simulation } from '@/lib/simulation';
import { riverX } from '@/lib/terrain-math';
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
  const activeHotspots = current.hotspots.filter(
    (h: FireHotspot) => h.intensity > 0.05,
  );
  const tankPercent = Math.round(
    (current.waterTank / current.waterCapacity) * 100,
  );
  const altFeet = sim ? Math.round(sim.altitude * 3.28084) : 60;
  const inDropEnvelope = sim ? sim.altitude < 36.0 && sim.altitude > 2.2 : true;

  // Compute smart navigation guidance:
  // - If tank is critically low (<= 20%), guide to nearest water scoop (Dip Basin or Cedar River)
  // - Otherwise guide to the nearest active burning hotspot
  let navGuide: {
    mode: 'fire' | 'scoop';
    label: string;
    dist: number;
    text: string;
    arrow: string;
    isOverhead: boolean;
  } | null = null;

  if (sim && percent < 95) {
    const needsScoop = tankPercent <= 20 && !current.isScooping;

    let targetX: number = CEDAR_DIP_POND.x;
    let targetZ: number = CEDAR_DIP_POND.z;
    let targetRadius: number = CEDAR_DIP_POND.radius;
    let targetLabel = 'CEDAR DIP BASIN';

    if (needsScoop) {
      const distPond = Math.hypot(
        CEDAR_DIP_POND.x - sim.x,
        CEDAR_DIP_POND.z - sim.z,
      );
      const rx = riverX(sim.z);
      const distRiver = Math.abs(rx - sim.x);
      if (distRiver < distPond) {
        targetX = rx;
        targetZ = sim.z;
        targetRadius = 56;
        targetLabel = 'CEDAR RIVER SCOOP';
      }
    } else if (activeHotspots.length > 0) {
      let closestDist = Infinity;
      let closestSpot = activeHotspots[0];

      for (const spot of activeHotspots) {
        const d = Math.hypot(spot.x - sim.x, spot.z - sim.z);
        if (d < closestDist) {
          closestDist = d;
          closestSpot = spot;
        }
      }
      targetX = closestSpot.x;
      targetZ = closestSpot.z;
      targetRadius = closestSpot.radius;
      targetLabel = (
        closestSpot.name ?? `HOTSPOT #${closestSpot.id + 1}`
      ).toUpperCase();
    }

    const distM = Math.round(Math.hypot(targetX - sim.x, targetZ - sim.z));
    const isOverhead = distM <= targetRadius + 24;

    const dx = targetX - sim.x;
    const dz = targetZ - sim.z;
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
      mode: needsScoop ? 'scoop' : 'fire',
      label: targetLabel,
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
        top: '98px',
        left: '50%',
        transform: 'translateX(-50%)',
        background:
          'linear-gradient(180deg, rgba(22, 15, 13, 0.94) 0%, rgba(14, 11, 10, 0.92) 100%)',
        border: '1px solid rgba(249, 115, 22, 0.52)',
        borderRadius: '14px',
        padding: '10px 18px',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: '7px',
        zIndex: 15,
        minWidth: '370px',
        maxWidth: '92vw',
        boxShadow:
          '0 10px 28px rgba(0, 0, 0, 0.6), 0 0 24px rgba(234, 88, 12, 0.14)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontWeight: 800,
          fontSize: '12.5px',
          letterSpacing: '0.06em',
          color: '#fb923c',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Flame size={15} color="#f97316" /> AIR TANKER · CEDAR VALLEY DISPATCH
        </span>
        <span
          style={{
            color: percent >= 95 ? '#4ade80' : '#fed7aa',
            fontVariantNumeric: 'tabular-nums',
            fontSize: '13.5px',
          }}
        >
          {percent}% CONTAINED
        </span>
      </div>

      <Progress
        value={percent}
        style={{
          height: '7px',
          background: 'rgba(255, 255, 255, 0.12)',
        }}
      />

      {/* 6 Hotspot Tactical Telemetry Pips */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${current.hotspots.length}, 1fr)`,
          gap: '5px',
          marginTop: '1px',
        }}
      >
        {current.hotspots.map((spot) => {
          const isOut = spot.intensity <= 0.06;
          const pct = Math.round(spot.intensity * 100);
          return (
            <div
              key={spot.id}
              title={spot.name ?? `Hotspot #${spot.id + 1}`}
              style={{
                background: isOut
                  ? 'rgba(16, 185, 129, 0.16)'
                  : 'rgba(255, 255, 255, 0.05)',
                border: isOut
                  ? '1px solid rgba(16, 185, 129, 0.5)'
                  : '1px solid rgba(251, 146, 60, 0.3)',
                borderRadius: '5px',
                padding: '3px 5px',
                display: 'flex',
                flexDirection: 'column',
                gap: '3px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  color: isOut ? '#6ee7b7' : '#fdba74',
                }}
              >
                <span>H{spot.id + 1}</span>
                {isOut ? (
                  <CheckCircle2 size={10} color="#34d399" />
                ) : (
                  <span>{pct}%</span>
                )}
              </div>
              <div
                style={{
                  height: '3px',
                  borderRadius: '2px',
                  background: 'rgba(255,255,255,0.12)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${isOut ? 100 : pct}%`,
                    height: '100%',
                    background: isOut
                      ? '#10b981'
                      : spot.intensity > 0.55
                        ? '#ef4444'
                        : '#f59e0b',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '11px',
          color: '#e4e4e7',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Droplets
            size={13}
            color={tankPercent <= 20 ? '#f87171' : '#fb7185'}
          />
          <span>
            Phos-Chek Slurry:{' '}
            <strong
              style={{
                color:
                  tankPercent <= 20
                    ? '#fca5a5'
                    : tankPercent <= 45
                      ? '#fde68a'
                      : '#fecdd3',
              }}
            >
              {tankPercent}%
            </strong>
          </span>
        </span>
        <span
          style={{
            color: inDropEnvelope ? '#86efac' : '#fde68a',
            fontWeight: 600,
          }}
        >
          {inDropEnvelope
            ? `DROP ALT OK (${altFeet} FT)`
            : `DESCEND < 115 FT (${altFeet} FT)`}
        </span>
      </div>

      {/* Realtime Navigational Bearing & Waypoint Indicator */}
      {navGuide && percent < 95 && (
        <div
          style={{
            background:
              navGuide.mode === 'scoop'
                ? 'rgba(14, 165, 233, 0.22)'
                : navGuide.isOverhead
                  ? 'rgba(225, 29, 72, 0.36)'
                  : 'rgba(249, 115, 22, 0.18)',
            border:
              navGuide.mode === 'scoop'
                ? '1px solid rgba(56, 189, 248, 0.65)'
                : navGuide.isOverhead
                  ? '1px solid #f43f5e'
                  : '1px solid rgba(249, 115, 22, 0.5)',
            borderRadius: '6px',
            padding: '4px 10px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            color:
              navGuide.mode === 'scoop'
                ? '#bae6fd'
                : navGuide.isOverhead
                  ? '#ffe4e6'
                  : '#fed7aa',
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
            {navGuide.mode === 'scoop'
              ? navGuide.isOverhead
                ? '💧 SKIM WATER < 26 FT AGL TO REFILL'
                : `SCOOP: ${navGuide.label} (${navGuide.dist}m) · ${navGuide.text}`
              : navGuide.isOverhead
                ? '🎯 OVER TARGET · HOLD [SPACE] TO DROP SLURRY'
                : `${navGuide.label}: ${navGuide.dist}m · ${navGuide.text}`}
          </span>
          <span style={{ fontSize: '13px' }}>{navGuide.arrow}</span>
        </div>
      )}

      {current.isScooping && (
        <div
          style={{
            background: 'rgba(14, 165, 233, 0.28)',
            border: '1px solid #38bdf8',
            borderRadius: '6px',
            padding: '4px 8px',
            fontSize: '11px',
            color: '#7dd3fc',
            textAlign: 'center',
            fontWeight: 700,
            letterSpacing: '0.03em',
          }}
        >
          💧 HYDRO-SCOOP ENGAGED · TANK REFILLING ({tankPercent}%)
        </div>
      )}

      {tankPercent === 0 && !current.isScooping && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.22)',
            border: '1px solid #ef4444',
            borderRadius: '6px',
            padding: '4px 8px',
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
          <AlertTriangle size={13} /> SLURRY DEPLETED · Skim Cedar Dip Basin
          (East of ridge) or press [R]
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
          ⚠️ ZERO VISIBILITY · DENSE SMOKE PLUME
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
          🌫️ SMOKE PLUME · VISIBILITY REDUCED (
          {Math.round(current.smokeExposure * 100)}%)
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
          🔥 THERMAL UPDRAFT +{current.thermalLift.toFixed(1)} m/s · PITCH DOWN
          OVER FLAMES
        </div>
      )}

      {percent >= 95 && (
        <div
          style={{
            background: 'rgba(34, 197, 94, 0.25)',
            border: '1px solid #22c55e',
            borderRadius: '6px',
            padding: '4px 8px',
            fontSize: '11px',
            color: '#86efac',
            textAlign: 'center',
            fontWeight: 700,
          }}
        >
          ✅ WILDFIRE CONTAINED! Press ENTER to claim dispatch payout
        </div>
      )}
    </div>
  );
}
