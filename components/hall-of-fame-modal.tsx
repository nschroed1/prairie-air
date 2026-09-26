'use client';

import React, { useState } from 'react';
import {
  Trophy,
  Medal,
  Crown,
  Award,
  Filter,
  CheckCircle2,
  Lock,
  Sparkles,
  X,
} from 'lucide-react';
import {
  achievementManager,
  type BadgeCategory,
} from '@/lib/achievements';
import type { Career } from '@/lib/simulation';
import { getBadgeIcon } from './achievement-toast';

interface HallOfFameModalProps {
  career?: Career;
  onClose?: () => void;
  onClaimCash?: (amount: number) => void;
}

const CATEGORY_LABELS: Record<BadgeCategory | 'all', string> = {
  all: 'All Badges',
  precision: 'Ag Precision',
  barnstorming: 'Barnstorming',
  emergency: 'Emergency Ops',
  rally: 'Rally & Formation',
  skywriting: 'Skywriting',
  career: 'Career Mastery',
};

export function HallOfFameModal({ career, onClose, onClaimCash }: HallOfFameModalProps) {
  const [activeTab, setActiveTab] = useState<'hof' | 'badges'>('hof');
  const [selectedCategory, setSelectedCategory] = useState<BadgeCategory | 'all'>('all');
  const [, setRefreshTick] = useState(0);

  const allDefs = achievementManager.getAllDefs();
  const allStates = achievementManager.getAllStates();
  const stateMap = new Map(allStates.map((s) => [s.id, s]));

  const records = achievementManager.getAllRecords();
  const unlockedCount = achievementManager.unlockedCount;
  const totalBadges = allDefs.length;
  const recordsHeldCount = achievementManager.recordsHeldCount;
  const totalCashClaimed = achievementManager.totalCashClaimed;
  const unclaimedCash = achievementManager.unclaimedCash;

  const filteredBadges = allDefs.filter((def) => {
    if (selectedCategory === 'all') return true;
    return def.category === selectedCategory;
  });

  return (
    <div className="hall-of-fame-modal">
      <div className="hof-header">
        <div className="hof-title-row">
          <div className="hof-title">
            <Trophy size={24} />
            <span>Prairie Aviation Hall of Fame</span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close Hall of Fame"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={20} />
            </button>
          )}
        </div>

        <div className="hof-tabs" role="tablist">
          <button
            className={`hof-tab-btn ${activeTab === 'hof' ? 'active' : ''}`}
            role="tab"
            aria-selected={activeTab === 'hof'}
            onClick={() => setActiveTab('hof')}
          >
            <Crown size={16} />
            <span>🏆 All-Time Records ({recordsHeldCount}/{records.length} Held)</span>
          </button>
          <button
            className={`hof-tab-btn ${activeTab === 'badges' ? 'active' : ''}`}
            role="tab"
            aria-selected={activeTab === 'badges'}
            onClick={() => setActiveTab('badges')}
          >
            <Medal size={16} />
            <span>🎖️ Pilot Badges ({unlockedCount}/{totalBadges})</span>
          </button>
        </div>

        <div className="hof-stats-summary">
          <div className="hof-stat-item">
            <span className="hof-stat-label">Badges Earned</span>
            <span className="hof-stat-value">
              {unlockedCount} / {totalBadges} ({Math.round((unlockedCount / totalBadges) * 100)}%)
            </span>
          </div>
          <div className="hof-stat-item">
            <span className="hof-stat-label">Hall of Fame Crowns</span>
            <span className="hof-stat-value">
              {recordsHeldCount} / {records.length} #1 Plaque{recordsHeldCount === 1 ? '' : 's'}
            </span>
          </div>
          <div className="hof-stat-item">
            <span className="hof-stat-label">Wallet Rewards</span>
            {unclaimedCash > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="hof-stat-value" style={{ color: '#86efac' }}>
                  +${unclaimedCash.toLocaleString()}
                </span>
                <button
                  className="claim-all-btn"
                  onClick={() => {
                    const amount = achievementManager.claimAllRewards(career);
                    onClaimCash?.(amount);
                    setRefreshTick((v) => v + 1);
                  }}
                >
                  Claim All
                </button>
              </div>
            ) : (
              <span className="hof-stat-value">+${totalCashClaimed.toLocaleString()}</span>
            )}
          </div>
        </div>
      </div>

      <div className="hof-scroll-body">
        {activeTab === 'hof' ? (
          <div className="hof-records-grid">
            {records.map((rec) => {
              const hasPlayerRecord = rec.playerValue !== undefined;
              const holdsCrown =
                hasPlayerRecord &&
                (rec.higherIsBetter
                  ? (rec.playerValue ?? 0) > rec.legendValue
                  : (rec.playerValue ?? 999999) < rec.legendValue);

              return (
                <div
                  key={rec.id}
                  className={`hof-record-card ${holdsCrown ? 'crown-held' : ''}`}
                >
                  <div className="hof-record-header">
                    <div className="hof-record-title-group">
                      <div className="hof-record-icon">{getBadgeIcon(rec.icon, 18)}</div>
                      <div>
                        <h4 className="hof-record-name">{rec.title}</h4>
                        <span className="badge-subtitle">{rec.metric}</span>
                      </div>
                    </div>
                    {holdsCrown && (
                      <span className="hof-crown-badge">
                        <Crown size={12} /> #1 CROWN HELD
                      </span>
                    )}
                  </div>

                  <p className="hof-record-desc">{rec.description}</p>

                  <div className="hof-plaque-body">
                    {/* Pioneer Legend Record */}
                    <div className="hof-plaque-row">
                      <span className="hof-plaque-label">
                        <Award size={14} /> Historic Legend
                      </span>
                      <span className="hof-plaque-value">
                        {rec.legendValue} {rec.unit}
                      </span>
                    </div>
                    <div className="hof-legend-details">
                      <span>{rec.legendHolder}</span>
                      <span>{rec.legendDate}</span>
                    </div>

                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)' }} />

                    {/* Player's Personal Record */}
                    <div className="hof-plaque-row">
                      <span className="hof-plaque-label" style={{ color: holdsCrown ? '#fde047' : '#94a3b8' }}>
                        <Trophy size={14} /> Your Personal Best
                      </span>
                      <span
                        className="hof-plaque-value"
                        style={{ color: holdsCrown ? '#fde047' : hasPlayerRecord ? '#bef264' : '#64748b' }}
                      >
                        {hasPlayerRecord ? `${rec.playerValue} ${rec.unit}` : 'No mark yet'}
                      </span>
                    </div>
                    {hasPlayerRecord && (
                      <div className="hof-legend-details">
                        <span>{rec.playerAircraft ?? 'Crop Duster'}</span>
                        <span>{rec.playerDate ?? 'Recent Sortie'}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <>
            {/* Category Filter Chips */}
            <div className="badge-category-chips">
              {(Object.keys(CATEGORY_LABELS) as (BadgeCategory | 'all')[]).map((cat) => (
                <button
                  key={cat}
                  className={`chip-btn ${selectedCategory === cat ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat === 'all' ? <Filter size={12} /> : null}
                  <span>{CATEGORY_LABELS[cat]}</span>
                </button>
              ))}
            </div>

            {/* Badges Grid */}
            <div className="badges-grid">
              {filteredBadges.map((def) => {
                const state = stateMap.get(def.id) ?? {
                  id: def.id,
                  progress: 0,
                  unlocked: false,
                };
                const isUnlocked = state.unlocked;
                const progressPct = Math.min(
                  100,
                  Math.round((state.progress / def.maxProgress) * 100)
                );

                return (
                  <div
                    key={def.id}
                    className={`badge-card tier-${def.tier} ${isUnlocked ? 'unlocked' : 'locked'}`}
                  >
                    <div className="badge-icon-box">
                      {isUnlocked ? getBadgeIcon(def.icon, 22) : <Lock size={20} />}
                    </div>

                    <div className="badge-content">
                      <div className="badge-title-row">
                        <strong className="badge-title">{def.title}</strong>
                        <span className="badge-tier-pill">{def.tier}</span>
                      </div>

                      <span className="badge-subtitle">{def.subtitle}</span>
                      <p className="badge-description">{def.description}</p>

                      {def.maxProgress > 1 && (
                        <div className="badge-progress-box">
                          <div className="badge-progress-meta">
                            <span>Progress</span>
                            <span>
                              {state.progress} / {def.maxProgress}
                            </span>
                          </div>
                          <div className="badge-progress-bar">
                            <div
                              className="badge-progress-fill"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="badge-reward-tag">
                        {isUnlocked ? (
                          state.claimedCash ? (
                            <>
                              <CheckCircle2 size={13} />
                              <span>Claimed +${def.rewardCash}</span>
                            </>
                          ) : (
                            <button
                              className="claim-reward-btn"
                              onClick={() => {
                                const amount = achievementManager.claimReward(def.id, career);
                                onClaimCash?.(amount);
                                setRefreshTick((v) => v + 1);
                              }}
                            >
                              <Sparkles size={13} />
                              <span>Claim +${def.rewardCash}</span>
                            </button>
                          )
                        ) : (
                          <>
                            <Sparkles size={13} />
                            <span>Reward: +${def.rewardCash}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
