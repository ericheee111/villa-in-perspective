import * as THREE from './vendor/three.module.js';

const PROFILES = [
  {id:'father',name:'爸爸',floor:'F1',seed:[2.8,4.4],shirt:0x7f9ca6,hair:0x463b32,style:'short',scale:.82},
  {id:'mother',name:'妈妈',floor:'F1',seed:[-3.6,3.7],shirt:0xc79583,hair:0x5b4032,style:'buns',scale:.82},
  {id:'brother',name:'哥哥',floor:'F2',seed:[-7.6,1.2],shirt:0x8ea679,hair:0x403732,style:'short',scale:.78},
  {id:'daughter',name:'妹妹',floor:'F2',seed:[-2.7,2.8],shirt:0xd6b276,hair:0x4c3830,style:'bob',scale:.70},
];

function makeResident(profile) {
  const root=new THREE.Group();root.name='Resident_'+profile.name;root.scale.setScalar(profile.scale);
  const mat=color=>new THREE.MeshStandardMaterial({color,roughness:.83});
  const skin=mat(0xf0c9a6),shirt=mat(profile.shirt),hair=mat(profile.hair),dark=mat(0x343e3d),shoe=mat(0xe8e4d7),eye=mat(0x302d29),pink=mat(0xe3a697);
  const ball=new THREE.SphereGeometry(1,12,8),capsule=new THREE.CapsuleGeometry(.055,.17,3,8);
  const sphere=(parent,position,scale,material)=>{const mesh=new THREE.Mesh(ball,material);mesh.position.set(...position);mesh.scale.set(...scale);parent.add(mesh);return mesh;};
  const body=new THREE.Group();root.add(body);
  sphere(body,[0,.48,0],[.17,.23,.115],shirt);
  sphere(body,[0,.70,0],[.055,.055,.055],skin);
  const head=new THREE.Group();head.position.y=.88;body.add(head);
  sphere(head,[0,0,0],[.225,.225,.213],skin);
  const cap=new THREE.Mesh(new THREE.SphereGeometry(.23,14,9,0,Math.PI*2,0,Math.PI*.52),hair);cap.position.y=.015;head.add(cap);
  const eyes=[];
  for(const side of [-1,1]){
    sphere(head,[side*.222,-.018,0],[.043,.06,.04],skin);
    eyes.push(sphere(head,[side*.076,.004,.197],[.024,.033,.012],eye));
    sphere(head,[side*.083,.015,.207],[.006,.008,.004],shoe);
    sphere(head,[side*.12,-.054,.177],[.034,.018,.012],pink);
    if(profile.style==='buns')sphere(head,[side*.2,.145,-.03],[.085,.082,.082],hair);
    if(profile.style==='bob')sphere(head,[side*.19,-.07,-.045],[.052,.16,.15],hair);
  }
  sphere(head,[0,-.035,.207],[.021,.025,.025],skin);
  const smile=new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.04,-.077,.197),new THREE.Vector3(0,-.113,.212),new THREE.Vector3(.04,-.077,.197));
  head.add(new THREE.Mesh(new THREE.TubeGeometry(smile,8,.006,4,false),eye));
  sphere(head,[-.08,.158,.15],[.13,.075,.08],hair);
  if(profile.id==='father')for(const side of [-1,1]){const rim=new THREE.Mesh(new THREE.TorusGeometry(.05,.006,4,14),dark);rim.position.set(side*.077,.005,.219);head.add(rim);}
  if(profile.id==='daughter')for(const side of [-1,1])sphere(head,[.13+side*.027,.145,.135],[.032,.023,.015],pink);
  const legs=[],arms=[];
  for(const side of [-1,1]){
    const leg=new THREE.Group();leg.position.set(side*.078,.30,0);root.add(leg);
    const limb=new THREE.Mesh(capsule,dark);limb.position.y=-.11;leg.add(limb);
    sphere(leg,[0,-.255,.036],[.064,.043,.096],shoe);legs.push(leg);
    const arm=new THREE.Group();arm.position.set(side*.18,.62,0);body.add(arm);
    const sleeve=new THREE.Mesh(capsule,shirt);sleeve.position.y=-.085;arm.add(sleeve);
    sphere(arm,[0,-.225,0],[.052,.055,.047],skin);arms.push(arm);
  }
  const cup=new THREE.Group();arms[1].add(cup);cup.position.set(0,-.225,.045);
  const mug=new THREE.Mesh(new THREE.CylinderGeometry(.038,.032,.072,10),mat(0xf4e9cf));cup.add(mug);
  const handle=new THREE.Mesh(new THREE.TorusGeometry(.026,.007,4,10),shoe);handle.position.x=.042;cup.add(handle);cup.visible=false;
  const book=new THREE.Mesh(new THREE.BoxGeometry(.16,.018,.115),mat(0x879671));book.position.set(0,.51,.18);body.add(book);book.visible=false;
  const laptop=new THREE.Group();laptop.position.copy(book.position);body.add(laptop);
  laptop.add(new THREE.Mesh(new THREE.BoxGeometry(.19,.014,.12),dark));const screen=new THREE.Mesh(new THREE.BoxGeometry(.19,.115,.012),mat(0x577784));screen.position.set(0,.052,-.05);screen.rotation.x=-.15;laptop.add(screen);laptop.visible=false;
  const bowl=new THREE.Group();bowl.position.set(-.055,.51,.21);body.add(bowl);bowl.add(new THREE.Mesh(new THREE.SphereGeometry(.065,10,6,0,Math.PI*2,Math.PI/2,Math.PI/2),shoe));sphere(bowl,[0,0,0],[.058,.02,.058],mat(0xe8c783));bowl.visible=false;
  const spoon=new THREE.Mesh(new THREE.CapsuleGeometry(.007,.09,2,5),shoe);spoon.position.set(0,-.24,.045);spoon.rotation.x=-.8;arms[1].add(spoon);spoon.visible=false;
  const mop=new THREE.Group();root.add(mop);const stick=new THREE.Mesh(new THREE.CylinderGeometry(.009,.009,.64,6),mat(0x9a8463));stick.position.set(.16,.35,.18);stick.rotation.x=-.15;mop.add(stick);const brush=new THREE.Mesh(new THREE.BoxGeometry(.23,.035,.085),mat(0x8c9b86));brush.position.set(.16,.023,.23);mop.add(brush);mop.visible=false;
  return {root,pose(time,moving,action){
    const phase=time*7.5;body.position.y=moving?Math.abs(Math.sin(phase))*.012:Math.sin(time*1.5)*.002;
    legs[0].rotation.x=moving?Math.sin(phase)*.31:0;legs[1].rotation.x=moving?-Math.sin(phase)*.31:0;
    arms[0].rotation.set(moving?-Math.sin(phase)*.25:0,0,.08);arms[1].rotation.set(moving?Math.sin(phase)*.25:0,0,-.08);
    head.rotation.set(0,moving?0:Math.sin(time*.55)*.2,0);
    cup.visible=!moving&&action==='drink';book.visible=!moving&&action==='read';laptop.visible=!moving&&action==='work';bowl.visible=!moving&&action==='eat';spoon.visible=bowl.visible;mop.visible=!moving&&action==='clean';
    for(const pupil of eyes)pupil.scale.y=action==='sleep'?.006:.033;
    if(cup.visible){arms[1].rotation.x=-1.6+Math.sin(time*1.3)*.18;head.rotation.x=.08;}
    if(book.visible){arms[0].rotation.x=-.9;arms[1].rotation.x=-.9;head.rotation.x=.18;}
    if(laptop.visible){arms[0].rotation.x=-1.1+Math.sin(time*6)*.08;arms[1].rotation.x=-1.1-Math.sin(time*6)*.08;head.rotation.x=.15;}
    if(bowl.visible){arms[0].rotation.x=-1.1;arms[1].rotation.x=-1.2-Math.max(0,Math.sin(time*2))*.65;head.rotation.x=.1;}
    if(mop.visible){mop.position.z=Math.sin(time*2)*.07;arms[1].rotation.x=-.6+Math.sin(time*2)*.15;body.rotation.x=.08;}else body.rotation.x=0;
    if(!moving&&action==='tv')head.rotation.y=Math.sin(time*.3)*.08;
    if(!moving&&action==='chat')arms[1].rotation.z=-1.2+Math.sin(time*3)*.12;
    if(!moving&&action==='stretch'){arms[0].rotation.z=2.3;arms[1].rotation.z=-2.3;head.rotation.x=-.08;}
  }};
}

function segmentDistanceSquared(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return (x-a[0]-t*dx)**2+(z-a[1]-t*dz)**2;}

class MinHeap {
  constructor(){this.data=[];}
  push(item){let i=this.data.length;this.data.push(item);while(i){const parent=(i-1)>>1;if(this.data[parent].score<=item.score)break;this.data[i]=this.data[parent];i=parent;}this.data[i]=item;}
  pop(){const first=this.data[0],last=this.data.pop();if(this.data.length){let i=0;while(i*2+1<this.data.length){let child=i*2+1;if(child+1<this.data.length&&this.data[child+1].score<this.data[child].score)child++;if(this.data[child].score>=last.score)break;this.data[i]=this.data[child];i=child;}this.data[i]=last;}return first;}
}

export class ResidentLife {
  constructor(navigation,devices,{paused=false,seed=1369}={}) {
    this.navigation=navigation;this.devices=devices;this.root=new THREE.Group();this.root.name='Everyday_Residents';this.people=[];this.ready=new Set();this.paused=paused;this.shown=true;this.seed=seed;this.time=0;
  }
  random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
  point(floor,i){const f=this.navigation.floors[floor];return new THREE.Vector3(f.origin[0]+i%f.width*this.navigation.step,f.heights[i]+.005,f.origin[1]+Math.floor(i/f.width)*this.navigation.step);}
  cell(floor,x,z){const f=this.navigation.floors[floor],a=Math.round((x-f.origin[0])/this.navigation.step),b=Math.round((z-f.origin[1])/this.navigation.step);return a>=0&&a<f.width&&b>=0&&b<f.depth?b*f.width+a:-1;}
  doorSegments(floor,overrides=new Map()){
    const shapes=[];
    for(const door of this.devices.doors.values()){
      const d=door.def;if(d.floor!==floor)continue;
      if(d.kind==='hinge'){
        const override=overrides.get(d.id),value=(typeof override==='object'?override.value:override)??door.value,target=(typeof override==='object'?override.target:override)??door.target,n=Math.abs(value-target)>.01?8:0;
        for(let i=0;i<=n;i++){const angle=value+(target-value)*(n?i/n:0),c=Math.cos(angle),s=Math.sin(angle),v=d.initialAxis;const dx=v[0]*c+v[2]*s,dz=-v[0]*s+v[2]*c;shapes.push({a:[d.pivot[0],d.pivot[2]],b:[d.pivot[0]+dx*d.width,d.pivot[2]+dz*d.width]});}
      }else{
        if(!door.residentBounds){const box=new THREE.Box3();for(const mesh of door.pivot.children){mesh.geometry.computeBoundingBox();box.union(mesh.geometry.boundingBox);}door.residentBounds=box;}
        const b=door.residentBounds;shapes.push({a:[d.pivot[0]+b.min.x+Math.min(door.value,door.target),d.pivot[2]],b:[d.pivot[0]+b.max.x+Math.max(door.value,door.target),d.pivot[2]]});
      }
    }
    return shapes;
  }
  blocked(floor,x,z,doors,person=null,people=true){
    const index=this.cell(floor,x,z);if(index<0||this.navigation.floors[floor].heights[index]===null)return true;
    const radius=this.navigation.radius;
    if(doors.some(d=>segmentDistanceSquared(x,z,d.a,d.b)<(radius+.045)**2))return true;
    return people&&this.people.some(p=>p!==person&&p.floor===floor&&(p.position.x-x)**2+(p.position.z-z)**2<(radius*2+.045)**2);
  }
  addFloor(floor){
    if(this.ready.has(floor))return;this.ready.add(floor);
    const f=this.navigation.floors[floor],doors=this.doorSegments(floor);
    for(const profile of PROFILES.filter(p=>p.floor===floor)){
      let cell=-1,best=Infinity;
      for(const i of f.components[0]){const p=this.point(floor,i),score=(p.x-profile.seed[0])**2+(p.z-profile.seed[1])**2;if(score<best&&!this.blocked(floor,p.x,p.z,doors)){cell=i;best=score;}}
      if(cell<0)continue;
      const rig=makeResident(profile),position=this.point(floor,cell);rig.root.position.copy(position);this.root.add(rig.root);
      this.people.push({...profile,rig,cell,position,component:f.components.find(c=>c.includes(cell)),path:[],wait:1+this.random()*3,blockedTime:0,action:'look',phase:this.random()*6,speed:.38+this.random()*.1,yaw:0});
    }
  }
  findPath(person,goal,doors){
    const f=this.navigation.floors[person.floor],start=this.cell(person.floor,person.position.x,person.position.z),size=f.heights.length,step=this.navigation.step;
    if(start<0||goal<0||goal>=size||f.heights[start]===null||f.heights[goal]===null)return [];
    const mask=Uint8Array.from(f.heights,h=>h===null?1:0),radius=this.navigation.radius;
    const mark=(minX,maxX,minZ,maxZ,predicate)=>{const x0=Math.max(0,Math.floor((minX-f.origin[0])/step)),x1=Math.min(f.width-1,Math.ceil((maxX-f.origin[0])/step)),z0=Math.max(0,Math.floor((minZ-f.origin[1])/step)),z1=Math.min(f.depth-1,Math.ceil((maxZ-f.origin[1])/step));for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){const i=z*f.width+x;if(!mask[i]&&predicate(f.origin[0]+x*step,f.origin[1]+z*step))mask[i]=1;}};
    for(const d of doors){const r=radius+.045;mark(Math.min(d.a[0],d.b[0])-r,Math.max(d.a[0],d.b[0])+r,Math.min(d.a[1],d.b[1])-r,Math.max(d.a[1],d.b[1])+r,(x,z)=>segmentDistanceSquared(x,z,d.a,d.b)<r*r);}
    const circle=(p,r)=>mark(p.x-r,p.x+r,p.z-r,p.z+r,(x,z)=>(p.x-x)**2+(p.z-z)**2<r*r);
    for(const p of this.people){if(p===person)continue;if(p.floor===person.floor)circle(p.position,radius*2+.045);if(p.transit?.toFloor===person.floor)circle(this.point(person.floor,p.transit.link.nodes[person.floor]),radius*2+.08);}
    if(mask[goal])return [];
    const open=new MinHeap(),came=new Int32Array(size).fill(-1),cost=new Float32Array(size).fill(Infinity),closed=new Uint8Array(size);cost[start]=0;
    const heuristic=i=>Math.hypot(i%f.width-goal%f.width,Math.floor(i/f.width)-Math.floor(goal/f.width));open.push({index:start,score:heuristic(start)});let count=0;
    while(open.data.length&&count<45000){const current=open.pop().index;if(closed[current])continue;if(current===goal){const path=[];for(let i=goal;i!==start;i=came[i])path.push(i);return path.reverse();}closed[current]=1;count++;const x=current%f.width,z=Math.floor(current/f.width);
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){if(x+dx<0||x+dx>=f.width||z+dz<0||z+dz>=f.depth)continue;const next=current+dx+dz*f.width;if(closed[next]||mask[next]||Math.abs(f.heights[next]-f.heights[current])>.085)continue;if(dx&&dz&&(mask[current+dx]||mask[current+dz*f.width]))continue;const value=cost[current]+Math.hypot(dx,dz);if(value>=cost[next])continue;came[next]=current;cost[next]=value;open.push({index:next,score:value+heuristic(next)});}
    }
    return [];
  }
  setPaused(paused){this.paused=paused;if(paused)for(const p of this.people)p.rig.pose(this.time+p.phase,false,'look');}
  setShown(shown){this.shown=shown;this.root.visible=shown;}
}
