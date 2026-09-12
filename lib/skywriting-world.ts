import * as T from 'three';
import type { Simulation } from './simulation';
import type { PublicPilot } from './county';
import {
  skyRoute,
  SKY_SEGMENTS,
  SKY_SPACING,
  SKY_SMOKE_LIMIT,
  SKY_SMOKE_LIFE,
  type SkySmoke,
} from './skywriting';

function smokeMesh(capacity: number) {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute(
    'position',
    new T.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(
      T.DynamicDrawUsage,
    ),
  );
  geometry.setAttribute(
    'born',
    new T.BufferAttribute(new Float32Array(capacity), 1).setUsage(
      T.DynamicDrawUsage,
    ),
  );
  geometry.setDrawRange(0, 0);
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      now: { value: 0 },
      scale: { value: 1000 },
      wind: { value: new T.Vector2() },
    },
    vertexShader: `attribute float born; uniform float now; uniform float scale; uniform vec2 wind; varying float age;
      void main(){age=max(0.,now-born);vec3 p=position;p.xz+=wind*min(age,90.)*.12;p.y+=min(age,90.)*.025;
      vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
      gl_PointSize=clamp((15.+min(age*.07,8.))*scale/max(1.,-mv.z),1.,110.);}`,
    fragmentShader: `varying float age;void main(){float r=length(gl_PointCoord-.5);float edge=1.-smoothstep(.15,.5,r);
      float fade=1.-smoothstep(120.,160.,age);float a=edge*fade*.68;if(a<.01)discard;gl_FragColor=vec4(.98,.985,1.,a);}`,
  });
  const mesh = new T.Points(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}
function fillSmoke(
  mesh: ReturnType<typeof smokeMesh>,
  points: SkySmoke[],
  now: number,
  height: number,
) {
  const pos = mesh.geometry.getAttribute('position') as T.BufferAttribute;
  const born = mesh.geometry.getAttribute('born') as T.BufferAttribute;
  points.forEach((p, i) => {
    pos.setXYZ(i, p[0], p[1], p[2]);
    born.setX(i, p[3]);
  });
  pos.needsUpdate = born.needsUpdate = true;
  mesh.geometry.setDrawRange(0, points.length);
  mesh.material.uniforms.now.value = now;
  mesh.material.uniforms.scale.value = height;
}

/** Bounded smoke buffers; no per-puff scene objects or network particle updates. */
export class SkywritingWorld {
  root = new T.Group();
  guide = new T.Line(
    new T.BufferGeometry(),
    new T.LineBasicMaterial({
      color: '#f7ead1',
      transparent: true,
      opacity: 0.23,
    }),
  );
  gates = new T.InstancedMesh(
    new T.TorusGeometry(23, 0.6, 6, 40),
    new T.MeshBasicMaterial({
      color: '#fff0b3',
      transparent: true,
      opacity: 0.4,
    }),
    7,
  );
  next = new T.Mesh(
    new T.TorusGeometry(23, 1.1, 7, 48),
    new T.MeshBasicMaterial({
      color: '#ffdc70',
      transparent: true,
      opacity: 0.9,
    }),
  );
  own = smokeMesh(SKY_SMOKE_LIMIT);
  remote = smokeMesh(SKY_SMOKE_LIMIT * 32);
  remoteTrails = new Map<
    string,
    {
      job: number;
      last: number;
      elapsed: number;
      seen: number;
      points: SkySmoke[];
    }
  >();
  private jobKey = '';
  private route: ReturnType<typeof skyRoute> = [];
  private dummy = new T.Object3D();
  constructor(scene: T.Scene) {
    this.root.add(this.guide, this.gates, this.next, this.own, this.remote);
    this.gates.frustumCulled = false;
    scene.add(this.root);
  }
  receive(pilots: PublicPilot[] | null, time: number) {
    if (!pilots) {
      this.remoteTrails.clear();
      return;
    }
    for (const pilot of pilots) {
      const sky = pilot.skywriting;
      if (!sky) continue;
      let trail = this.remoteTrails.get(pilot.id);
      if (
        !trail ||
        trail.job !== sky.jobId ||
        sky.elapsed < trail.elapsed - 0.05
      ) {
        trail = {
          job: sky.jobId,
          last: -1,
          elapsed: sky.elapsed,
          seen: time,
          points: [],
        };
        this.remoteTrails.set(pilot.id, trail);
      }
      trail.seen = time;
      trail.elapsed = sky.elapsed;
      for (const point of sky.smoke)
        if (point[3] > trail.last) {
          trail.points.push([
            point[0],
            point[1],
            point[2],
            time - Math.max(0, sky.elapsed - point[3]),
          ]);
          trail.last = point[3];
        }
      trail.points = trail.points
        .filter((p) => time - p[3] < SKY_SMOKE_LIFE)
        .slice(-SKY_SMOKE_LIMIT);
    }
    while (this.remoteTrails.size > 32)
      this.remoteTrails.delete(this.remoteTrails.keys().next().value!);
  }
  update(sim: Simulation, time: number, guides: boolean, height: number) {
    const active = sim.isSkywriting;
    this.own.visible = active;
    const showGuides =
      active && guides && sim.phase !== 'complete' && sim.phase !== 'ready';
    this.guide.visible = this.gates.visible = this.next.visible = showGuides;
    if (active) {
      const key = `${sim.job.id}:${sim.job.skywriting!.altitude}`;
      if (key !== this.jobKey) {
        this.jobKey = key;
        this.route = skyRoute(sim.job);
        this.guide.geometry.dispose();
        this.guide.geometry = new T.BufferGeometry().setFromPoints(
          this.route.map((p) => new T.Vector3(p.x, p.y, p.z)),
        );
      }
      fillSmoke(this.own, sim.skywriting.smoke, sim.elapsed, height);
      this.own.material.uniforms.wind.value.set(
        sim.windVector.x,
        sim.windVector.z,
      );
      if (showGuides) {
        const next = Math.min(
          SKY_SEGMENTS,
          Math.ceil(sim.skywriting.progress / SKY_SPACING),
        );
        let count = 0;
        for (let i = 0; i < 8 && next + i * 2 <= SKY_SEGMENTS; i++) {
          const j = next + i * 2,
            p = this.route[j],
            after = this.route[Math.min(SKY_SEGMENTS, j + 1)],
            before = this.route[Math.max(0, j - 1)];
          this.dummy.position.set(p.x, p.y, p.z);
          this.dummy.lookAt(
            p.x + after.x - before.x,
            p.y + after.y - before.y,
            p.z + after.z - before.z,
          );
          this.dummy.updateMatrix();
          if (i === 0) {
            this.next.position.copy(this.dummy.position);
            this.next.quaternion.copy(this.dummy.quaternion);
          } else this.gates.setMatrixAt(count++, this.dummy.matrix);
        }
        this.gates.count = count;
        this.gates.instanceMatrix.needsUpdate = true;
      }
    }
    const remote: SkySmoke[] = [];
    for (const [id, trail] of this.remoteTrails) {
      if (time - trail.seen > SKY_SMOKE_LIFE) {
        this.remoteTrails.delete(id);
        continue;
      }
      remote.push(...trail.points.filter((p) => time - p[3] < SKY_SMOKE_LIFE));
    }
    fillSmoke(this.remote, remote, time, height);
    this.remote.visible = remote.length > 0;
  }
  dispose() {
    this.root.removeFromParent();
    for (const mesh of [
      this.guide,
      this.gates,
      this.next,
      this.own,
      this.remote,
    ]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.remoteTrails.clear();
  }
}
