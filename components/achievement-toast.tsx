'use client';

import React, { useEffect, useState } from 'react';
import {
  Trophy,
  Sparkles,
  Flame,
  Zap,
  CheckCircle2,
  ShieldCheck,
  Droplets,
  Award,
  PenTool,
  Wind,
  Gauge,
  Camera,
  Video,
  Wrench,
  Crown,
  Medal,
  BookOpen,
  DollarSign,
  Clock,
  Plane,
  Crosshair,
  ArrowDown,
  Anchor,
  Building2,
  RotateCcw,
  CloudLightning,
  Moon,
  Flag,
  Users,
} from 'lucide-react';
import type { AchievementDef, HallOfFameRecord } from '@/lib/achievements';
import { achievementManager } from '@/lib/achievements';

export function getBadgeIcon(iconName: string, size = 20) {
  switch (iconName) {
    case 'Plane':
      return <Plane size={size} />;
    case 'Crosshair':
      return <Crosshair size={size} />;
    case 'CheckCircle2':
      return <CheckCircle2 size={size} />;
    case 'ArrowDown':
      return <ArrowDown size={size} />;
    case 'ShieldCheck':
      return <ShieldCheck size={size} />;
    case 'Zap':
      return <Zap size={size} />;
    case 'Anchor':
      return <Anchor size={size} />;
    case 'Building2':
      return <Building2 size={size} />;
    case 'RotateCcw':
      return <RotateCcw size={size} />;
    case 'Sparkles':
      return <Sparkles size={size} />;
    case 'Flame':
      return <Flame size={size} />;
    case 'Droplets':
      return <Droplets size={size} />;
    case 'CloudLightning':
      return <CloudLightning size={size} />;
    case 'Moon':
      return <Moon size={size} />;
    case 'Flag':
      return <Flag size={size} />;
    case 'Users':
      return <Users size={size} />;
    case 'Award':
      return <Award size={size} />;
    case 'PenTool':
      return <PenTool size={size} />;
    case 'Wind':
      return <Wind size={size} />;
    case 'Gauge':
      return <Gauge size={size} />;
    case 'Video':
      return <Video size={size} />;
    case 'Camera':
      return <Camera size={size} />;
    case 'Wrench':
      return <Wrench size={size} />;
    case 'Crown':
      return <Crown size={size} />;
    case 'Medal':
      return <Medal size={size} />;
    case 'BookOpen':
      return <BookOpen size={size} />;
    case 'DollarSign':
      return <DollarSign size={size} />;
    case 'Clock':
      return <Clock size={size} />;
    case 'Trophy':
    default:
      return <Trophy size={size} />;
  }
}

interface ToastItem {
  id: string;
  type: 'achievement' | 'hof';
  title: string;
  subtitle: string;
  icon: string;
  reward?: string;
}

export function AchievementToastContainer({
  onSoundCue,
}: {
  onSoundCue?: (cue: 'bonus' | 'cash-register' | 'barnstormer') => void;
}) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const unsubUnlock = achievementManager.onUnlock((def: AchievementDef, bonus: number) => {
      if (onSoundCue) {
        onSoundCue(bonus >= 500 ? 'barnstormer' : 'bonus');
      }
      const newToast: ToastItem = {
        id: `ach-${def.id}-${Date.now()}`,
        type: 'achievement',
        title: def.title,
        subtitle: `Achievement Unlocked · ${def.subtitle}`,
        icon: def.icon,
        reward: bonus > 0 ? `+$${bonus} Pilot Wallet Bonus` : undefined,
      };
      setToasts((prev) => [...prev, newToast]);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, 4500);
    });

    const unsubHof = achievementManager.onRecord((rec: HallOfFameRecord, isNewAllTime: boolean) => {
      if (isNewAllTime) {
        if (onSoundCue) onSoundCue('barnstormer');
        const newToast: ToastItem = {
          id: `hof-${rec.id}-${Date.now()}`,
          type: 'hof',
          title: rec.title,
          subtitle: `🏆 NEW ALL-TIME RECORD: ${rec.playerValue} ${rec.unit}!`,
          icon: 'Trophy',
          reward: 'Prairie Hall of Fame #1 Plaque Claimed',
        };
        setToasts((prev) => [...prev, newToast]);

        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
        }, 5000);
      }
    });

    return () => {
      unsubUnlock();
      unsubHof();
    };
  }, [onSoundCue]);

  if (!toasts.length) return null;

  return (
    <div className="achievement-toast-container" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`achievement-toast ${toast.type === 'hof' ? 'toast-hof' : ''}`}
        >
          <div className="toast-icon-box">{getBadgeIcon(toast.icon, 22)}</div>
          <div className="toast-body">
            <span className="toast-eyebrow">
              {toast.type === 'hof' ? '★ Hall of Fame Record ★' : 'Badge Unlocked'}
            </span>
            <strong className="toast-title">{toast.title}</strong>
            <span className="badge-subtitle">{toast.subtitle}</span>
            {toast.reward && <span className="toast-reward">{toast.reward}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
