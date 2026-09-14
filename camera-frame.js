import * as THREE from './vendor/three.module.js';

export function fitPeopleView(target, offset, positions, fov, aspect) {
  const direction = offset.clone().normalize(), right = new THREE.Vector3(direction.z, 0, -direction.x).normalize(), up = direction.clone().cross(right);
  const tangent = Math.tan(THREE.MathUtils.degToRad(fov) / 2), width = tangent * Math.max(.1, aspect);
  let distance = offset.length();
  for (const position of positions) {
    const delta = position.clone().sub(target);
    distance = Math.max(distance, delta.dot(direction) + .55 + Math.max((Math.abs(delta.dot(right)) + .5) / width, (Math.abs(delta.dot(up)) + .65) / tangent));
  }
  return direction.multiplyScalar(distance);
}

export function personViewEye(root, target) {
  const ray = new THREE.Raycaster(), offsets = [[2,1.9,3.2],[-2,1.9,3.2],[3.2,1.9,-2],[-3.2,1.9,-2],[0,3.2,3.2]];
  root.updateMatrixWorld(true);let best = null, bestScore = Infinity;
  for (const offset of offsets) {
    const eye = target.clone().add(new THREE.Vector3(...offset));
    let score = 0;
    for (const height of [-.25, .2]) {
      const direction = target.clone().add(new THREE.Vector3(0, height, 0)).sub(eye);ray.set(eye, direction.clone().normalize());ray.far = direction.length() - .2;
      const blockers = new Set();
      for (const hit of ray.intersectObject(root, true)) {
        const mesh = hit.object, material = mesh.material;let visible = true;for (let o = mesh; o; o = o.parent) if (!o.visible) visible = false;
        // Count physical blockers even when the display currently fades them.
        if (visible && material?.colorWrite !== false && material?.opacity > .5) blockers.add(mesh.uuid);
      }
      score += blockers.size;
    }
    if (score < bestScore) { best = eye;bestScore = score; }if (!score) break;
  }
  return best;
}
