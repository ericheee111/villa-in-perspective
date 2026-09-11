import * as THREE from './vendor/three.module.js';

export const LEVELS = { B1: -3.06, F1: 0, F2: 3.06 };

export class ViewCutaway {
  constructor() {
    this.planes = new Map();
    for (const [floor, level] of Object.entries(LEVELS)) {
      this.planes.set(floor, [new THREE.Plane(new THREE.Vector3(0, -1, 0), level + 1.05), new THREE.Plane()]);
    }
    this.direction = new THREE.Vector3(0, 0, 1);
  }

  update(cameraPosition, focus, plan = false) {
    const vertical = Math.abs(cameraPosition.y - focus.y);
    this.direction.subVectors(cameraPosition, focus);this.direction.y = 0;
    const topDown = plan || this.direction.length() < Math.max(.01, vertical * .18);
    this.direction.normalize();
    for (const [height, front] of this.planes.values()) {
      if (topDown) front.copy(height);
      else front.set(this.direction.clone().negate(), this.direction.dot(focus) + .12);
    }
  }

  apply(root, { enabled, inside, overview }) {
    root.traverse(mesh => {
      if (!mesh.isMesh) return;
      const role = mesh.userData.role;
      const exterior = mesh.userData.exterior;
      mesh.visible = role !== 'ceiling' || (!enabled && (inside || overview));
      if (exterior) mesh.visible = overview && (!enabled || role === 'shell');
      const material = mesh.material;
      const floor = mesh.userData.floor || material.userData.floor;
      const planes = enabled && role === 'shell' ? this.planes.get(floor) || this.planes.get('F2') : [];
      const changed = material.clippingPlanes !== planes || material.clipIntersection !== true;
      material.clippingPlanes = planes;
      // Intersect the near-camera half-space with the part above the low wall.
      // Far walls retain their complete height, even while the camera rotates.
      material.clipIntersection = true;
      if (changed) material.needsUpdate = true;
    });
  }
}

function horizontal(points, bottom, thickness, material, holes = []) {
  const path = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const polygon of holes) path.holes.push(new THREE.Path(polygon.map(([x, z]) => new THREE.Vector2(x, -z))));
  const geometry = new THREE.ExtrudeGeometry(path, { depth: thickness, bevelEnabled: false, steps: 1 });
  geometry.rotateX(-Math.PI / 2);geometry.translate(0, bottom, 0);
  return new THREE.Mesh(geometry, material.clone());
}

function box(size, position, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material.clone());
  mesh.position.fromArray(position);return mesh;
}

export function addLandingConnector(root, definition) {
  const d = definition.landingConnector;
  const material = new THREE.MeshStandardMaterial({ color: 0xcac6b9, roughness: .86 });
  const mesh = box(d.size, d.position, material);
  mesh.name = 'F2_Overview_Landing_Connector';
  mesh.userData = { role: 'floor', floor: 'F2', provisionalConnector: true };
  root.add(mesh);return mesh;
}

export function createExterior(definition) {
  const group = new THREE.Group();group.name = 'Provisional_Exterior';
  const plaster = new THREE.MeshStandardMaterial({ color: 0xe7e2d6, roughness: .88 });
  const stone = new THREE.MeshStandardMaterial({ color: 0xb3b0a3, roughness: .86 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x4e584e, roughness: .52, metalness: .35 });
  const add = (mesh, name, floor, role = 'ceiling') => {
    mesh.name = name;mesh.userData = { role, floor, exterior: true };group.add(mesh);return mesh;
  };
  // Source footprint and stair shaft are retained; no opaque roof crosses the stair.
  add(horizontal(definition.roof, 5.98, .14, plaster, [definition.roofOpening]), 'Main_Roof', 'F2');
  for (let i = 0; i < definition.roof.length; i++) {
    const a = definition.roof[i], b = definition.roof[(i + 1) % definition.roof.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    const band = box([length + .06, .16, .10], [(a[0] + b[0]) / 2, 6.13, (a[1] + b[1]) / 2], stone);
    band.rotation.y = -Math.atan2(dz, dx);add(band, 'Roof_Edge_' + i, 'F2');
  }
  add(horizontal(definition.garageRoof, 2.86, .16, plaster), 'Garage_Roof', 'F1');
  // A plain stair headhouse is a replaceable exterior proposal above the authored roof stair.
  const h = definition.headhouse, x = (h.minX + h.maxX) / 2, z = (h.minZ + h.maxZ) / 2;
  const width = h.maxX - h.minX, depth = h.maxZ - h.minZ, middle = 6.12 + h.height / 2;
  add(box([width, h.height, .12], [x, middle, h.minZ], plaster), 'Stair_Head_North', 'F2');
  add(box([.12, h.height, depth], [h.maxX, middle, z], plaster), 'Stair_Head_East', 'F2');
  add(box([.12, h.height, depth], [h.minX, middle, z], plaster), 'Stair_Head_West', 'F2');
  // Leave an actual opening toward the roof terrace instead of sealing the terminal landing.
  const opening = 1.05, left = h.doorX - opening / 2, right = h.doorX + opening / 2;
  add(box([left - h.minX, h.height, .12], [(h.minX + left) / 2, middle, h.maxZ], plaster), 'Stair_Head_South_Left', 'F2');
  add(box([h.maxX - right, h.height, .12], [(right + h.maxX) / 2, middle, h.maxZ], plaster), 'Stair_Head_South_Right', 'F2');
  add(box([opening, h.height - 2.05, .12], [h.doorX, 6.12 + 2.05 + (h.height - 2.05) / 2, h.maxZ], plaster), 'Stair_Head_Lintel', 'F2');
  add(box([width + .16, .14, depth + .16], [x, 6.12 + h.height + .07, z], metal), 'Stair_Head_Roof', 'F2');
  // Extend the rooftop landing to the headhouse doorway over the roof opening.
  add(horizontal(definition.roofLanding, 5.99, .13, stone), 'Roof_Landing_Extension', 'F2');
  const canopy = definition.canopy;
  const shade = box(canopy.size, canopy.position, metal);shade.rotation.y = canopy.rotation;
  add(shade, 'West_Entry_Canopy', 'F1');
  return group;
}

export function createStairRoute(definition) {
  const group = new THREE.Group();group.name = 'Stair_Route_Guide';
  const material = new THREE.LineBasicMaterial({ color: 0xc99442, transparent: true, opacity: .9, depthTest: false });
  // Straight polyline segments follow the real tread centers; no smoothed shortcuts through walls.
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(definition.route.map(p => new THREE.Vector3(...p))), material);
  line.renderOrder = 10;group.add(line);
  return group;
}
