import * as THREE from './vendor/three.module.js';

export const VIEW_OPACITY = { wall: .12, furniture: .28 };
const ROLES = new Set(['shell', 'furniture', 'door']);
const fragmentMask = `
varying vec3 vViewWorld;
varying vec3 vViewMin;
varying vec3 vViewMax;
varying float vViewWallLike;
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
      vec3 lo = vViewMin - vec3(.24, .55, .24);
      vec3 hi = vViewMax + vec3(.24, .55, .24);
      float nearT = 0.0;
      float farT = 1.0 - .12 / sqrt(lengthSquared);
      bool intersects = true;
      for (int j = 0; j < 3; j++) {
        if (abs(axis[j]) < .000001) {
          if (viewEye[j] < lo[j] || viewEye[j] > hi[j]) intersects = false;
        } else {
          float a = (lo[j] - viewEye[j]) / axis[j];
          float b = (hi[j] - viewEye[j]) / axis[j];
          nearT = max(nearT, min(a, b));farT = min(farT, max(a, b));
        }
      }
      if (intersects && nearT <= farT && farT > 0.0) return true;
    }
  }
  return false;
}
`;

export function createOcclusionFloor(definition, bytes) {
  if (bytes.byteLength !== definition.bytes) throw new Error('Occlusion data length mismatch');
  const data = new Float32Array(bytes, definition.textureOffset, definition.textureWidth * definition.textureHeight * 4);
  const texture = new THREE.DataTexture(data, definition.textureWidth, definition.textureHeight, THREE.RGBAFormat, THREE.FloatType);texture.needsUpdate = true;
  return { attach(mesh, partIndex) {
    const part = definition.parts[partIndex];if (!part) return;
    if (part.count !== mesh.geometry.getAttribute('position').count) throw new Error('Occlusion vertex count mismatch');
    mesh.geometry.setAttribute('viewComponent', new THREE.BufferAttribute(new Uint16Array(bytes, part.offset, part.count), 1));mesh.userData.viewBoundsTexture = texture;
  } };
}

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
    const componentBounds = !!mesh.userData.viewBoundsTexture;
    mesh.geometry.computeBoundingBox();
    const uniforms = { ...this.shared, ...this.floorUniforms.get(floor), viewWallEnabled: { value: 0 }, viewBoundsTexture: { value: mesh.userData.viewBoundsTexture }, viewFallbackMin: { value: mesh.geometry.boundingBox.min }, viewFallbackMax: { value: mesh.geometry.boundingBox.max } };
    const ghostMaterial = material.clone();
    ghostMaterial.transparent = true;
    ghostMaterial.opacity = Math.min(material.opacity, wall ? VIEW_OPACITY.wall : VIEW_OPACITY.furniture);
    ghostMaterial.depthWrite = false;
    ghostMaterial.side = THREE.FrontSide;
    ghostMaterial.clippingPlanes = [];
    const patch = (target, ghost) => {
      target.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        const attributes = componentBounds ? 'attribute float viewComponent;\nuniform sampler2D viewBoundsTexture;\n' : 'uniform vec3 viewFallbackMin;\nuniform vec3 viewFallbackMax;\n';
        shader.vertexShader = attributes + 'varying vec3 vViewWorld;\nvarying vec3 vViewMin;\nvarying vec3 vViewMax;\nvarying float vViewWallLike;\n' + shader.vertexShader;
        const bounds = componentBounds ? 'int viewTexWidth = textureSize(viewBoundsTexture, 0).x; int viewTexel = int(viewComponent) * 2; vec4 viewLo = texelFetch(viewBoundsTexture, ivec2(viewTexel % viewTexWidth, viewTexel / viewTexWidth), 0); vec3 viewHi = texelFetch(viewBoundsTexture, ivec2((viewTexel + 1) % viewTexWidth, (viewTexel + 1) / viewTexWidth), 0).xyz; vViewWallLike = viewLo.w;' : 'vec4 viewLo = vec4(viewFallbackMin, 0.0); vec3 viewHi = viewFallbackMax; vViewWallLike = 0.0;';
        shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvViewWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\n' + bounds + '\nvec3 viewCenter = (modelMatrix * vec4((viewLo.xyz + viewHi) * .5, 1.0)).xyz; vec3 viewHalf = (viewHi - viewLo.xyz) * .5; vec3 viewExtent = abs(modelMatrix[0].xyz) * viewHalf.x + abs(modelMatrix[1].xyz) * viewHalf.y + abs(modelMatrix[2].xyz) * viewHalf.z; vViewMin = viewCenter - viewExtent; vViewMax = viewCenter + viewExtent;');
        shader.fragmentShader = fragmentMask + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\nif (' + (ghost ? '!' : '') + 'viewFaded()) discard;\n' + (ghost ? 'if (vViewWallLike > .5) diffuseColor.a = min(diffuseColor.a, .12);' : ''));
      };
      target.customProgramCacheKey = () => 'view-transparency-2-' + (ghost ? 'ghost' : 'solid') + (componentBounds ? '-components' : '-bounds');
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

  isFaded(mesh, point, faceIndex = null) {
    const record = this.records.get(mesh);if (!record) return false;
    if (record.uniforms.viewWallEnabled.value && this.planes.get(record.floor).every(p => p.distanceToPoint(point) < 0)) return true;
    if (!this.shared.viewFollowEnabled.value) return false;
    const eye = this.shared.viewEye.value;
    let min = point.clone(), max = point.clone();
    if (faceIndex !== null) {
      const attribute = mesh.geometry.getAttribute('viewComponent');
      if (attribute) {
        const vertex = mesh.geometry.index ? mesh.geometry.index.getX(faceIndex * 3) : faceIndex * 3, offset = attribute.getX(vertex) * 8, data = mesh.userData.viewBoundsTexture.image.data;
        min.fromArray(data, offset);max.fromArray(data, offset + 4);
      } else { min.copy(mesh.geometry.boundingBox.min);max.copy(mesh.geometry.boundingBox.max); }
      const box = new THREE.Box3(min, max).applyMatrix4(mesh.matrixWorld);min = box.min;max = box.max;
    }
    const padding = new THREE.Vector3(.24, .55, .24);min.sub(padding);max.add(padding);
    for (let i = 0; i < this.shared.viewPeopleCount.value; i++) {
      const axis = this.shared.viewPeople.value[i].clone().sub(eye), lengthSquared = axis.lengthSq();
      if (lengthSquared < .04) continue;
      let near = 0, far = 1 - .12 / Math.sqrt(lengthSquared), intersects = true;
      for (const key of ['x', 'y', 'z']) {
        if (Math.abs(axis[key]) < .000001) { if (eye[key] < min[key] || eye[key] > max[key]) intersects = false; }
        else { const a = (min[key] - eye[key]) / axis[key], b = (max[key] - eye[key]) / axis[key];near = Math.max(near, Math.min(a, b));far = Math.min(far, Math.max(a, b)); }
      }
      if (intersects && near <= far && far > 0) return true;
    }
    return false;
  }
}
