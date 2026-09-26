'use client';

import React, { useMemo } from 'react';

export function SmokeVignetteOverlay({
  smokeExposure,
  cameraMode,
  thermalLift = 0,
}: {
  smokeExposure: number;
  cameraMode: number;
  thermalLift?: number;
}) {
  const exposure = Math.max(0, Math.min(1, smokeExposure));

  // Generate deterministic ash / soot flakes for canopy immersion
  const sootFlakes = useMemo(() => {
    return Array.from({ length: 24 }).map((_, i) => ({
      id: i,
      left: `${(i * 19.7) % 96 + 2}%`,
      top: `${(i * 27.3) % 92 + 4}%`,
      size: `${2 + (i % 4) * 2}px`,
      delay: `${(i * 0.17) % 1.8}s`,
      duration: `${1.4 + (i % 3) * 0.5}s`,
      opacity: 0.35 + (i % 5) * 0.12,
    }));
  }, []);

  if (exposure <= 0.015) return null;

  // In Cockpit Cam (mode 1), smoke covers windshield more directly
  const cockpitBoost = cameraMode === 1 ? 1.35 : 1.0;
  const effectiveAlpha = Math.min(0.92, exposure * 0.85 * cockpitBoost);
  const vignetteEdge = Math.max(25, 95 - exposure * 55);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 14,
        overflow: 'hidden',
        transition: 'opacity 0.25s ease-out',
      }}
    >
      {/* 1. Volumetric Radial Smoke Vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at center, rgba(42, 33, 26, ${effectiveAlpha * 0.18}) 0%, rgba(32, 25, 20, ${effectiveAlpha * 0.65}) ${vignetteEdge}%, rgba(18, 14, 12, ${effectiveAlpha * 0.95}) 100%)`,
          backdropFilter: exposure > 0.35 ? `blur(${(exposure - 0.35) * 4}px)` : 'none',
        }}
      />

      {/* 2. Heat / Fire Underglow when thermal updrafts are intense */}
      {thermalLift > 0.5 && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '35%',
            background: `linear-gradient(to top, rgba(234, 88, 12, ${Math.min(0.4, (thermalLift / 4.6) * 0.45)}), transparent)`,
            mixBlendMode: 'screen',
            transition: 'opacity 0.2s ease',
          }}
        />
      )}

      {/* 3. Swirling Acrid Ash Clouds */}
      <div
        style={{
          position: 'absolute',
          inset: '-20px',
          background:
            'radial-gradient(circle at 30% 40%, rgba(28, 22, 18, 0.4) 0%, transparent 55%), radial-gradient(circle at 75% 65%, rgba(35, 28, 22, 0.4) 0%, transparent 60%)',
          opacity: effectiveAlpha * 0.8,
          animation: 'smokeDrift 4s ease-in-out infinite alternate',
        }}
      />

      {/* 4. Drifting Soot and Ember Flakes */}
      {exposure > 0.12 && (
        <div style={{ position: 'absolute', inset: 0 }}>
          {sootFlakes.slice(0, Math.floor(exposure * 24)).map((flake) => (
            <div
              key={flake.id}
              style={{
                position: 'absolute',
                left: flake.left,
                top: flake.top,
                width: flake.size,
                height: flake.size,
                borderRadius: '50%',
                background:
                  flake.id % 4 === 0
                    ? 'rgba(251, 146, 60, 0.85)'
                    : 'rgba(24, 20, 18, 0.9)',
                boxShadow:
                  flake.id % 4 === 0
                    ? '0 0 6px rgba(249, 115, 22, 0.9)'
                    : 'none',
                opacity: flake.opacity * effectiveAlpha,
                animation: `ashDrift ${flake.duration} linear infinite`,
                animationDelay: flake.delay,
              }}
            />
          ))}
        </div>
      )}

      {/* 5. Cockpit Canopy Frame Soot Tint */}
      {cameraMode === 1 && exposure > 0.2 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            border: `${12 + Math.floor(exposure * 20)}px solid rgba(15, 12, 10, ${effectiveAlpha * 0.7})`,
            filter: 'blur(8px)',
          }}
        />
      )}
    </div>
  );
}
