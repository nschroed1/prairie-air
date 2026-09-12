import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Simulation } from '../lib/simulation';
import { nextPass } from '../lib/flight-guidance';
import {
  ArcadeFX,
  DECK_SKIM_ALTITUDE_METERS,
  SWATH_LOCK_TOLERANCE_METERS,
} from '../lib/fx/arcade-fx';
import {
  AircraftFX,
  getVaporStreakTier,
  VAPOR_STREAK_TIERS,
} from '../lib/fx/aircraft-fx';

void test('ArcadeFX instantiates cleanly with and without scene, and initializes particle pools', () => {
  // 1. Headless standalone instantiation (no scene/plane/camera)
  const standalone = new ArcadeFX();
  assert.equal(standalone.getBadges().length, 32, 'Should preallocate 32 badges');
  assert.equal(standalone.getActiveBadges().length, 0, 'No active badges initially');
  assert.equal(standalone.isSwathLocked(), false);
  assert.equal(standalone.getSwathLockPulse(), 0);
  standalone.dispose();

  // 2. Full scene/plane instantiation
  const scene = new T.Scene();
  const plane = new T.Group();
  scene.add(plane);
  const camera = new T.PerspectiveCamera();

  const fx = new ArcadeFX(scene, plane, camera);
  const leafPoints = fx.getLeafChaffPoints();
  assert.ok(leafPoints, 'Should create leaf/chaff Points mesh');
  assert.equal(leafPoints.frustumCulled, false);
  assert.equal(leafPoints.name, 'arcade-fx-leaf-chaff');

  const geo = leafPoints.geometry;
  const posAttr = geo.getAttribute('position') as T.BufferAttribute;
  const alphaAttr = geo.getAttribute('fxAlpha') as T.BufferAttribute;
  const colorAttr = geo.getAttribute('color') as T.BufferAttribute;

  assert.ok(posAttr, 'Leaf points must have position attribute');
  assert.ok(alphaAttr, 'Leaf points must have fxAlpha attribute');
  assert.ok(colorAttr, 'Leaf points must have color attribute');
  assert.equal(posAttr.usage, T.DynamicDrawUsage);
  assert.equal(alphaAttr.usage, T.DynamicDrawUsage);
  assert.equal(colorAttr.usage, T.DynamicDrawUsage);

  const badgeGroup = scene.getObjectByName('arcade-fx-badges');
  assert.ok(badgeGroup, 'Should attach badgeGroup to scene');

  const reticleMesh = fx.getReticleMesh();
  assert.ok(reticleMesh, 'Should attach reticleMesh to plane');

  fx.dispose();
});

void test('Floating Score Badge System lifecycle: float, spring bounce, alpha fade, and recycling', () => {
  const fx = new ArcadeFX();

  const startPos = new T.Vector3(12, 15, -45);
  const badge = fx.addFloatingBadge('+$25 CLEAN PASS x2!', '#22c55e', startPos);

  assert.equal(badge.active, true);
  assert.equal(badge.text, '+$25 CLEAN PASS x2!');
  assert.equal(badge.color, '#22c55e');
  assert.equal(badge.life, 1.2);
  assert.equal(badge.maxLife, 1.2);
  assert.equal(badge.scale, 0);
  assert.equal(badge.opacity, 1);
  assert.equal(badge.basePos.x, 12);
  assert.equal(badge.basePos.y, 15);
  assert.equal(badge.basePos.z, -45);

  const sim = new Simulation();

  // Advance 0.2s (spring bounce pop-in)
  fx.update(0.2, sim, 0.2);
  assert.equal(badge.active, true);
  assert.ok(badge.worldPos.y > badge.basePos.y, 'Badge should float upward');
  assert.ok(badge.scale > 0, 'Badge scale should spring up');
  assert.equal(badge.opacity, 1, 'Badge opacity should remain 1 early in life');

  // Advance to 0.75s (near end of full opacity)
  fx.update(0.55, sim, 0.75);
  assert.equal(badge.active, true);
  assert.ok(badge.worldPos.y > badge.basePos.y + 1.5, 'Badge should continue vertical rise');
  assert.equal(badge.scale, 1, 'Scale should settle to 1.0 after bounce');

  // Advance to 1.0s (into alpha fade region)
  fx.update(0.25, sim, 1.0);
  assert.equal(badge.active, true);
  assert.ok(badge.opacity < 1 && badge.opacity > 0, 'Badge should be fading out in final phase');

  // Advance past 1.2s expiration
  fx.update(0.3, sim, 1.3);
  assert.equal(badge.active, false, 'Badge should be inactive after 1.2s');
  assert.equal(badge.opacity, 0);

  // Test micro-reward badge texts
  const rewards = [
    { text: '+$25 CLEAN PASS x2!', color: '#22c55e' },
    { text: '+$75 WIZARD WINGOVER!', color: '#38bdf8' },
    { text: '+$1 DECK SKIM', color: '#facc15' },
    { text: 'STREAK x3!', color: '#f59e0b' },
    { text: 'BARNSTORMER +$250', color: '#fbbf24' },
  ];

  for (const reward of rewards) {
    const b = fx.addFloatingBadge(reward.text, reward.color, startPos);
    assert.equal(b.active, true);
    assert.equal(b.text, reward.text);
    assert.equal(b.color, reward.color);
  }

  // Test pool recycling: add more badges than pool capacity (32)
  for (let i = 0; i < 40; i++) {
    const recycled = fx.addFloatingBadge(`TEST_${i}`, '#ffffff', startPos);
    assert.ok(recycled, 'Should safely allocate from fixed pool');
    assert.equal(recycled.active, true);
  }
  assert.equal(fx.getBadges().length, 32, 'Pool size must remain fixed at 32');

  fx.dispose();
});

void test('Swath Lock Reticle FX pulses when entering +-1.5m alignment', () => {
  const scene = new T.Scene();
  const plane = new T.Group();
  scene.add(plane);
  const fx = new ArcadeFX(scene, plane);

  const sim = new Simulation();
  const pass = nextPass(sim);

  // Place aircraft far laterally from next pass (offset > 1.5m)
  sim.x = pass.x + 40;
  fx.update(0.016, sim, 0);

  assert.equal(fx.isSwathLocked(), false, 'Should not be locked when offset > 1.5m');
  assert.equal(fx.getSwathLockPulse(), 0);
  assert.ok(fx.getSwathOffset() > SWATH_LOCK_TOLERANCE_METERS);

  // Bring aircraft directly onto pass centerline (offset <= 1.5m)
  sim.x = pass.x; // Exactly on pass centerline
  fx.update(0.016, sim, 0.016);

  assert.equal(fx.isSwathLocked(), true, 'Should lock when within +-1.5m');
  assert.equal(fx.getSwathLockPulse(), 1.0, 'Entering lock should trigger 1.0 crosshair pulse');
  assert.ok(fx.getSwathOffset() <= SWATH_LOCK_TOLERANCE_METERS);

  // Advance time: pulse should decay while remaining locked
  fx.update(0.2, sim, 0.216);
  assert.equal(fx.isSwathLocked(), true, 'Should remain locked while aligned');
  assert.ok(fx.getSwathLockPulse() < 1.0 && fx.getSwathLockPulse() > 0, 'Pulse should decay');

  // Step outside tolerance
  sim.x = pass.x + 30;
  fx.update(0.016, sim, 0.25);
  assert.equal(fx.isSwathLocked(), false, 'Should unlock when leaving tolerance');

  fx.dispose();
});

void test('Deck Skimmer Crop Wash FX kicks up leaves and chaff under 30 ft and stays idle when high', () => {
  const scene = new T.Scene();
  const plane = new T.Group();
  scene.add(plane);
  const fx = new ArcadeFX(scene, plane);

  const sim = new Simulation();
  // High altitude (> 30 ft = 9.144m)
  sim.y = 200;
  sim.speed = 32;

  for (let i = 0; i < 5; i++) {
    fx.update(0.016, sim, i * 0.016);
  }

  const leafPoints = fx.getLeafChaffPoints()!;
  const alphas = leafPoints.geometry.getAttribute('fxAlpha') as T.BufferAttribute;

  let activeCount = 0;
  for (let i = 0; i < alphas.count; i++) {
    if (alphas.getX(i) > 0) activeCount++;
  }
  assert.equal(activeCount, 0, 'No leaf & chaff particles should emit when above 30 ft');

  // Skim under 30 ft (altitude = 4m < 9.144m) with speed > 16
  sim.y = sim.y - sim.altitude + 4; // altitude = 4m
  assert.ok(sim.altitude < DECK_SKIM_ALTITUDE_METERS);

  for (let i = 0; i < 15; i++) {
    fx.update(0.016, sim, 1 + i * 0.016);
  }

  activeCount = 0;
  for (let i = 0; i < alphas.count; i++) {
    if (alphas.getX(i) > 0) activeCount++;
  }
  assert.ok(activeCount > 0, 'High-density leaf and chaff particles should emit under 30 ft');

  // Check color attribute exists and has valid values
  const colors = leafPoints.geometry.getAttribute('color') as T.BufferAttribute;
  assert.ok(colors, 'Particles must have vertex colors');
  assert.ok(colors.getX(0) > 0 || colors.getY(0) > 0, 'Colors should be populated');

  // Let particles fade after ascending
  sim.y = 200;
  for (let i = 0; i < 70; i++) {
    fx.update(0.02, sim, 2 + i * 0.02);
  }

  activeCount = 0;
  for (let i = 0; i < alphas.count; i++) {
    if (alphas.getX(i) > 0) activeCount++;
  }
  assert.equal(activeCount, 0, 'Leaf & chaff particles should fade out completely');

  fx.dispose();
});

void test('Vapor trail streak tier configurations and dynamic color mappings', () => {
  // 1. Check all 5 tier configurations
  assert.equal(VAPOR_STREAK_TIERS[1].color, '#ffffff');
  assert.equal(VAPOR_STREAK_TIERS[1].hex, 0xffffff);
  assert.equal(VAPOR_STREAK_TIERS[1].opacity, 0.4);

  assert.equal(VAPOR_STREAK_TIERS[2].color, '#e2e8f0');
  assert.equal(VAPOR_STREAK_TIERS[2].hex, 0xe2e8f0);
  assert.equal(VAPOR_STREAK_TIERS[2].opacity, 0.55);

  assert.equal(VAPOR_STREAK_TIERS[3].color, '#f59e0b');
  assert.equal(VAPOR_STREAK_TIERS[3].hex, 0xf59e0b);
  assert.equal(VAPOR_STREAK_TIERS[3].opacity, 0.7);

  assert.equal(VAPOR_STREAK_TIERS[4].color, '#10b981');
  assert.equal(VAPOR_STREAK_TIERS[4].hex, 0x10b981);
  assert.equal(VAPOR_STREAK_TIERS[4].opacity, 0.8);

  assert.equal(VAPOR_STREAK_TIERS[5].color, '#fbbf24');
  assert.equal(VAPOR_STREAK_TIERS[5].hex, 0xfbbf24);
  assert.equal(VAPOR_STREAK_TIERS[5].opacity, 0.95);
  assert.equal(VAPOR_STREAK_TIERS[5].additive, true);

  // Test getVaporStreakTier helper bounds
  assert.equal(getVaporStreakTier(0).streak, 1);
  assert.equal(getVaporStreakTier(1).streak, 1);
  assert.equal(getVaporStreakTier(2).streak, 2);
  assert.equal(getVaporStreakTier(3).streak, 3);
  assert.equal(getVaporStreakTier(4).streak, 4);
  assert.equal(getVaporStreakTier(5).streak, 5);
  assert.equal(getVaporStreakTier(10).streak, 5, 'Streaks >= 5 cap at Tier 5');

  // 2. Test AircraftFX dynamic shifting with sim.arcade?.passStreak
  const scene = new T.Scene();
  const plane = new T.Group();
  scene.add(plane);
  const aircraftFx = new AircraftFX(scene, plane);

  const sim = new Simulation();

  // Tier 1 (streak = 1 or undefined)
  sim.arcade = { passStreak: 1 } as any;
  aircraftFx.update(0.016, sim, 0);
  assert.equal(aircraftFx.vortexMat.color.getHexString(), 'ffffff');
  assert.equal(aircraftFx.vortexMat.opacity, 0.4);

  // Tier 2 (streak = 2)
  sim.arcade.passStreak = 2;
  aircraftFx.update(0.016, sim, 0.1);
  assert.equal(aircraftFx.vortexMat.color.getHexString(), 'e2e8f0');
  assert.equal(aircraftFx.vortexMat.opacity, 0.55);

  // Tier 3 (streak = 3)
  sim.arcade.passStreak = 3;
  aircraftFx.update(0.016, sim, 0.2);
  assert.equal(aircraftFx.vortexMat.color.getHexString(), 'f59e0b');
  assert.equal(aircraftFx.vortexMat.opacity, 0.7);

  // Tier 4 (streak = 4)
  sim.arcade.passStreak = 4;
  aircraftFx.update(0.016, sim, 0.3);
  assert.equal(aircraftFx.vortexMat.color.getHexString(), '10b981');
  assert.equal(aircraftFx.vortexMat.opacity, 0.8);

  // Tier 5 (streak = 5, Radiant Amber Firestream)
  sim.arcade.passStreak = 5;
  aircraftFx.update(0.016, sim, 0.4);
  assert.equal(aircraftFx.vortexMat.color.getHexString(), 'fbbf24');
  assert.equal(aircraftFx.vortexMat.opacity, 0.95);
  assert.equal(aircraftFx.vortexMat.blending, T.AdditiveBlending);

  // Unset arcade defaults to Tier 1
  sim.arcade = undefined as any;
  aircraftFx.update(0.016, sim, 0.5);
  assert.equal(aircraftFx.vortexMat.color.getHexString(), 'ffffff');
  assert.equal(aircraftFx.vortexMat.opacity, 0.4);

  aircraftFx.dispose();
});

void test('ArcadeFX dispose cleans up scene and is safe against double-dispose or post-dispose update', () => {
  const scene = new T.Scene();
  const plane = new T.Group();
  scene.add(plane);
  const fx = new ArcadeFX(scene, plane);

  assert.ok(scene.getObjectByName('arcade-fx-leaf-chaff'));
  assert.ok(scene.getObjectByName('arcade-fx-badges'));
  assert.ok(plane.getObjectByName('arcade-fx-reticle'));

  fx.dispose();

  assert.equal(scene.getObjectByName('arcade-fx-leaf-chaff'), undefined);
  assert.equal(scene.getObjectByName('arcade-fx-badges'), undefined);
  assert.equal(plane.getObjectByName('arcade-fx-reticle'), undefined);

  // Double dispose safe
  fx.dispose();

  // Post dispose update safe
  const sim = new Simulation();
  fx.update(0.016, sim, 1.0);
  const badge = fx.addFloatingBadge('TEST', '#ffffff', new T.Vector3());
  assert.ok(badge);
});
