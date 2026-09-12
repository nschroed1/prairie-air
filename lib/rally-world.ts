import * as T from 'three';
import { RALLY_GATES, type RallyGate, type RallyState } from './rally';

export class RallyWorld {
  group = new T.Group();
  private gateMeshes: T.Mesh[] = [];
  private beaconBeam: T.Mesh;
  private ringMaterialActive: T.MeshStandardMaterial;
  private ringMaterialUpcoming: T.MeshStandardMaterial;
  private ringMaterialDone: T.MeshBasicMaterial;

  constructor() {
    this.group.name = 'rally-world';

    this.ringMaterialActive = new T.MeshStandardMaterial({
      color: '#22c55e',
      emissive: '#16a34a',
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.8,
      transparent: true,
      opacity: 0.92,
    });

    this.ringMaterialUpcoming = new T.MeshStandardMaterial({
      color: '#38bdf8',
      emissive: '#0284c7',
      emissiveIntensity: 0.35,
      roughness: 0.4,
      metalness: 0.5,
      transparent: true,
      opacity: 0.65,
    });

    this.ringMaterialDone = new T.MeshBasicMaterial({
      color: '#475569',
      transparent: true,
      opacity: 0.18,
    });

    // Vertical beacon beam above active gate
    const beamGeom = new T.CylinderGeometry(0.8, 3.5, 320, 16, 1, true);
    beamGeom.translate(0, 160, 0);
    const beamMat = new T.MeshBasicMaterial({
      color: '#4ade80',
      transparent: true,
      opacity: 0.3,
      side: T.DoubleSide,
      depthWrite: false,
    });
    this.beaconBeam = new T.Mesh(beamGeom, beamMat);
    this.group.add(this.beaconBeam);

    // Build gate torus arches
    for (let i = 0; i < RALLY_GATES.length; i++) {
      const gate = RALLY_GATES[i];
      const geom = new T.TorusGeometry(gate.radius * 0.75, 1.4, 16, 32);
      const mesh = new T.Mesh(geom, this.ringMaterialUpcoming);
      mesh.position.set(gate.x, gate.y, gate.z);
      mesh.rotation.y = gate.targetHeading;
      this.gateMeshes.push(mesh);
      this.group.add(mesh);
    }
  }

  update(state: RallyState | null, time: number) {
    if (!state || state.completed) {
      this.group.visible = false;
      return;
    }

    this.group.visible = true;
    const activeIndex = state.gateIndex;

    for (let i = 0; i < this.gateMeshes.length; i++) {
      const mesh = this.gateMeshes[i];
      if (i < activeIndex) {
        mesh.material = this.ringMaterialDone;
        mesh.visible = false; // Hide passed gates to reduce clutter
      } else if (i === activeIndex) {
        mesh.material = this.ringMaterialActive;
        mesh.visible = true;
        // Subtle breathing pulse on active gate
        const scale = 1.0 + Math.sin(time * 6) * 0.05;
        mesh.scale.set(scale, scale, scale);

        // Position beacon beam above active gate
        this.beaconBeam.visible = true;
        this.beaconBeam.position.set(mesh.position.x, mesh.position.y, mesh.position.z);
      } else if (i <= activeIndex + 2) {
        mesh.material = this.ringMaterialUpcoming;
        mesh.visible = true;
        mesh.scale.set(1, 1, 1);
      } else {
        mesh.visible = false;
      }
    }

    if (activeIndex >= RALLY_GATES.length) {
      this.beaconBeam.visible = false;
    }
  }

  dispose() {
    this.ringMaterialActive.dispose();
    this.ringMaterialUpcoming.dispose();
    this.ringMaterialDone.dispose();
    (this.beaconBeam.material as T.Material).dispose();
    this.beaconBeam.geometry.dispose();

    for (const mesh of this.gateMeshes) {
      mesh.geometry.dispose();
    }
    this.gateMeshes = [];
    this.group.clear();
  }
}
