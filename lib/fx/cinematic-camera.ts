import * as T from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Simulation } from '../simulation';

export class CinematicCamera {
  composer: EffectComposer | null = null;
  bloomPass: UnrealBloomPass | null = null;
  renderPass: RenderPass | null = null;
  outputPass: OutputPass | null = null;
  baseFov: number = 50;
  enabled: boolean = true;
  usePostProcessing: boolean = false;
  reducedMotion = false;

  constructor(
    public renderer: T.WebGLRenderer,
    public scene: T.Scene,
    public camera: T.PerspectiveCamera,
    public options?: {
      bloomStrength?: number;
      bloomRadius?: number;
      bloomThreshold?: number;
      usePostProcessing?: boolean;
    },
  ) {
    this.usePostProcessing = options?.usePostProcessing ?? false;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();

    try {
      const width = this.renderer.domElement?.clientWidth || 1024;
      const height = this.renderer.domElement?.clientHeight || 768;
      const resolution = new T.Vector2(width, height);

      const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined';
      const renderTarget = new T.WebGLRenderTarget(width, height, {
        type: T.HalfFloatType,
        format: T.RGBAFormat,
        colorSpace: T.SRGBColorSpace,
        samples: isWebGL2 ? 4 : 0,
      });

      const composer = new EffectComposer(this.renderer, renderTarget);
      const pixelRatio = this.renderer.getPixelRatio ? this.renderer.getPixelRatio() : 1;
      composer.setPixelRatio(pixelRatio);
      const renderPass = new RenderPass(this.scene, this.camera);
      composer.addPass(renderPass);

      const bStrength = options?.bloomStrength ?? 0.22;
      const bRadius = options?.bloomRadius ?? 0.35;
      const bThreshold = options?.bloomThreshold ?? 0.86;
      const bloomPass = new UnrealBloomPass(resolution, bStrength, bRadius, bThreshold);
      composer.addPass(bloomPass);

      if (this.renderer && 'outputColorSpace' in this.renderer && this.renderer.outputColorSpace) {
        const outputPass = new OutputPass();
        composer.addPass(outputPass);
        this.outputPass = outputPass;
      }

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
      this.outputPass = null;
    }
  }

  render(dt: number, sim: Simulation, time: number, nightFactor = 0): void {
    if (this.bloomPass) {
      const defaultThresh = this.options?.bloomThreshold ?? 1.35;
      const defaultStrength = this.options?.bloomStrength ?? 0.10;
      this.bloomPass.threshold = nightFactor > 0.1 ? 0.95 : defaultThresh;
      this.bloomPass.strength = nightFactor > 0.1 ? 0.16 : defaultStrength;
    }

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

    // Direct WebGL rendering provides native hardware MSAA and ACESFilmic tone mapping
    // without the periodic ANGLE/Metal resolve drops or bloom flickering of EffectComposer.
    if (this.usePostProcessing && this.enabled && this.composer) {
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
      const pixelRatio = this.renderer.getPixelRatio ? this.renderer.getPixelRatio() : 1;
      this.composer.setPixelRatio(pixelRatio);
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
    if (this.outputPass) {
      this.outputPass.dispose();
      this.outputPass = null;
    }
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
  }
}
