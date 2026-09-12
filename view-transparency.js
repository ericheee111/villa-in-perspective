import * as THREE from './vendor/three.module.js';

export const VIEW_OPACITY = { wall: .12, furniture: .28 };
const ROLES = new Set(['shell', 'furniture', 'door']);
const fragmentMask = `
varying vec3 vViewWorld;
uniform float viewWallEnabled;
uniform float viewFollowEnabled;
uniform vec4 viewHeight;
uniform vec4 viewFront;
uniform vec3 viewEye;
uniform vec3 viewPeople[4];
uniform int viewPeopleCount;
bool viewFaded() {
  if (viewWallEnabled > .5 && dot(viewHeight, vec4(vViewWorld, 1.0)) < 0.0 && dot(viewFront, vec4(vViewWorld, 1.0)) < 0.0) return true;
  if (viewFollowEnabled > .5) {
    for (int i = 0; i < 4; i++) {
      if (i >= viewPeopleCount) break;
      vec3 axis = viewPeople[i] - viewEye;
      float lengthSquared = dot(axis, axis);
      if (lengthSquared < .04) continue;
      float t = dot(vViewWorld - viewEye, axis) / lengthSquared;
      float radius = mix(.22, .78, clamp(t, 0.0, 1.0));
      if (t > 0.0 && t < 1.0 - .12 / sqrt(lengthSquared) && distance(vViewWorld, viewEye + axis * t) < radius) return true;
    }
  }
  return false;
}
`;

// The opaque and translucent passes share geometry and complementary masks.
// This preserves depth for unblocked furniture, even in meshes batched by material.
export class ViewTransparency {
  constructor(planes) {
    this.planes = planes;
    this.records = new Map();
    this.shared = { viewFollowEnabled: { value: 0 }, viewEye: { value: new THREE.Vector3() }, viewPeople: { value: Array.from({ length: 4 }, () => new THREE.Vector3()) }, viewPeopleCount: { value: 0 } };
    this.floorUniforms = new Map([...planes.keys()].map(floor => [floor, { viewHeight: { value: new THREE.Vector4() }, viewFront: { value: new THREE.Vector4() } }]));
  }

  attach(mesh) {
    if (mesh.userData.viewGhost || !ROLES.has(mesh.userData.role) || this.records.has(mesh)) return;
    const material = mesh.material, wall = mesh.userData.role === 'shell';
    const floor = mesh.userData.floor || material.userData.floor || 'F2';
    const uniforms = { ...this.shared, ...this.floorUniforms.get(floor), viewWallEnabled: { value: 0 } };
    const ghostMaterial = material.clone();
    ghostMaterial.transparent = true;
    ghostMaterial.opacity = Math.min(material.opacity, wall ? VIEW_OPACITY.wall : VIEW_OPACITY.furniture);
    ghostMaterial.depthWrite = false;
    ghostMaterial.side = THREE.FrontSide;
    ghostMaterial.clippingPlanes = [];
    const patch = (target, ghost) => {
      target.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = 'varying vec3 vViewWorld;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvViewWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = fragmentMask + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\nif (' + (ghost ? '!' : '') + 'viewFaded()) discard;');
      };
      target.customProgramCacheKey = () => 'view-transparency-1-' + (ghost ? 'ghost' : 'solid');
      target.needsUpdate = true;
    };
    patch(material, false);patch(ghostMaterial, true);
    const ghost = new THREE.Mesh(mesh.geometry, ghostMaterial);
    ghost.name = mesh.name + '_view_translucent';ghost.userData.viewGhost = true;
    ghost.raycast = () => {};ghost.visible = false;
    mesh.add(ghost);
    this.records.set(mesh, { ghost, uniforms, wall, floor });
  }

  setCut(enabled) {
    this.cutEnabled = enabled;
    for (const record of this.records.values()) record.uniforms.viewWallEnabled.value = enabled && record.wall ? 1 : 0;
  }

  update(eye, people = [], follow = false) {
    this.shared.viewEye.value.copy(eye);
    this.shared.viewFollowEnabled.value = follow ? 1 : 0;
    this.shared.viewPeopleCount.value = Math.min(4, people.length);
    people.slice(0, 4).forEach((p, i) => this.shared.viewPeople.value[i].copy(p));
    for (const [floor, planes] of this.planes) {
      const uniforms = this.floorUniforms.get(floor);
      for (const [i, key] of ['viewHeight', 'viewFront'].entries()) uniforms[key].value.set(planes[i].normal.x, planes[i].normal.y, planes[i].normal.z, planes[i].constant);
    }
    for (const record of this.records.values()) record.ghost.visible = !!(record.wall && this.cutEnabled || follow);
  }

  isFaded(mesh, point) {
    const record = this.records.get(mesh);if (!record) return false;
    if (record.uniforms.viewWallEnabled.value && this.planes.get(record.floor).every(p => p.distanceToPoint(point) < 0)) return true;
    if (!this.shared.viewFollowEnabled.value) return false;
    const eye = this.shared.viewEye.value;
    for (let i = 0; i < this.shared.viewPeopleCount.value; i++) {
      const axis = this.shared.viewPeople.value[i].clone().sub(eye), lengthSquared = axis.lengthSq();
      if (lengthSquared < .04) continue;
      const t = point.clone().sub(eye).dot(axis) / lengthSquared;
      const radius = THREE.MathUtils.lerp(.22, .78, THREE.MathUtils.clamp(t, 0, 1));
      if (t > 0 && t < 1 - .12 / Math.sqrt(lengthSquared) && point.distanceTo(axis.multiplyScalar(t).add(eye)) < radius) return true;
    }
    return false;
  }
}
