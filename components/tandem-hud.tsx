'use client';

import React from 'react';
import { getTandemState } from '@/lib/tandem';

export function TandemHud({ sim }: { sim: any }) {
  if (!sim?.isTandem) return null;

  const state = getTandemState(sim);

  return (
    <div className="pointer-events-none fixed top-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-30 min-w-[340px] max-w-[92vw]">
      <div className="bg-neutral-950/85 border border-sky-500/40 backdrop-blur-md px-4 py-2.5 rounded-xl shadow-2xl flex flex-col items-center w-full">
        {/* Header */}
        <div className="flex items-center justify-between w-full text-xs font-mono font-bold tracking-wider mb-1">
          <span className="text-emerald-400 flex items-center gap-1.5">
            YOU ({state.myCoverage.toFixed(1)}%)
          </span>
          <span className="text-sky-400 font-sans text-xs font-semibold">
            TANDEM CO-OP
          </span>
          <span className="text-sky-300 flex items-center gap-1.5">
            PARTNER ({state.partnerCoverage.toFixed(1)}%)
          </span>
        </div>

        {/* Combined Coverage Bar */}
        <div className="w-full h-3 bg-neutral-900 rounded-full overflow-hidden flex border border-neutral-700/60 p-0.5">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-300 shadow-[0_0_12px_#10b981]"
            style={{ width: `${Math.min(100, state.combinedCoverage)}%` }}
          />
        </div>

        {/* Telemetry and Formation Status */}
        <div className="flex items-center justify-between w-full mt-1.5 text-[11px] font-mono">
          <span className="text-neutral-300">
            Combined: <strong className="text-emerald-400">{state.combinedCoverage.toFixed(1)}%</strong> / {state.target}%
          </span>
          <span className="text-neutral-300">
            Separation: <strong className={state.inFormation ? 'text-sky-400' : 'text-neutral-400'}>{state.partnerDistance.toFixed(0)}m</strong>
          </span>
        </div>

        {/* Echelon Formation Slipstream Badge */}
        {state.inFormation ? (
          <div className="mt-2 py-0.5 px-2.5 rounded-full text-[11px] font-mono bg-sky-500/20 text-sky-300 border border-sky-500/50 flex items-center gap-1.5 shadow-[0_0_10px_#0ea5e9]">
            <span>✈️ ECHELON SLIPSTREAM ACTIVE</span>
            <span>(+${state.formationBonus})</span>
          </div>
        ) : (
          <div className="mt-1 text-[10px] text-neutral-400 font-mono">
            Fly 25m–50m alongside partner to draft slipstream
          </div>
        )}
      </div>
    </div>
  );
}
