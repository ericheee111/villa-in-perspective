import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

const $=id=>document.getElementById(id), stage=$('stage');
const floorInfo={F1:{name:'一层',subtitle:'01 / 日常与会客',level:0,defaultRoom:'living',center:[-2,0,3.5],span:22},F2:{name:'二层',subtitle:'02 / 休息与私密',level:3.06,defaultRoom:'master',center:[-2,3.06,3.5],span:20},B1:{name:'负一层',subtitle:'03 / 休闲与留宿',level:-3.06,defaultRoom:'tea',center:[-1,-3.06,3.5],span:28}};
const state={floor:'F1',room:null,mode:'3d',cut:true,night:false,inside:false,loading:false};
let manifest,rooms,renderer,scene,camera,controls,ortho,activeCamera,ambient,sun,fill,activeGroup,transition=null,disposed=false;
const floorCache=new Map(), pendingFloors=new Map(), textureCache=new Map(), pendingTextures=new Map(), labels=[];let loadToken=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const vec=a=>new THREE.Vector3(...a);
const clock=new THREE.Clock();

function pressed(ids,selected){ids.forEach(id=>$(id).setAttribute('aria-pressed',String(id===selected)));}
function loading(message,progress=0){$('loader').hidden=false;$('load-text').textContent=message;$('progress').value=progress;}
function failure(error){console.error(error);$('loader').hidden=false;$('load-text').textContent='模型暂时无法载入，请检查连接后重试。';$('retry').hidden=false;state.loading=false;}
async function json(url){const r=await fetch(url);if(!r.ok)throw new Error(`${url}: ${r.status}`);return r.json();}

function initRenderer(){
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;renderer.localClippingEnabled=true;stage.prepend(renderer.domElement);
 scene=new THREE.Scene();scene.background=new THREE.Color('#e9eee3');camera=new THREE.PerspectiveCamera(42,1,.03,250);ortho=new THREE.OrthographicCamera(-15,15,10,-10,.03,250);activeCamera=camera;
 controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.085;controls.minDistance=.4;controls.maxDistance=75;controls.maxPolarAngle=Math.PI*.49;controls.screenSpacePanning=true;
 controls.addEventListener('start',()=>{transition=null;renderer.setPixelRatio(Math.min(devicePixelRatio,1));});controls.addEventListener('end',()=>renderer.setPixelRatio(Math.min(devicePixelRatio,1.6)));
 ambient=new THREE.HemisphereLight(0xffffff,0x9a9f87,2.35);scene.add(ambient);sun=new THREE.DirectionalLight(0xfff0d7,3.1);sun.position.set(-12,28,16);scene.add(sun);fill=new THREE.DirectionalLight(0xe9f3ff,1.1);fill.position.set(14,8,-12);scene.add(fill);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(180,180),new THREE.MeshLambertMaterial({color:0xe6eadf}));ground.rotation.x=-Math.PI/2;ground.position.y=-3.3;ground.name='ground';scene.add(ground);
 new ResizeObserver(resize).observe(stage);resize();
 renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();loading('图形显示已暂停，请重新载入。');$('retry').hidden=false;});
 renderer.domElement.addEventListener('webglcontextrestored',()=>location.reload());
 animate();
}
function resize(){if(!renderer)return;const w=stage.clientWidth,h=stage.clientHeight;if(w<1||h<1)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();setOrtho();}
function setOrtho(){if(!ortho)return;const aspect=Math.max(.3,stage.clientWidth/Math.max(1,stage.clientHeight));const half=floorInfo[state.floor].span/2;ortho.left=-half;ortho.right=half;ortho.top=half/aspect;ortho.bottom=-half/aspect;ortho.updateProjectionMatrix();}
async function loadTexture(file){
 if(textureCache.has(file))return textureCache.get(file);
 if(pendingTextures.has(file))return pendingTextures.get(file);
 const promise=new THREE.TextureLoader().loadAsync('model/'+file).then(tex=>{tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.flipY=true;tex.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());textureCache.set(file,tex);return tex;});
 pendingTextures.set(file,promise);try{return await promise;}finally{pendingTextures.delete(file);}
}
function material(def,role,floor){
 const map=def.texture?textureCache.get(def.texture):null;
 const m=new THREE.MeshStandardMaterial({color:new THREE.Color(...def.color),roughness:def.roughness,metalness:def.metalness,map,side:THREE.DoubleSide,transparent:def.opacity<.95,opacity:def.opacity,alphaTest:map ? .02 : 0});
 m.userData={role,floor};return m;
}
async function loadFloor(floor){
 if(floorCache.has(floor))return floorCache.get(floor);
 if(pendingFloors.has(floor))return pendingFloors.get(floor);
 const promise=buildFloor(floor);pendingFloors.set(floor,promise);
 try{return await promise;}finally{pendingFloors.delete(floor);}
}
async function buildFloor(floor){
 const def=manifest.floors[floor];loading(`正在加载${floorInfo[floor].name}…`,5);
 const response=await fetch('model/'+def.file);if(!response.ok)throw new Error('Model HTTP '+response.status);
 const reader=response.body.getReader(),chunks=[];let received=0;
 while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);received+=value.length;if(state.floor===floor)$('progress').value=Math.min(80,received/def.compressedBytes*80);}
 if(state.floor===floor)loading('正在展开家具与材质…',85);
 const compressed=new Blob(chunks);const bytes=await new Response(compressed.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();if(bytes.byteLength!==def.bytes)throw new Error('Model byte length mismatch');
 await Promise.all([...new Set(def.parts.map(p=>manifest.materials[p.material].texture).filter(Boolean))].map(loadTexture));
 const group=new THREE.Group();group.name=floor;
 for(const part of def.parts){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(bytes,part.offsets[0],part.count*3),3));geometry.setAttribute('normal',new THREE.BufferAttribute(new Int8Array(bytes,part.offsets[1],part.count*3),3,true));geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(bytes,part.offsets[2],part.count*2),2));if(part.indexCount)geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(bytes,part.offsets[3],part.indexCount),1));geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,material(manifest.materials[part.material],part.role,floor));mesh.userData.role=part.role;mesh.name=manifest.materials[part.material].name;group.add(mesh);}
 const bounds=new THREE.Box3().setFromObject(group);const size=bounds.getSize(new THREE.Vector3());const center=bounds.getCenter(new THREE.Vector3());floorInfo[floor].center=[center.x,floorInfo[floor].level,center.z];floorInfo[floor].span=Math.max(size.x,size.z*1.5)*1.08;
 floorCache.set(floor,group);return group;
}
async function changeFloor(floor){
 if(!renderer||!rooms)return;
 const token=++loadToken;state.floor=floor;state.room=null;state.inside=false;state.loading=true;$('retry').hidden=true;
 document.querySelectorAll('[data-floor]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.floor===floor)));$('floor-title').textContent=floorInfo[floor].name;$('chapter').textContent=floorInfo[floor].subtitle;
 if(activeGroup){scene.remove(activeGroup);activeGroup=null;}buildRooms();updateDetails();
 try{const group=await loadFloor(floor);if(token!==loadToken)return;activeGroup=group;scene.add(group);applyCut();buildLabels();resetView(true);$('loader').hidden=true;state.loading=false;updateMode();}catch(e){if(token===loadToken)failure(e);}
}
function currentRoom(){return rooms.find(r=>r.id===(state.room||floorInfo[state.floor].defaultRoom));}
function buildRooms(){
 const strip=$('room-strip');strip.replaceChildren();const all=document.createElement('button');all.textContent='本层全貌';all.dataset.room='';all.setAttribute('aria-pressed','true');all.onclick=()=>selectRoom(null);strip.append(all);
 rooms.filter(r=>r.floor===state.floor&&!['movie','entry','vanity','relation'].includes(r.id)).forEach(r=>{const b=document.createElement('button');b.textContent=r.title;b.dataset.room=r.id;b.setAttribute('aria-pressed','false');b.onclick=()=>selectRoom(r.id);strip.append(b);});
}
function selectRoom(id){state.room=id;state.inside=false;document.querySelectorAll('[data-room]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.room===(id||''))));updateDetails();applyCut();if(!id)resetView();else roomView(false);updateLabels();updateMode();}
function updateDetails(){
 const room=currentRoom(),selected=!!state.room;$('room-title').textContent=selected?room.title:floorInfo[state.floor].name+'的全貌';$('room-description').textContent=selected?room.description:({F1:'从入户到会客、餐叙与日常起居，把每个空间的关系连起来。',F2:'睡眠、阅读与独处，让私密生活拥有自己的节奏。',B1:'茶叙、桌球、棋牌与观影，为相聚留出更多可能。'})[state.floor];$('inside').innerHTML='走进'+(selected?room.title:room.title)+' <span>↗</span>';$('room-index').textContent=String(rooms.indexOf(room)+1).padStart(2,'0');
 const image=room.image;$('open-render').hidden=!image;$('image-note').textContent=image?`${room.title} · v35 最新设计渲染`:'此空间暂无 v35 独立效果图，可查看最新三维模型。';if(image){$('reference-image').src=image;$('reference-image').alt=room.title+' v35 设计效果';$('large-render').src=image;$('large-render').alt=room.title+' v35 设计效果';}
 $('large-render').hidden=!image;$('render-empty').hidden=!!image;$('render-caption').textContent=image?`${room.title} / v35 · 原始 Cycles 渲染`:'';
}
function buildLabels(){labels.length=0;$('room-labels').replaceChildren();rooms.filter(r=>r.floor===state.floor&&!['entry','relation','desk','vanity','movie'].includes(r.id)).forEach(r=>{const cam=manifest.cameras[r.camera];if(!cam)return;const b=document.createElement('button');b.className='label';b.textContent=r.title;b.onclick=()=>selectRoom(r.id);$('room-labels').append(b);labels.push({button:b,room:r,position:vec([cam.target[0],floorInfo[state.floor].level+.2,cam.target[2]])});});}
function updateLabels(){if(!activeCamera)return;const w=stage.clientWidth,h=stage.clientHeight;for(const l of labels){const point=l.position.clone().project(activeCamera);l.button.hidden=!$('labels').checked||state.inside||point.z>1||point.z< -1||Math.abs(point.x)>1||Math.abs(point.y)>1;l.button.style.left=(point.x*.5+.5)*w+'px';l.button.style.top=(-point.y*.5+.5)*h+'px';l.button.classList.toggle('selected',l.room.id===state.room);}}
function applyCut(){if(!activeGroup)return;const floor=floorInfo[state.floor].level;for(const mesh of activeGroup.children){mesh.visible=mesh.userData.role!=='ceiling'||(state.inside&&!state.cut);mesh.material.clippingPlanes=state.cut&&mesh.userData.role==='shell'?[new THREE.Plane(new THREE.Vector3(0,-1,0),floor+1.05)]:[];mesh.material.needsUpdate=true;}}
function moveTo(position,target,instant=false){if(reduced||instant){camera.position.copy(position);controls.target.copy(target);controls.update();transition=null;}else transition={p:camera.position.clone(),t:controls.target.clone(),endP:position,endT:target,start:performance.now()};}
function resetView(instant=false){if(!renderer||!rooms)return;state.inside=false;state.room=null;state.cut=true;pressed(['cut','solid'],'cut');document.querySelectorAll('[data-room]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.room==='')));updateDetails();const f=floorInfo[state.floor],target=vec(f.center);const scale=Math.max(1,1.1/Math.max(.4,camera.aspect));moveTo(target.clone().add(vec([f.span*.24,f.span*.88*scale,f.span*.75*scale])),target,instant);camera.fov=42;camera.updateProjectionMatrix();ortho.position.copy(target.clone().add(vec([0,40,.0001])));ortho.up.set(0,0,-1);ortho.lookAt(target);ortho.zoom=1;if(activeCamera===ortho){controls.target.copy(target);transition=null;}setOrtho();applyCut();$('view-name').textContent='本层全貌 · '+(state.mode==='plan'?'平面布局':'轴测视角');}
function roomView(inside){const room=currentRoom(),cam=manifest.cameras[room.camera];if(!cam)return;state.inside=inside;if(inside){state.cut=false;pressed(['cut','solid'],'solid');camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov)/2)/(16/9)));moveTo(vec(cam.position),vec(cam.target));}else{const target=vec([cam.target[0],floorInfo[state.floor].level+.4,cam.target[2]]);camera.fov=42;moveTo(target.clone().add(vec([3.4,6.2,5.4])),target);}camera.updateProjectionMatrix();applyCut();$('view-name').textContent=room.title+' · '+(inside?'室内视角':'空间定位');}
function updateMode(){if(!renderer||!rooms)return;document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode)));const render=state.mode==='render';stage.hidden=render;$('render-view').hidden=!render;if(render)return;activeCamera=state.mode==='plan'?ortho:camera;controls.object=activeCamera;controls.enableRotate=state.mode==='3d';if(state.mode==='plan'){state.inside=false;state.cut=true;pressed(['cut','solid'],'cut');const target=vec(floorInfo[state.floor].center);ortho.position.copy(target.clone().add(vec([0,40,.0001])));ortho.up.set(0,0,-1);controls.target.copy(target);ortho.lookAt(target);setOrtho();applyCut();$('view-name').textContent='本层全貌 · 正上方布局';}else if(!state.inside){if(state.room)roomView(false);else resetView();}resize();}
function animate(){if(disposed)return;requestAnimationFrame(animate);clock.getDelta();if(stage.hidden)return;if(transition&&activeCamera===camera){const t=Math.min(1,(performance.now()-transition.start)/850),ease=t*t*(3-2*t);camera.position.lerpVectors(transition.p,transition.endP,ease);controls.target.lerpVectors(transition.t,transition.endT,ease);if(t===1)transition=null;}controls.update();updateLabels();renderer.render(scene,activeCamera);}
function light(night){if(!renderer)return;state.night=night;pressed(['day','night'],night?'night':'day');scene.background.set(night?'#27382f':'#e9eee3');ambient.intensity=night?.95:2.35;sun.intensity=night?1.4:3.1;sun.color.set(night?0xffc58d:0xfff0d7);fill.intensity=night?.32:1.1;renderer.toneMappingExposure=night?1:1.3;}
function zoom(factor){if(!activeCamera)return;if(activeCamera.isOrthographicCamera){activeCamera.zoom=Math.max(.3,Math.min(8,activeCamera.zoom/factor));activeCamera.updateProjectionMatrix();}else{camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);}transition=null;controls.update();}

document.querySelectorAll('[data-floor]').forEach(b=>b.onclick=()=>changeFloor(b.dataset.floor));document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{state.mode=b.dataset.mode;updateMode();});$('inside').onclick=()=>{if(!rooms)return;state.room=currentRoom().id;state.mode='3d';updateDetails();updateMode();roomView(true);};$('open-render').onclick=()=>{state.mode='render';updateMode();};$('reset').onclick=()=>resetView();$('zoom-in').onclick=()=>zoom(.82);$('zoom-out').onclick=()=>zoom(1.22);$('cut').onclick=()=>{state.cut=true;pressed(['cut','solid'],'cut');applyCut();};$('solid').onclick=()=>{state.cut=false;pressed(['cut','solid'],'solid');applyCut();};$('day').onclick=()=>light(false);$('night').onclick=()=>light(true);$('labels').onchange=updateLabels;$('full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.querySelector('.workspace').requestFullscreen();}catch{$('view-name').textContent='此浏览器暂不支持全屏';}};$('retry').onclick=()=>{if(!renderer)location.reload();else changeFloor(state.floor);};stage.addEventListener('keydown',e=>{if(e.key==='+')zoom(.85);if(e.key==='-')zoom(1.18);if(e.key==='Home')resetView();});
try{[manifest,rooms]=await Promise.all([json('model/manifest.json'),json('rooms.json')]);initRenderer();await changeFloor('F1');}catch(e){failure(e);}
