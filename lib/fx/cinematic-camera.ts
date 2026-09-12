import * as T from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { Simulation } from '../simulation';

export class CinematicCamera {
  composer: EffectComposer | null = null;
  bloomPass: UnrealBloomPass | null = null;
  renderPass: RenderPass | null = null;
  baseFov: number = 50;
  enabled: boolean = true;
  reducedMotion = false;

  constructor(
    public renderer: T.WebGLRenderer,
    public scene: T.Scene,
    public camera: T.PerspectiveCamera,
  ) {
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();

    try {
      const width = this.renderer.domElement?.clientWidth || 1024;
      const height = this.renderer.domElement?.clientHeight || 768;
      const resolution = new T.Vector2(width, height);

      const composer = new EffectComposer(this.renderer);
      const renderPass = new RenderPass(this.scene, this.camera);
      composer.addPass(renderPass);

      const bloomPass = new UnrealBloomPass(resolution, 0.22, 0.35, 0.86);
      composer.addPass(bloomPass);

      this.composer = composer;
      this.renderPass = renderPass;
      this.bloomPass = bloomPass;
    } catch (error) {
      console.warn(
        'CinematicCamera: Failed to initialize post-processing composer, falling back to standard rendering.',
        error,
      );
      this.composer = null;
      this.renderPass = null;
      this.bloomPass = null;
    }
  }

  render(dt: number, sim: Simulation, time: number): void {
    // Dynamic Speed FOV
    const targetFov =
      sim.isSkywriting && sim.phase === 'complete'
        ? this.camera.fov
        : !this.reducedMotion && sim.speed > 35 && sim.altitude < 18
          ? 55
          : this.baseFov;
    this.camera.fov +=
      (targetFov - this.camera.fov) * (1 - Math.exp(-dt * 3.5));
    this.camera.updateProjectionMatrix();

    // Low-Altitude Ground Rush Camera Rumble
    if (!this.reducedMotion && sim.altitude < 8 && sim.speed > 32) {
      this.camera.position.y += Math.sin(time * 50) * 0.035;
    }

    // Render using composer or fallback to standard WebGLRenderer
    if (this.enabled && this.composer) {
      try {
        this.composer.render();
      } catch (error) {
        console.warn(
          'CinematicCamera: EffectComposer render failed, falling back to standard rendering.',
          error,
        );
        this.enabled = false;
        this.renderer.render(this.scene, this.camera);
      }
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  resize(width: number, height: number): void {
    if (this.composer) {
      this.composer.setSize(width, height);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(width, height);
      this.bloomPass.setSize(width, height);
    }
  }

  dispose(): void {
    if (this.bloomPass) {
      this.bloomPass.dispose();
      this.bloomPass = null;
    }
    if (this.renderPass) {
      this.renderPass.dispose();
      this.renderPass = null;
    }
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
  }
}
