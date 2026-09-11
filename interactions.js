import * as THREE from './vendor/three.module.js';

// Authored world-space geometry stays intact; only the door assembly receives a pivot.
export class HouseInteractions {
  constructor(definition, onChange = () => {}, reducedMotion = false) {
    this.definition = definition;
    this.onChange = onChange;
    this.reducedMotion = reducedMotion;
    this.doors = new Map();
    this.lights = new Map();
  }

  prepareFloor(floor, root) {
    for (const def of this.definition.doors.filter(d => d.floor === floor)) {
      const pivot = new THREE.Group();
      pivot.name = def.id;
      pivot.position.fromArray(def.pivot);
      root.add(pivot);
      this.doors.set(def.id, { def, pivot, value: def.initial, target: def.initial, open: def.initialOpen });
    }
  }

  attachDoorMesh(id, mesh) {
    const door = this.doors.get(id);
    if (!door) throw new Error('Unknown articulated mesh: ' + id);
    mesh.geometry.translate(...door.def.pivot.map(v => -v));
    mesh.userData.doorId = id;
    mesh.userData.role = 'door';
    mesh.material.userData.role = 'door';
    door.pivot.add(mesh);
  }

  buildLights(floor, root) {
    const sphere = new THREE.SphereGeometry(.045, 8, 6);
    for (const def of this.definition.lights.filter(d => d.floor === floor)) {
      const group = new THREE.Group();
      group.name = def.id;
      root.add(group);
      const glows = [];
      for (const fixture of def.fixtures) {
        const color = new THREE.Color(...fixture.color);
        const material = new THREE.MeshStandardMaterial({ color: 0xb8ad8f, emissive: color, emissiveIntensity: 3, roughness: .5 });
        const glow = new THREE.Mesh(sphere, material);
        glow.position.fromArray(fixture.position);
        glow.userData.lightId = def.id;
        glow.userData.role = 'lamp';
        group.add(glow);
        glows.push(glow);
      }
      // One light per room keeps three full floors usable on integrated graphics.
      // Use the strongest ceiling fixture's source position, or the strongest task lamp.
      const high = def.fixtures.filter(f => f.position[1] > ({ F1: 0, F2: 3.06, B1: -3.06 }[floor]) + 2.3);
      const candidates = high.length ? high : def.fixtures;
      const source = candidates.reduce((a, b) => a.energy > b.energy ? a : b);
      const intensity = Math.min(38, Math.max(8, def.fixtures.reduce((sum, f) => sum + f.energy, 0) * .55));
      const lamp = new THREE.PointLight(new THREE.Color(...source.color), intensity, 6.5, 2);
      lamp.position.fromArray(source.position);
      group.add(lamp);
      this.lights.set(def.id, { def, group, lamp, intensity, glows, on: true });
    }
  }

  setDoor(id, open) {
    const door = this.doors.get(id);
    if (!door) return;
    door.open = open;
    door.target = open ? door.def.open : door.def.closed;
    if (this.reducedMotion) { door.value = door.target; this.applyDoor(door); }
    this.onChange({ type: 'door', id, on: open, label: door.def.label });
  }

  toggleDoor(id) { const door = this.doors.get(id); if (door) this.setDoor(id, !door.open); }

  applyDoor(door) {
    if (door.def.kind === 'slide') door.pivot.position.x = door.def.pivot[0] + door.value;
    else door.pivot.rotation.y = door.value;
  }

  update(dt) {
    for (const door of this.doors.values()) {
      if (door.value === door.target) continue;
      door.value += (door.target - door.value) * (1 - Math.exp(-Math.max(0, dt) * 9));
      if (Math.abs(door.target - door.value) < .0005) door.value = door.target;
      this.applyDoor(door);
    }
  }

  setLight(id, on) {
    const light = this.lights.get(id);
    if (!light) return;
    light.on = on;
    // Retain the light in the renderer's pool to avoid recompiling every material.
    light.lamp.intensity = on ? light.intensity : 0;
    for (const glow of light.glows) glow.material.emissiveIntensity = on ? 3 : 0;
    this.onChange({ type: 'light', id, on, label: light.def.label });
  }

  toggleLight(id) { const light = this.lights.get(id); if (light) this.setLight(id, !light.on); }

  scoped(type, floor, room = null) {
    return [...(type === 'door' ? this.doors : this.lights).values()].filter(d => (floor === 'ALL' || d.def.floor === floor) && (!room || d.def.room === room));
  }
}

export function isTap(start, end) {
  return !!start && start.id === end.id && Math.hypot(end.x - start.x, end.y - start.y) < 6 && end.time - start.time < 700;
}
