import * as THREE from './vendor/three.module.js';

// All positions are in the same world coordinates as the first-floor export.
export function landscapeRegions(d) {
  const b=d.building,w=d.walkWidth,p=d.borderWidth,g=d.driveway;
  const r=(name,x0,x1,z0,z1)=>({name,x0,x1,z0,z1});
  const paving=[
    r('North_Walk',b.minX-w,b.maxX+w,b.minZ-w,b.minZ),
    r('South_Walk',b.minX-w,b.maxX+w,b.maxZ,b.maxZ+w),
    r('West_Walk',b.minX-w,b.minX,b.minZ,b.maxZ),
    r('East_North_Walk',b.maxX,b.maxX+w,b.minZ,g.minZ),
    r('East_South_Walk',b.maxX,b.maxX+w,g.maxZ,b.maxZ),
  ];
  const lawns=[
    r('North_Lawn',b.minX-p,b.maxX+p,b.minZ-p,b.minZ-w),
    r('South_Lawn',b.minX-p,b.maxX+p,b.maxZ+w,b.maxZ+p),
    r('West_Lawn',b.minX-p,b.minX-w,b.minZ-w,b.maxZ+w),
    r('East_North_Lawn',b.maxX+w,b.maxX+p,b.minZ-w,g.minZ),
    r('East_South_Lawn',b.maxX+w,b.maxX+p,g.maxZ,b.maxZ+w),
  ];
  return {paving:paving.filter(r=>r.x1>r.x0&&r.z1>r.z0),lawns:lawns.filter(r=>r.x1>r.x0&&r.z1>r.z0),drive:r('Garage_Driveway',g.startX,b.maxX+g.depth,g.minZ,g.maxZ)};
}

export function createLandscape(d) {
  const group=new THREE.Group();group.name='First_Floor_Landscape';
  const regions=landscapeRegions(d);
  let seed=74137;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const pixels=new Uint8Array(128*128*4);
  for(let i=0;i<pixels.length;i+=4){const n=random();pixels[i]=93+n*30;pixels[i+1]=117+n*34;pixels[i+2]=64+n*25;pixels[i+3]=255;}
  const texture=new THREE.DataTexture(pixels,128,128,THREE.RGBAFormat);
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  const grass=new THREE.MeshStandardMaterial({map:texture,roughness:1});
  const paving=new THREE.MeshStandardMaterial({color:0xbebcae,roughness:.94});
  const drive=new THREE.MeshStandardMaterial({color:0x8e938e,roughness:.96});
  const seam=new THREE.MeshStandardMaterial({color:0x6d776a,roughness:1});
  const tag=mesh=>{mesh.userData={role:'landscape',floor:'F1'};group.add(mesh);return mesh;};
  const slab=(r,top,thickness,material)=>{
    const geometry=new THREE.BoxGeometry(r.x1-r.x0,thickness,r.z1-r.z0);
    geometry.translate((r.x0+r.x1)/2,top-thickness/2,(r.z0+r.z1)/2);
    const pos=geometry.attributes.position,uv=geometry.attributes.uv;
    for(let i=0;i<pos.count;i++)uv.setXY(i,pos.getX(i)/1.2,pos.getZ(i)/1.2);
    const mesh=tag(new THREE.Mesh(geometry,material.clone()));mesh.name=r.name;return mesh;
  };
  for(const r of regions.paving)slab(r,d.surfaceY,.24,paving);
  slab(regions.drive,d.surfaceY,.24,drive);
  for(const r of regions.lawns)slab(r,d.surfaceY-.015,.24,grass);
  // Subtle joints give the broad garage apron scale without painted road markings.
  for(let x=regions.drive.x0+1.25;x<regions.drive.x1;x+=1.25){
    slab({name:'Drive_Expansion_Joint',x0:x-.008,x1:x+.008,z0:regions.drive.z0,z1:regions.drive.z1},d.surfaceY+.001,.002,seam);
  }
  // Small, instanced grass blades keep the lawn editable and inexpensive to draw.
  const blade=new THREE.BufferGeometry();
  blade.setAttribute('position',new THREE.Float32BufferAttribute([-.025,0,0,.025,0,0,.012,.10,.014],3));blade.computeVertexNormals();
  const area=regions.lawns.map(r=>(r.x1-r.x0)*(r.z1-r.z0)),total=area.reduce((a,b)=>a+b,0);
  const count=Math.min(1600,Math.round(total*6));
  const blades=tag(new THREE.InstancedMesh(blade,new THREE.MeshStandardMaterial({color:0x71894e,roughness:1,side:THREE.DoubleSide}),count));blades.name='Lawn_Grass_Blades';
  const transform=new THREE.Object3D();
  for(let i=0;i<count;i++){
    let pick=random()*total,index=0;while(index<area.length-1&&pick>area[index])pick-=area[index++];
    const r=regions.lawns[index];transform.position.set(r.x0+random()*(r.x1-r.x0),d.surfaceY-.014,r.z0+random()*(r.z1-r.z0));transform.rotation.y=random()*Math.PI*2;transform.scale.setScalar(.6+random()*.7);transform.updateMatrix();blades.setMatrixAt(i,transform.matrix);
  }
  blades.instanceMatrix.needsUpdate=true;blades.computeBoundingSphere();
  group.userData={borderWidth:d.borderWidth,drivewayDepth:d.driveway.depth,provisional:true};
  return group;
}
