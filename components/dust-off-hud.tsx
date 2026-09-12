'use client';

import React from 'react';
import { getDustOffState } from '@/lib/dust-off';

export function DustOffHud({ sim }: { sim: any }) {
  if (!sim?.isDustOff) return null;

  const state = getDustOffState(sim);
  const leadSign = state.leadAcres >= 0 ? '+' : '';
  const leadColor = state.leadAcres >= 0 ? 'text-emerald-400' : 'text-rose-400';

  return (
    <div className="pointer-events-none fixed top-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-30 min-w-[340px] max-w-[92vw]">
      {/* 1v1 Turf Race Header Banner */}
      <div className="bg-neutral-950/85 border border-amber-500/40 backdrop-blur-md px-4 py-2 rounded-xl shadow-2xl flex flex-col items-center w-full">
        <div className="flex items-center justify-between w-full text-xs font-mono font-bold tracking-wider mb-1">
          <span className="text-emerald-400 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-[0_0_8px_#10b981]" />
            YOU ({state.myCoverage.toFixed(1)}%)
          </span>
          <span className="text-amber-400 font-sans text-xs tracking-normal font-semibold">
            DUST-OFF 1v1
          </span>
          <span className="text-amber-400 flex items-center gap-1.5">
            RIVAL ({state.rivalCoverage.toFixed(1)}%)
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-[0_0_8px_#f59e0b]" />
          </span>
        </div>

        {/* Dual-color Progress Bars */}
        <div className="w-full h-3 bg-neutral-900 rounded-full overflow-hidden flex border border-neutral-700/60 p-0.5 gap-1">
          <div
            className="h-full bg-emerald-500 rounded-l-full transition-all duration-300 shadow-[0_0_12px_#10b981]"
            style={{ width: `${Math.min(100, state.myCoverage)}%` }}
          />
          <div className="flex-1" />
          <div
            className="h-full bg-amber-500 rounded-r-full transition-all duration-300 shadow-[0_0_12px_#f59e0b]"
            style={{ width: `${Math.min(100, state.rivalCoverage)}%` }}
          />
        </div>

        {/* Lead / Lag & Threshold Notice */}
        <div className="flex items-center justify-between w-full mt-1 text-[11px] font-mono">
          <span className={`${leadColor} font-bold`}>
            {leadSign}{state.leadAcres.toFixed(1)} Acres {state.leadAcres >= 0 ? 'Ahead' : 'Behind'}
          </span>
          <span className="text-neutral-400">
            Target: 50% Win · Swaths Locked
          </span>
        </div>

        {/* Victory Announcement Banner */}
        {state.winner && (
          <div className={`mt-2 py-1 px-3 rounded-lg text-xs font-bold tracking-wide flex items-center gap-1.5 ${
            state.winner === 'player'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
              : 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
          }`}>
            {state.winner === 'player' ? '🏆 DUST-OFF VICTORY! Press Enter to claim purse' : '🥈 RIVAL TOOK THE FIELD! R to retry'}
          </div>
        )}
      </div>
    </div>
  );
}
