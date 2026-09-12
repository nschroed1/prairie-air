import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { applyCropWindAndShadows } from '../lib/fx/crop-wind-shader';

test('applyCropWindAndShadows configures material uniforms, shaders, and cache key', () => {
  const material = new T.MeshStandardMaterial({ color: 0x879b35 });
  const windTime = { value: 1.5 };
  const windVector = { value: new T.Vector2(3.2, -1.8) };
  const cloudGroupPos = { value: new T.Vector3(120.0, 750.0, -340.0) };

  applyCropWindAndShadows(material, 'corn', windTime, windVector, cloudGroupPos);

  // Cache key check
  assert.equal(typeof material.customProgramCacheKey, 'function');
  assert.equal(material.customProgramCacheKey(), 'prairie-crop-wind-v2-corn');

  // Verify soybeans and pasture cache keys
  const soyMat = new T.MeshStandardMaterial();
  applyCropWindAndShadows(soyMat, 'soybeans', windTime, windVector, cloudGroupPos);
  assert.equal(soyMat.customProgramCacheKey(), 'prairie-crop-wind-v2-soybeans');

  const pastureMat = new T.MeshStandardMaterial();
  applyCropWindAndShadows(pastureMat, 'pasture', windTime, windVector, cloudGroupPos);
  assert.equal(pastureMat.customProgramCacheKey(), 'prairie-crop-wind-v2-pasture');

  // Simulate onBeforeCompile
  const mockShader: any = {
    uniforms: {},
    vertexShader: `
      #include <common>
      void main() {
        #include <begin_vertex>
      }
    `,
    fragmentShader: `
      #include <common>
      void main() {
        vec4 diffuseColor = vec4(1.0);
        #include <color_fragment>
      }
    `,
  };

  material.onBeforeCompile(mockShader, {} as any);

  // Uniform checks
  assert.equal(mockShader.uniforms.windTime, windTime);
  assert.equal(mockShader.uniforms.windVector, windVector);
  assert.equal(mockShader.uniforms.cloudPos, cloudGroupPos);
  assert.equal(mockShader.uniforms.cropKind.value, 0); // corn = 0

  // Pasture kind check
  const mockPastureShader: any = {
    uniforms: {},
    vertexShader: '#include <begin_vertex>',
    fragmentShader: '#include <color_fragment>',
  };
  pastureMat.onBeforeCompile(mockPastureShader, {} as any);
  assert.equal(mockPastureShader.uniforms.cropKind.value, 2); // pasture = 2

  // Soybeans kind check
  const mockSoyShader: any = {
    uniforms: {},
    vertexShader: '#include <begin_vertex>',
    fragmentShader: '#include <color_fragment>',
  };
  soyMat.onBeforeCompile(mockSoyShader, {} as any);
  assert.equal(mockSoyShader.uniforms.cropKind.value, 1); // soybeans = 1

  // Vertex shader checks
  assert.ok(mockShader.vertexShader.includes('varying vec3 vWorldField;'));
  assert.ok(
    mockShader.vertexShader.includes(
      'vWorldField = (modelMatrix * vec4(position, 1.0)).xyz;',
    ),
  );

  // Fragment shader checks
  assert.ok(mockShader.fragmentShader.includes('varying vec3 vWorldField;'));
  assert.ok(mockShader.fragmentShader.includes('uniform float windTime;'));
  assert.ok(mockShader.fragmentShader.includes('uniform vec2 windVector;'));
  assert.ok(mockShader.fragmentShader.includes('uniform vec3 cloudPos;'));
  assert.ok(mockShader.fragmentShader.includes('uniform float cropKind;'));

  // Anti-aliased fwidth and distance fade
  assert.ok(mockShader.fragmentShader.includes('fwidth(row)'));
  assert.ok(mockShader.fragmentShader.includes('length(vViewPosition)'));

  // Waves of grain equations
  assert.ok(
    mockShader.fragmentShader.includes(
      'float windWave = sin(dot(vWorldField.xz, normalize(windVector + vec2(0.001, 0.001))) * 0.06 - windTime * 2.6);',
    ),
  );
  assert.ok(
    mockShader.fragmentShader.includes(
      'float fineWave = sin(dot(vWorldField.xz, normalize(windVector + vec2(0.2, -0.1))) * 0.14 - windTime * 4.2) * 0.5 + 0.5;',
    ),
  );
  assert.ok(
    mockShader.fragmentShader.includes(
      'float grainGust = mix(0.86, 1.14, (windWave * 0.6 + fineWave * 0.4) * 0.5 + 0.5);',
    ),
  );
  assert.ok(mockShader.fragmentShader.includes('diffuseColor.rgb *= grainGust;'));

  // Cloud shadows
  assert.ok(mockShader.fragmentShader.includes('cloudPos.xz'));
  assert.ok(
    mockShader.fragmentShader.includes(
      'diffuseColor.rgb *= mix(0.72, 1.0, cloudShadowFactor);',
    ),
  );
});
