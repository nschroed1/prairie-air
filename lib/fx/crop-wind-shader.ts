import * as T from 'three';
import type { Field } from '../simulation';

/**
 * Applies animated wind waves, row striping, and drifting cumulus cloud shadows
 * to agricultural crop field materials.
 */
export function applyCropWindAndShadows(
  material: T.MeshStandardMaterial,
  crop: Field['crop'],
  windTime: { value: number },
  windVectorUniform: { value: T.Vector2 },
  cloudGroupPos: { value: T.Vector3 },
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = windTime;
    shader.uniforms.windVector = windVectorUniform;
    shader.uniforms.cloudPos = cloudGroupPos;
    shader.uniforms.cropKind = {
      value: crop === 'pasture' ? 2 : crop === 'corn' ? 0 : 1,
    };

    shader.vertexShader = 'varying vec3 vWorldField;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvWorldField = (modelMatrix * vec4(position, 1.0)).xyz;',
    );

    shader.fragmentShader =
      'varying vec3 vWorldField;\n' +
      'uniform float windTime;\n' +
      'uniform vec2 windVector;\n' +
      'uniform vec3 cloudPos;\n' +
      'uniform float cropKind;\n' +
      shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>

      // Crop row striping with anti-aliased fwidth and distance fade
      vec2 pField = vWorldField.xz;
      float rowPitch = cropKind < 0.5 ? 2.244 : 2.85;
      float row = pField.x * rowPitch;
      float aa = 1.0 - smoothstep(0.35, 2.8, fwidth(row));
      float rows = (0.5 + 0.5 * sin(row)) * aa;
      float distanceFade = 1.0 - smoothstep(180.0, 1300.0, length(vViewPosition));
      float broad = 0.5 + 0.5 * sin(pField.x * 0.075 + sin(pField.y * 0.006));
      float mottling = sin(pField.x * 0.025 + sin(pField.y * 0.017)) * sin(pField.y * 0.028) * 0.05;
      float colorRows = mix(0.79, 1.13, rows);
      float pastureMottle = 0.94 + 0.06 * sin(pField.x * 0.04 + pField.y * 0.009);

      diffuseColor.rgb *= mix(mix(1.0, colorRows, distanceFade * 0.7), pastureMottle, step(1.5, cropKind));
      diffuseColor.rgb *= 0.93 + 0.08 * broad + mottling;
      diffuseColor.rgb *= 0.98;

      // Waves of Grain: Animated traveling Perlin/sine wind waves racing across the field in the direction of windVector
      float windWave = sin(dot(vWorldField.xz, normalize(windVector + vec2(0.001, 0.001))) * 0.06 - windTime * 2.6);
      float fineWave = sin(dot(vWorldField.xz, normalize(windVector + vec2(0.2, -0.1))) * 0.14 - windTime * 4.2) * 0.5 + 0.5;
      float grainGust = mix(0.86, 1.14, (windWave * 0.6 + fineWave * 0.4) * 0.5 + 0.5);
      diffuseColor.rgb *= grainGust;

      // Dark loam topsoil furrows between corn rows (30-inch standard row spacing)
      if (cropKind < 0.5) {
        vec3 darkLoam = vec3(0.24, 0.19, 0.14);
        float furrow = (1.0 - rows) * aa * 0.44 * distanceFade;
        diffuseColor.rgb = mix(diffuseColor.rgb, darkLoam, furrow);
      }

      // Sunlit golden wheat shimmer for wheat / pasture
      if (cropKind > 1.5) {
        float wheatHeads = sin(pField.x * 5.2 + pField.y * 3.7) * 0.05 + 0.05;
        diffuseColor.rgb += vec3(0.08, 0.06, 0.01) * wheatHeads * distanceFade;
      }

      // Cloud Shadows: Calculate approximate 2D distance from vWorldField.xz to cumulus cloud clusters drifting overhead at cloudPos.xz
      vec2 cloudRel = vWorldField.xz - cloudPos.xz;
      vec2 clusterCell = cloudRel / 1400.0;
      vec2 iCluster = floor(clusterCell);
      vec2 fCluster = fract(clusterCell);
      float minCloudDist = 10.0;

      for (int dx = -1; dx <= 1; dx++) {
        for (int dz = -1; dz <= 1; dz++) {
          vec2 neighbor = vec2(float(dx), float(dz));
          vec2 cell = iCluster + neighbor;
          vec2 center = neighbor + 0.5 + 0.28 * sin(cell.yx * 2.39 + cell * 1.13);
          float d = length(fCluster - center);
          minCloudDist = min(minCloudDist, d);
        }
      }

      float cloudBillow = sin(cloudRel.x * 0.007 + sin(cloudRel.y * 0.005) * 2.0) * 0.03;
      float cloudShadowFactor = smoothstep(0.18, 0.38, minCloudDist + cloudBillow);
      diffuseColor.rgb *= mix(0.72, 1.0, cloudShadowFactor);`,
    );
  };

  material.customProgramCacheKey = () => 'prairie-crop-wind-v2-' + crop;
}
