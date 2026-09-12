'use client';

import React from 'react';
import { RALLY_GATES, RALLY_PAR_TIMES, type RallyState } from '@/lib/rally';

export function RallyHud({ sim }: { sim: any }) {
  if (!sim?.isRally || !sim.rallyState) return null;

  const state: RallyState = sim.rallyState;
  const currentGate = RALLY_GATES[Math.min(RALLY_GATES.length - 1, state.gateIndex)];
  const rawElapsed = state.completed ? state.finalTime : Math.max(0, sim.elapsed - state.startTime);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs * 100) % 100);
    return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div className="pointer-events-none fixed top-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-30 min-w-[360px] max-w-[92vw]">
      {/* Rally Main Header */}
      <div className="bg-neutral-950/85 border border-emerald-500/40 backdrop-blur-md px-5 py-3 rounded-xl shadow-2xl flex flex-col items-center w-full">
        <div className="flex items-center justify-between w-full text-xs font-mono font-bold tracking-wider mb-1">
          <span className="text-emerald-400 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping inline-block" />
            GATE {Math.min(10, state.gateIndex + 1)} / 10
          </span>
          <span className="text-amber-400 font-sans font-bold text-xs tracking-wide">
            BARNSTORMER RALLY
          </span>
          <span className="text-emerald-300 font-mono text-sm font-bold">
            ⏱ {formatTime(rawElapsed)}
          </span>
        </div>

        {/* Current Gate Info */}
        {!state.completed ? (
          <div className="flex flex-col items-center w-full text-center mt-1">
            <span className="text-white font-bold text-sm tracking-wide">
              {currentGate.name}
            </span>
            <span className="text-neutral-400 text-xs mt-0.5">
              {currentGate.subtitle}
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center w-full text-center mt-1">
            <span className="text-yellow-400 font-bold text-base tracking-wide">
              🏁 COURSE FINISHED! {state.medal?.toUpperCase()} MEDAL
            </span>
            <span className="text-emerald-300 font-mono text-xs mt-0.5">
              Final Adjusted Time: {formatTime(state.finalTime)}
            </span>
            <span className="text-neutral-300 text-xs mt-1">
              Press Enter to collect your cash and standings!
            </span>
          </div>
        )}

        {/* Par Time Indicators */}
        <div className="flex items-center justify-center gap-4 mt-2 text-[11px] font-mono text-neutral-400 border-t border-neutral-800/80 pt-2 w-full">
          <span className={rawElapsed <= RALLY_PAR_TIMES.gold ? 'text-yellow-400 font-bold' : 'text-neutral-500'}>
            🥇 Gold &lt; {RALLY_PAR_TIMES.gold}s
          </span>
          <span className={rawElapsed <= RALLY_PAR_TIMES.silver ? 'text-slate-300 font-bold' : 'text-neutral-500'}>
            🥈 Silver &lt; {RALLY_PAR_TIMES.silver}s
          </span>
          <span className={rawElapsed <= RALLY_PAR_TIMES.bronze ? 'text-amber-600 font-bold' : 'text-neutral-500'}>
            🥉 Bronze &lt; {RALLY_PAR_TIMES.bronze}s
          </span>
        </div>

        {/* Stunts Earned Badges */}
        {state.stuntsEarned.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
            {state.stuntsEarned.slice(-3).map((stunt, i) => (
              <span
                key={i}
                className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono px-2 py-0.5 rounded-full"
              >
                ⚡ {stunt.name} (-{stunt.seconds.toFixed(1)}s)
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
