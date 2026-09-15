import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { HouseInteractions, isTap } from './interactions.js?v=1';
import { ViewCutaway, addLandingConnector, createExterior, createStairRoute } from './house-view.js?v=transparency-3';
import { createLandscape } from './landscape.js?v=1';
import { FurnitureLife, HouseAppliances } from './furniture-life.js?v=1';
import { HouseTour } from './house-tour.js?v=1';
import { createOcclusionFloor } from './view-transparency.js?v=3';
import { initInterface } from './interface.js?v=audit-3';
import { fitPeopleView, personViewEye } from './camera-frame.js?v=2';

const $=id=>document.getElementById(id), stage=$('stage');
const ui=initInterface();
const floorInfo={ALL:{name:'三层总览',subtitle:'00 / 一个完整的家',level:0,defaultRoom:'living',center:[-.8,1.5,3.5],span:34},F1:{name:'一层',subtitle:'01 / 日常与会客',level:0,defaultRoom:'living',center:[-2,0,3.5],span:22},F2:{name:'二层',subtitle:'02 / 休息与私密',level:3.06,defaultRoom:'master',center:[-2,3.06,3.5],span:20},B1:{name:'负一层',subtitle:'03 / 休闲与留宿',level:-3.06,defaultRoom:'tea',center:[-1,-3.06,3.5],span:28}};
const state={floor:'ALL',room:null,mode:'3d',cut:true,night:false,inside:false,loading:false,overviewFocus:'all'};
let manifest,rooms,renderer,scene,camera,controls,ortho,activeCamera,ambient,sun,fill,activeGroup,transition=null,disposed=false;
let devices,family,tour,appliances;const familyElements=new Map();let familyUiTime=0,tourViewState=null,activityRequest=null;
let overviewDefinition,exterior,stairRoute,occlusionDefinition;
const cutaway=new ViewCutaway();
const floorCache=new Map(), pendingFloors=new Map(), textureCache=new Map(), pendingTextures=new Map(), labels=[];let loadToken=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const vec=a=>new THREE.Vector3(...a);
const clock=new THREE.Clock();
busyControls(true);

function pressed(ids,selected){ids.forEach(id=>$(id).setAttribute('aria-pressed',String(id===selected)));}
function busyControls(busy){document.querySelectorAll('nav button,[data-floor],#room-strip button,#inside,#exterior-view,#reset,#zoom-in,#zoom-out,#full,#tour-start').forEach(b=>b.disabled=busy);}
function loading(message,progress=0){$('loader').hidden=false;$('loader').dataset.state='loading';$('loader').setAttribute('role','status');document.querySelector('.loader-mark').textContent='空间，正在展开';$('load-text').textContent=message;$('progress').hidden=false;$('progress').value=progress;busyControls(true);}
function failure(error){console.error(error);$('loader').hidden=false;$('loader').dataset.state='error';$('loader').setAttribute('role','alert');document.querySelector('.loader-mark').textContent='暂时无法打开空间';$('load-text').textContent='模型未能加载。请检查连接，再重新加载。';$('progress').hidden=true;$('retry').hidden=false;state.loading=true;busyControls(true);}
async function json(url){const r=await fetch(url);if(!r.ok)throw new Error(`${url}: ${r.status}`);return r.json();}

function initRenderer(){
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;renderer.localClippingEnabled=true;stage.prepend(renderer.domElement);
 scene=new THREE.Scene();scene.add(family.root,tour.root);scene.background=new THREE.Color('#e9eee3');camera=new THREE.PerspectiveCamera(42,1,.03,250);ortho=new THREE.OrthographicCamera(-15,15,10,-10,.03,250);activeCamera=camera;
 controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.085;controls.minDistance=.4;controls.maxDistance=75;controls.maxPolarAngle=Math.PI*.49;controls.screenSpacePanning=true;
 controls.addEventListener('start',()=>{transition=null;if(tour.active)$('tour-follow').checked=false;renderer.setPixelRatio(Math.min(devicePixelRatio,1));});controls.addEventListener('end',()=>renderer.setPixelRatio(Math.min(devicePixelRatio,1.6)));
 ambient=new THREE.HemisphereLight(0xffffff,0x9a9f87,2.35);scene.add(ambient);sun=new THREE.DirectionalLight(0xfff0d7,3.1);sun.position.set(-12,28,16);scene.add(sun);fill=new THREE.DirectionalLight(0xe9f3ff,1.1);fill.position.set(14,8,-12);scene.add(fill);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(180,180),new THREE.MeshLambertMaterial({color:0xe6eadf}));ground.rotation.x=-Math.PI/2;ground.position.y=-3.3;ground.name='ground';scene.add(ground);
 new ResizeObserver(resize).observe(stage);resize();
 renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();loading('图形显示已暂停，请重新载入。');$('retry').hidden=false;});
 renderer.domElement.addEventListener('webglcontextrestored',()=>location.reload());
 bindModelInteractions();
 animate();
}
function resize(){if(!renderer)return;const w=stage.clientWidth,h=stage.clientHeight;if(w<1||h<1)return;const aspect=w/h,previous=camera.aspect;renderer.setSize(w,h,false);camera.aspect=aspect;if(!state.loading&&!tour?.active&&Math.abs(previous-aspect)>.01){const scale=Math.min(1,previous)/Math.min(1,aspect);camera.position.sub(controls.target).multiplyScalar(scale).add(controls.target);if(transition)transition.endP.sub(transition.endT).multiplyScalar(scale).add(transition.endT);}camera.updateProjectionMatrix();setOrtho();revealRoom();}
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
 const def=manifest.floors[floor];if(state.floor===floor||state.floor==='ALL')loading(`正在加载${floorInfo[floor].name}…`,5);
 const response=await fetch('model/'+def.file);if(!response.ok)throw new Error('Model HTTP '+response.status);
 const reader=response.body.getReader(),chunks=[];let received=0;
 while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);received+=value.length;if(state.floor===floor||state.floor==='ALL')$('progress').value=Math.min(80,received/def.compressedBytes*80);}
 if(state.floor===floor||state.floor==='ALL')loading('正在展开家具与材质…',85);
 const compressed=new Blob(chunks);const bytes=await new Response(compressed.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();if(bytes.byteLength!==def.bytes)throw new Error('Model byte length mismatch');
 await Promise.all([...new Set(def.parts.map(p=>manifest.materials[p.material].texture).filter(Boolean))].map(loadTexture));
 const occlusionDef=occlusionDefinition.floors[floor];if(occlusionDef.geometryFile!==def.file)throw new Error('Occlusion geometry mismatch');const occlusionResponse=await fetch('model/'+occlusionDef.file);if(!occlusionResponse.ok)throw new Error('Occlusion HTTP '+occlusionResponse.status);const occlusion=createOcclusionFloor(occlusionDef,await new Response(occlusionResponse.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
 const group=new THREE.Group();group.name=floor;devices.prepareFloor(floor,group);
 for(const [partIndex,part] of def.parts.entries()){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(bytes,part.offsets[0],part.count*3),3));geometry.setAttribute('normal',new THREE.BufferAttribute(new Int8Array(bytes,part.offsets[1],part.count*3),3,true));geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(bytes,part.offsets[2],part.count*2),2));if(part.indexCount)geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(bytes,part.offsets[3],part.indexCount),1));geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,material(manifest.materials[part.material],part.role,floor));mesh.userData.role=part.role;mesh.name=manifest.materials[part.material].name;occlusion.attach(mesh,partIndex);if(part.interaction)devices.attachDoorMesh(part.interaction,mesh);else group.add(mesh);}
 if(floor==='F1')group.add(createLandscape(overviewDefinition.landscape));
 const bounds=new THREE.Box3().setFromObject(group);const size=bounds.getSize(new THREE.Vector3());const center=bounds.getCenter(new THREE.Vector3());floorInfo[floor].center=[center.x,floorInfo[floor].level,center.z];floorInfo[floor].span=Math.max(size.x,size.z*1.5)*1.08;
 devices.buildLights(floor,group);if(floor==='F2')addLandingConnector(group,overviewDefinition);appliances.addFloor(floor,group);floorCache.set(floor,group);family.addFloor(floor);tour.addFloor(floor);buildFamilyControls();return group;
}
async function changeFloor(floor){
 if(!renderer||!rooms)return;
 const token=++loadToken;if(floor==='ALL')state.mode='3d';state.floor=floor;state.room=null;state.inside=false;state.loading=true;state.overviewFocus='all';$('retry').hidden=true;
 document.querySelectorAll('[data-floor]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.floor===floor)));$('floor-title').textContent=floorInfo[floor].name;$('chapter').textContent=floorInfo[floor].subtitle;
 if(activeGroup){scene.remove(activeGroup);activeGroup=null;}buildRooms();updateDetails();
 try{
  let group;
  if(floor==='ALL'){
   const layers=[];
   for(const name of ['F1','F2','B1']){layers.push(await loadFloor(name));if(token!==loadToken)return;}
   group=new THREE.Group();group.name='Three_Floors_Aligned';for(const layer of layers)group.add(layer);
   exterior??=createExterior(overviewDefinition);stairRoute??=createStairRoute(overviewDefinition);group.add(exterior,stairRoute);stairRoute.visible=false;
  }else group=await loadFloor(floor);
  if(token!==loadToken)return;activeGroup=group;scene.add(group);applyCut();buildLabels();resetView(true);$('loader').hidden=true;state.loading=false;busyControls(false);updateMode();buildDeviceControls();
 }catch(e){if(token===loadToken)failure(e);}
}
function currentRoom(){return rooms.find(r=>r.id===(state.room||floorInfo[state.floor].defaultRoom));}
function buildRooms(){
 const strip=$('room-strip');strip.replaceChildren();const all=document.createElement('button');all.textContent='本层全貌';all.dataset.room='';all.setAttribute('aria-pressed','true');all.onclick=()=>selectRoom(null);strip.append(all);
 if(state.floor==='ALL'){all.textContent='三层原位总览';all.dataset.overview='all';all.onclick=()=>resetView();for(const [name,action] of [['楼梯连通',focusStairs],['查看外观',showExterior]]){const b=document.createElement('button');b.textContent=name;b.dataset.overview=action===focusStairs?'stairs':'exterior';b.setAttribute('aria-pressed','false');b.onclick=action;strip.append(b);}return;}
 rooms.filter(r=>r.floor===state.floor&&!['movie','entry','vanity','relation'].includes(r.id)).forEach(r=>{const b=document.createElement('button');b.textContent=r.title;b.dataset.room=r.id;b.setAttribute('aria-pressed','false');b.onclick=()=>selectRoom(r.id);strip.append(b);});
}
function syncRoomSelection(){
 document.querySelectorAll('[data-room]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.room===(state.room||''))));
 document.body.classList.toggle('room-selected',!!state.room);
 ui.roomState(!!state.room);
 revealRoom();
}
function revealRoom(){requestAnimationFrame(()=>{const strip=$('room-strip'),button=strip.querySelector('button[aria-pressed="true"]');if(button&&strip.scrollWidth>strip.clientWidth)button.scrollIntoView({block:'nearest',inline:'nearest'});});}
function selectRoom(id){if(state.loading)return;state.room=id;state.inside=false;syncRoomSelection();updateDetails();updateMode();updateLabels();}
function updateDetails(){
 syncRoomSelection();
 const room=currentRoom(),selected=!!state.room;$('room-title').textContent=selected?room.title:floorInfo[state.floor].name+'的全貌';$('room-description').textContent=selected?room.description:({F1:'从入户到会客、餐叙与日常起居，把每个空间的关系连起来。',F2:'睡眠、阅读与独处，让私密生活拥有自己的节奏。',B1:'茶叙、桌球、棋牌与观影，为相聚留出更多可能。'})[state.floor];$('inside').innerHTML='走进'+(selected?room.title:room.title)+' <span>↗</span>';$('room-index').textContent=String(rooms.indexOf(room)+1).padStart(2,'0');
 const image=room.image;$('open-render').hidden=!image;$('image-note').textContent=image?`${room.title} · v35 最新设计渲染`:'此空间暂无 v35 独立效果图，可查看最新三维模型。';if(image){$('reference-image').src=image;$('reference-image').alt=room.title+' v35 设计效果';}
 ui.renderImage(image,room.title+' v35 设计效果');$('render-empty').hidden=!!image;$('render-caption').textContent=image?`${room.title} / v35 · 原始 Cycles 渲染`:'';
 const overview=state.floor==='ALL';document.querySelector('.reference').hidden=overview;$('overview-actions').hidden=!overview;$('inside').disabled=state.loading;
 if(overview){$('room-title').textContent='三层，连成一个家';$('room-description').textContent='负一层、一层和二层按原标高组合，楼梯连续衔接。转动模型时，近侧墙体自动退让，远侧墙体保留完整。';$('inside').innerHTML='查看楼梯连通 <span>↗</span>';$('room-index').textContent='B1–02';$('large-render').hidden=true;$('render-empty').hidden=false;$('render-empty').textContent='三层总览请查看三维空间。外观为临时方案，收到实景照片后更新。';$('render-caption').textContent='';}
 else $('render-empty').textContent='该空间暂无 v35 独立效果图，可在三维空间查看最新布局。';
 buildDeviceControls();
}
function buildLabels(){
 labels.length=0;$('room-labels').replaceChildren();
 if(state.floor==='ALL'){for(const floor of ['F2','F1','B1']){const wrap=document.createElement('div');wrap.className='label-wrap floor-label';const b=document.createElement('button');b.className='room-target';b.textContent=floorInfo[floor].name+' ↗';b.onclick=()=>changeFloor(floor);wrap.append(b);$('room-labels').append(wrap);labels.push({button:wrap,roomButton:b,room:{id:floor},position:vec([13.6,floorInfo[floor].level+1.2,5.6])});}return;}
 rooms.filter(r=>r.floor===state.floor&&!['entry','relation','desk','vanity','movie'].includes(r.id)).forEach(r=>{
  const cam=manifest.cameras[r.camera];if(!cam)return;
  const wrap=document.createElement('div');wrap.className='label-wrap';
  const b=document.createElement('button');b.className='room-target';b.textContent=r.title;b.onclick=()=>selectRoom(r.id);wrap.append(b);
  const circuit=devices.lights.get('light-'+r.id);let toggle=null;
  if(circuit){toggle=document.createElement('button');toggle.className='light-target';toggle.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 17h8M9 21h6M8 14c-5-5-1-11 4-11s9 6 4 11l-1 3H9Z"/></svg>';toggle.onclick=()=>devices.toggleLight(circuit.def.id);wrap.append(toggle);}
  $('room-labels').append(wrap);labels.push({button:wrap,roomButton:b,lightButton:toggle,room:r,position:vec([cam.target[0],floorInfo[state.floor].level+.2,cam.target[2]])});
 });syncDeviceButtons();
}
function updateLabels(){if(!activeCamera)return;const w=stage.clientWidth,h=stage.clientHeight;for(const l of labels){const point=l.position.clone().project(activeCamera);l.button.hidden=!$('labels').checked||state.inside||tour?.active||!!state.room&&l.room.id!==state.room||point.z>1||point.z< -1||Math.abs(point.x)>1||Math.abs(point.y)>1;l.button.style.left=(point.x*.5+.5)*w+'px';l.button.style.top=(-point.y*.5+.5)*h+'px';l.roomButton.classList.toggle('selected',l.room.id===state.room);}}
function applyCut(){if(!activeGroup)return;document.querySelectorAll('[data-overview]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.overview===state.overviewFocus)));cutaway.apply(activeGroup,{enabled:state.cut,inside:state.inside,overview:state.floor==='ALL'});if(stairRoute)stairRoute.visible=state.floor==='ALL'&&state.overviewFocus==='stairs'&&state.cut;updateCutDirection();scene.getObjectByName('ground').position.y=state.floor==='ALL'&&!state.cut?-.22:-3.3;}
function updateCutDirection(){
 if(!activeCamera)return;
 cutaway.update(activeCamera.position,controls.target,state.mode==='plan');
 const owner=tour?.active?tour:family;
 const people=owner?.shown?owner.people.filter(p=>state.floor==='ALL'||p.floor===state.floor&&!p.transit).map(p=>p.position.clone().add(vec([0,p.action==='sleep'?.25:.52,0]))):[];
 cutaway.transparency.updateForCamera(activeCamera,controls.target,people);
}
function resetOverview(instant=false){
 state.inside=false;state.room=null;state.cut=true;state.overviewFocus='all';pressed(['cut','solid'],'cut');if(stairRoute)stairRoute.visible=false;
 camera.fov=42;camera.updateProjectionMatrix();const target=vec(floorInfo.ALL.center),scale=Math.max(1,1.1/Math.max(.4,camera.aspect));
 moveTo(target.clone().add(vec([-25,13.4,25]).multiplyScalar(scale)),target,instant);updateDetails();applyCut();$('view-name').textContent='三层原位总览 · 随视角剖切';
}
function focusStairs(){
 if(state.loading||state.floor!=='ALL')return;state.mode='3d';activeCamera=camera;controls.object=camera;controls.enableRotate=true;state.inside=false;state.cut=true;state.overviewFocus='stairs';pressed(['cut','solid'],'cut');
 document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode==='3d')));stage.hidden=false;$('render-view').hidden=true;
 stairRoute.visible=true;camera.fov=42;camera.updateProjectionMatrix();const target=vec([-2.05,1.3,1.5]);const scale=Math.max(1,.85/Math.max(.4,camera.aspect));moveTo(target.clone().add(vec([-6.5,5.5,10.5]).multiplyScalar(scale)),target);applyCut();resize();
 $('view-name').textContent='楼梯连通 · 负一层 → 一层 → 二层';$('device-status').textContent='金色线标出楼梯路径，二层平台已补充衔接板。';
}
function showExterior(){
 if(state.loading||state.floor!=='ALL')return;state.mode='3d';activeCamera=camera;controls.object=camera;controls.enableRotate=true;state.inside=false;state.cut=false;state.overviewFocus='exterior';pressed(['cut','solid'],'solid');
 document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode==='3d')));stage.hidden=false;$('render-view').hidden=true;stairRoute.visible=false;
 camera.fov=42;camera.updateProjectionMatrix();const target=vec([-.8,2.7,3.5]),scale=Math.max(1,1.1/Math.max(.4,camera.aspect));moveTo(target.clone().add(vec([-30,14,30]).multiplyScalar(scale)),target);applyCut();resize();$('view-name').textContent='外观临时方案 · 待实景照片更新';
}
$('exterior-view').onclick=showExterior;
function moveTo(position,target,instant=false){if(reduced||instant){camera.position.copy(position);controls.target.copy(target);controls.update();transition=null;}else transition={p:camera.position.clone(),t:controls.target.clone(),endP:position,endT:target,start:performance.now()};}
function resetView(instant=false){if(!renderer||!rooms)return;if(state.floor==='ALL'){resetOverview(instant);return;}state.inside=false;state.room=null;state.cut=true;pressed(['cut','solid'],'cut');document.querySelectorAll('[data-room]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.room==='')));updateDetails();const f=floorInfo[state.floor],target=vec(f.center);const scale=Math.max(1,1.1/Math.max(.4,camera.aspect));moveTo(target.clone().add(vec([f.span*.24,f.span*.88*scale,f.span*.75*scale])),target,instant);camera.fov=42;camera.updateProjectionMatrix();ortho.position.copy(target.clone().add(vec([0,40,.0001])));ortho.up.set(0,0,-1);ortho.lookAt(target);ortho.zoom=1;if(activeCamera===ortho){controls.target.copy(target);transition=null;}setOrtho();applyCut();$('view-name').textContent='本层全貌 · '+(state.mode==='plan'?'平面布局':'轴测视角');}
function roomView(inside){const room=currentRoom(),cam=manifest.cameras[room.camera];if(!cam)return;state.inside=inside;if(inside){state.room=room.id;updateDetails();state.cut=false;pressed(['cut','solid'],'solid');camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov)/2)/(16/9)));moveTo(vec(cam.position),vec(cam.target));}else{const target=vec([cam.target[0],floorInfo[state.floor].level+.4,cam.target[2]]);camera.fov=42;moveTo(target.clone().add(vec([3.4,6.2,5.4]).multiplyScalar(Math.max(1,.95/Math.max(.4,camera.aspect)))),target);}camera.updateProjectionMatrix();applyCut();$('view-name').textContent=room.title+' · '+(inside?'室内视角':'空间定位');}
function updateMode(){
 if(!renderer||!rooms||state.loading)return;
 if(state.floor==='ALL'&&state.mode!=='3d'){changeFloor('F1');return;}
 const render=state.mode==='render',plan=state.mode==='plan';
 if(render&&!state.room){state.room=floorInfo[state.floor].defaultRoom;updateDetails();}
 syncRoomSelection();
 document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode)));
 stage.hidden=render;$('render-view').hidden=!render;if(tour)ui.tourState(tour);
 if(render)return;
 activeCamera=plan?ortho:camera;controls.object=activeCamera;controls.enableRotate=!plan;
 controls.mouseButtons.LEFT=plan?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;
 controls.touches.ONE=plan?THREE.TOUCH.PAN:THREE.TOUCH.ROTATE;
 $('gesture').textContent=plan?'拖动平移 · 滚轮缩放':'拖动旋转 · 滚轮缩放 · 右键平移';
 stage.setAttribute('aria-label',plan?'别墅平面布局，拖动平移，滚轮缩放，可选择房间与开关门灯':'别墅三维模型，拖动旋转，滚轮缩放，可选择房间与开关门灯');
 if(plan){
  transition=null;state.inside=false;state.cut=true;pressed(['cut','solid'],'cut');
  const room=state.room?currentRoom():null,cam=room?manifest.cameras[room.camera]:null;
  const target=cam?vec([cam.target[0],floorInfo[state.floor].level,cam.target[2]]):vec(floorInfo[state.floor].center);
  ortho.position.copy(target.clone().add(vec([0,40,.0001])));ortho.up.set(0,0,-1);controls.target.copy(target);ortho.lookAt(target);
  setOrtho();const span=cam?Math.max(4,Math.min(10,vec(cam.position).distanceTo(vec(cam.target))*1.6)):floorInfo[state.floor].span;
  ortho.zoom=cam?Math.min(8,floorInfo[state.floor].span/span/Math.max(1,camera.aspect)):1;ortho.updateProjectionMatrix();controls.update();applyCut();
  $('view-name').textContent=(room?room.title:'本层全貌')+' · 正上方布局';
 }else if(!state.inside){if(state.room)roomView(false);else resetView();}
 resize();
}
function animate(){if(disposed)return;requestAnimationFrame(animate);const dt=Math.min(.1,clock.getDelta());devices?.update(dt);const active=!state.loading&&!stage.hidden&&!document.hidden;if(tour?.active){let remaining=dt*Number($('tour-speed').value);while(remaining>0){const step=Math.min(.05,remaining);tour.update(step,{floor:state.floor,active,narrationBusy:$('tour-voice').checked&&!!window.speechSynthesis?.speaking});remaining-=step;}}else family?.update(dt,{floor:state.floor,active});if(family)family.root.visible=family.shown&&!tour?.active;appliances?.update(dt,active&&!(tour?.active?tour.paused:family?.paused));if(stage.hidden){updateFamilyUi();return;}updateTourCamera(dt);if(transition&&activeCamera===camera){const t=Math.min(1,(performance.now()-transition.start)/850),ease=t*t*(3-2*t);camera.position.lerpVectors(transition.p,transition.endP,ease);controls.target.lerpVectors(transition.t,transition.endT,ease);if(t===1)transition=null;}controls.update();updateCutDirection();updateLabels();updateFamilyUi();renderer.render(scene,activeCamera);}
function light(night){if(!renderer)return;state.night=night;pressed(['day','night'],night?'night':'day');scene.background.set(night?'#17271f':'#e9eee3');ambient.intensity=night?.14:2.35;sun.intensity=night?.1:3.1;sun.color.set(night?0xc1cfff:0xfff0d7);fill.intensity=night?.06:1.1;renderer.toneMappingExposure=night?1.15:1.3;}
function zoom(factor){if(!activeCamera)return;if(activeCamera.isOrthographicCamera){activeCamera.zoom=Math.max(.3,Math.min(8,activeCamera.zoom/factor));activeCamera.updateProjectionMatrix();}else{camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);}transition=null;controls.update();}

function showRealtime(){if(state.mode==='render'){state.mode='3d';updateMode();}}
function updateActivityStatus(){
 if(!activityRequest)return;
 const request=activityRequest,people=family.people.filter(p=>request.ids.includes(p.id));
 for(const p of people)if(p.mode==='activity'&&p.action===request.action&&!p.transfer&&!p.preparing)request.arrived.add(p.id);
 const complete=request.arrived.size===people.length,paused=tour.active?'带看期间暂停':family.paused?'已暂停':stage.hidden?'效果图中暂停':null;
 const message=complete?'已完成安排：'+people.map(p=>p.name).join('、')+'已开始'+request.label+'。':
  (paused?paused+' · ':'')+request.label+' · '+request.arrived.size+'/'+people.length+' 人已就位。'+people.filter(p=>!request.arrived.has(p.id)).map(p=>p.name+'：'+family.status(p)).join('；');
 if($('activity-status').textContent!==message)$('activity-status').textContent=message;
 if(complete){ui.notify('活动已就位 · '+request.label);activityRequest=null;}
}

document.addEventListener('fullscreenchange',()=>{$('full').setAttribute('aria-label',document.fullscreenElement?'退出全屏':'全屏查看');$('full').setAttribute('aria-pressed',String(!!document.fullscreenElement));});

function buildFamilyControls(){
 for(const p of family.people){if(familyElements.has(p.id))continue;const button=document.createElement('button');button.className='family-person';button.style.setProperty('--person-color','#'+p.shirt.toString(16).padStart(6,'0'));const name=document.createElement('strong');name.textContent=p.name;const status=document.createElement('span');button.append(name,status);button.onclick=()=>focusPerson(p);$('family-list').append(button);const bubble=document.createElement('div');bubble.className='family-bubble';bubble.hidden=true;$('family-bubbles').append(bubble);familyElements.set(p.id,{button,status,bubble});}
 $('family-pause').textContent=family.paused?'继续生活':'暂停生活';$('family-pause').setAttribute('aria-pressed',String(family.paused));
}
async function focusPerson(p){if(state.loading||tour.active)return;$('activity-person').value=p.id;family.setShown(true);$('family-show').checked=true;if(p.transit){await changeFloor('ALL');}else if(state.floor!==p.floor)await changeFloor(p.floor);if(state.loading)return;state.mode='3d';state.inside=false;state.room=null;updateDetails();updateMode();state.cut=true;pressed(['cut','solid'],'cut');applyCut();const target=p.position.clone().add(vec([0,.48,0]));moveTo(personViewEye(activeGroup,target),target);document.querySelectorAll('[data-room]').forEach(b=>b.setAttribute('aria-pressed','false'));$('view-name').textContent=p.name+' · 人物定位';}
function updateFamilyUi(){
 if(!family||!activeCamera)return;const refresh=performance.now()-familyUiTime>700;if(refresh)familyUiTime=performance.now();const w=stage.clientWidth,h=stage.clientHeight;
 for(const p of [...family.people,...tour.people]){const owner=p.id.startsWith('visitor')||p.id==='guide'?tour:family,e=familyElements.get(p.id);if(!e)continue;if(refresh&&e.status){e.status.textContent=(family.paused?'已暂停 · ':stage.hidden?'效果图中暂停 · ':!family.shown?'已隐藏 · ':'')+floorInfo[p.floor].name+' · '+family.status(p);e.button.disabled=tour.active||state.loading;}const bubble=e.bubble,point=p.position.clone().add(vec([0,p.action==='sleep'?.35:1.08,0])).project(activeCamera);const visible=owner===(tour.active?tour:family)&&owner.shown&&!state.loading&&$('family-dialogue').checked&&p.speech?.until>owner.time&&(state.floor==='ALL'||(!p.transit&&state.floor===p.floor));bubble.hidden=!visible||point.z>1||point.z< -1||Math.abs(point.x)>.95||Math.abs(point.y)>.95;if(!bubble.hidden){const text=p.name+'：'+(owner===tour&&p.speech.text.length>24?p.speech.text.slice(0,24)+'…':p.speech.text);
   const viewport=w+'x'+h;if(bubble.textContent!==text||e.bubbleViewport!==viewport){bubble.textContent=text;e.bubbleViewport=viewport;e.bubbleSize=null;}
   e.bubbleSize??={width:bubble.offsetWidth,height:bubble.offsetHeight};
   const half=e.bubbleSize.width/2;const x=THREE.MathUtils.clamp((point.x*.5+.5)*w,half+8,w-half-8);
   const y=THREE.MathUtils.clamp((-point.y*.5+.5)*h,e.bubbleSize.height+8,h-8);
   bubble.style.left=x+'px';bubble.style.top=y+'px';}}
 if(refresh){ui.tourState(tour);document.getElementById('family-state').textContent=tour.active?'带看期间暂停':family.paused?'已暂停':stage.hidden?'效果图中暂停':family.shown?'日常进行中':'已隐藏';updateActivityStatus();$('tv-toggle').textContent=appliances.tvOn?'电视已开 · 关闭':'电视已关 · 打开';$('tv-toggle').setAttribute('aria-pressed',String(appliances.tvOn));}
}
$('family-pause').onclick=()=>{if(family){family.setPaused(!family.paused);if(!family.paused&&state.mode==='render'){state.mode='3d';updateMode();}buildFamilyControls();ui.notify(family.paused?'家人生活已暂停':'家人生活已继续');}};$('family-show').onchange=()=>{family?.setShown($('family-show').checked);ui.notify($('family-show').checked?'已显示家人':'已隐藏家人');};
async function arrangeActivity(id,action,spotId=null){
 if(!family||tour.active||state.loading)return;
 family.requestActivity(id,action,spotId);family.setShown(true);family.setPaused(false);$('family-show').checked=true;buildFamilyControls();
 const person=family.people.find(p=>p.id===id),label=$('activity-action').querySelector(`[value="${action}"]`)?.textContent||action;
 activityRequest={ids:family.people.filter(p=>id==='all'||p.id===id).map(p=>p.id),action,label,arrived:new Set()};
 $('activity-status').textContent='已安排'+(id==='all'?'全家':person.name)+'：'+label+'。家人会完成当前动作后前往。';ui.notify('已安排'+(id==='all'?'全家':person.name)+' · '+label);
 if(id==='all'){state.mode='3d';await changeFloor('ALL');}else await focusPerson(person);
}
$('activity-free').onclick=()=>{if(!family||tour.active||state.loading)return;activityRequest=null;family.resumeDaily();family.setPaused(false);family.setShown(true);$('family-show').checked=true;if(state.mode==='render'){state.mode='3d';updateMode();}buildFamilyControls();$('activity-status').textContent='已恢复自由活动，家人会完成当前动作后继续日常。';ui.notify('家人已恢复自由活动');};
$('activity-send').onclick=()=>arrangeActivity($('activity-person').value,$('activity-action').value);document.querySelectorAll('[data-family-action]').forEach(b=>b.onclick=()=>arrangeActivity('all',b.dataset.familyAction));$('tv-toggle').onclick=()=>{if(state.loading)return;showRealtime();appliances?.toggleTV();ui.notify(appliances?.tvOn?'电视已打开':'电视已关闭');};
function buildTourControls(){const select=$('tour-stop');select.replaceChildren();tour.definition.stops.forEach((stop,i)=>{const option=document.createElement('option');option.value=i;option.textContent=String(i+1).padStart(2,'0')+' · '+stop.title;select.append(option);});$('tour-start').disabled=state.loading;}
async function startTour(){if(!tour||state.loading)return;if(tour.active)tour.end();tourViewState={paused:family.paused,shown:family.shown};family.setPaused(true);state.mode='3d';stage.hidden=false;$('render-view').hidden=true;state.inside=false;state.cut=true;pressed(['cut','solid'],'cut');await changeFloor('ALL');if(!tour.start()){family.setPaused(tourViewState.paused);tourViewState=null;return;}for(const p of tour.people)if(!familyElements.has(p.id)){const bubble=document.createElement('div');bubble.className='family-bubble tour-bubble';bubble.hidden=true;$('family-bubbles').append(bubble);familyElements.set(p.id,{bubble});}$('tour-follow').checked=true;$('tour-start').textContent='重新开始带看';ui.selectPanel(0);setTourControls(true);buildFamilyControls();}
function setTourControls(active){for(const id of ['tour-pause','tour-prev','tour-next','tour-end','tour-stop'])$(id).disabled=!active;for(const id of ['activity-send','activity-free','activity-person','activity-action','family-pause','family-show'])$(id).disabled=active;document.querySelectorAll('[data-family-action]').forEach(b=>b.disabled=active);$('tour-pause').textContent=tour.paused?'继续带看':'暂停带看';$('tour-pause').setAttribute('aria-pressed',String(tour.paused));ui.tourState(tour);}
function speakTour(text){if(!$('tour-voice').checked)return;if(!('speechSynthesis'in window)){$('tour-status').textContent='此浏览器没有语音朗读功能，请查看文字讲解。';return;}speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang='zh-CN';utterance.rate=1.12;speechSynthesis.speak(utterance);}
function tourChanged(event){
 if(['end','complete'].includes(event.type)){if('speechSynthesis'in window)speechSynthesis.cancel();if(tourViewState){family.setPaused(tourViewState.paused);family.setShown(tourViewState.shown);tourViewState=null;}setTourControls(false);buildFamilyControls();$('tour-start').textContent='销售带看 · 全屋演示';$('tour-status').textContent=event.type==='complete'?'全屋介绍完成，已返回本层全貌并恢复之前的生活状态。':'带看已结束，已返回本层全貌并恢复之前的生活状态。';ui.notify(event.type==='complete'?'本次带看已完成':'带看已结束');if(!state.loading)resetView();return;}
 $('tour-stop').value=event.index;$('tour-title').textContent=event.stop.title;$('tour-status').textContent=(event.type==='move'?'正在前往':'正在介绍')+' · '+(event.index+1)+' / '+tour.definition.stops.length+' 站';
 if(event.type==='move'){$('tour-text').textContent='请跟随小林和三位访客，一起前往'+event.stop.title+'。'+(event.stop.meetingNote||'');if('speechSynthesis'in window)speechSynthesis.cancel();}
 if(event.type==='waiting')$('tour-status').textContent='队伍正在等待通道，请检查门的开合，或点击下一站。';
 if(event.type==='line'){$('tour-text').textContent=event.speaker+'：'+event.text;speakTour(event.text);}
}
function updateTourCamera(dt){
 if(!tour?.active||!$('tour-follow').checked||state.loading||stage.hidden)return;
 const leader=tour.people[0],together=tour.people.every(p=>p.floor===leader.floor&&!p.transit),desiredFloor=together?leader.floor:'ALL';
 if(desiredFloor!==state.floor){changeFloor(desiredFloor);return;}if(activeCamera!==camera){state.mode='3d';updateMode();}
 transition=null;state.inside=false;const target=together?tour.people.reduce((v,p)=>v.add(p.position),new THREE.Vector3()).multiplyScalar(1/tour.people.length).add(vec([0,.55,0])):leader.position.clone().add(vec([0,.55,0]));if(tour.phase==='presenting'){target.lerp(vec(tour.stop.focus),.18);target.y=floorInfo[leader.floor].level+.65;}const offset=fitPeopleView(target,state.floor==='ALL'?vec([6,4.4,7]):vec([3.8,2.8,4.5]),tour.people.map(p=>p.position.clone().add(vec([0,.52,0]))),camera.fov,camera.aspect);const ease=1-Math.exp(-dt*2.4);camera.position.lerp(target.clone().add(offset),ease);controls.target.lerp(target,ease);$('view-name').textContent='销售带看 · '+tour.stop.title;
}
$('tour-start').onclick=startTour;$('tour-pause').onclick=()=>{tour.setPaused(!tour.paused);if(tour.paused&&'speechSynthesis'in window)speechSynthesis.cancel();setTourControls(true);};$('tour-prev').onclick=()=>tour.previous();$('tour-next').onclick=()=>tour.next();$('tour-end').onclick=()=>tour.end();$('tour-stop').onchange=()=>tour.setStop(Number($('tour-stop').value));$('tour-voice').onchange=()=>{if(!$('tour-voice').checked&&'speechSynthesis'in window)speechSynthesis.cancel();};document.addEventListener('visibilitychange',()=>{if(document.hidden&&'speechSynthesis'in window)speechSynthesis.cancel();});
function deviceRoom(){return {desk:'master',vanity:'masterbath',movie:'cinema',entry:'foyer',relation:'dining'}[state.room]||state.room;}
function buildDeviceControls(){
 if(!devices)return;
 $('device-scope').textContent=state.room?currentRoom().title:floorInfo[state.floor].name;
 for(const type of ['door','light']){
  const list=$(type+'-list');list.replaceChildren();
  const items=devices.scoped(type,state.floor,deviceRoom());
  $(type+'-count').textContent=items.length;
  for(const item of items){const b=document.createElement('button');b.className='device-row';b.dataset.deviceType=type;b.dataset.deviceId=item.def.id;const name=document.createElement('span');name.textContent=item.def.label;const status=document.createElement('span');status.className='device-state';b.append(name,status);b.onclick=()=>{showRealtime();if(type==='door')devices.toggleDoor(item.def.id);else devices.toggleLight(item.def.id);ui.notify($('device-status').textContent);};list.append(b);}
  if(!items.length){const note=document.createElement('p');note.className='device-empty';note.textContent=state.loading?'正在准备…':type==='door'?'此空间没有可操作的门':'此空间没有独立灯光回路';list.append(note);}
  document.querySelectorAll(`[data-all-device="${type}"]`).forEach(b=>b.disabled=state.loading||!items.length);
 }
 syncDeviceButtons();
}
function syncDeviceButtons(){
 if(!devices)return;
 document.querySelectorAll('[data-device-id]').forEach(b=>{
  const door=b.dataset.deviceType==='door',item=(door?devices.doors:devices.lights).get(b.dataset.deviceId);if(!item)return;
  const on=door?item.open:item.on;b.setAttribute('aria-pressed',String(on));b.disabled=state.loading;
  b.querySelector('.device-state').textContent=door?(on?'已开 · 关门':'已关 · 开门'):(on?'亮 · 关灯':'灭 · 开灯');
  b.setAttribute('aria-label',item.def.label+'，'+(door?(on?'门已开，点击关门':'门已关，点击开门'):(on?'灯已开，点击关灯':'灯已关，点击开灯')));
 });
 for(const label of labels){const l=devices.lights.get('light-'+label.room.id);if(!l||!label.lightButton)continue;label.lightButton.setAttribute('aria-pressed',String(l.on));const action=label.room.title+(l.on?'关灯':'开灯');label.lightButton.setAttribute('aria-label',action);label.lightButton.title=action;}
}
function deviceChanged(change){
 if(change.type==='light')appliances?.manualLight(change.id);
 if(change.type==='door'&&!family?.adjustingDoor&&!tour?.adjustingDoor){const door=devices.doors.get(change.id);if(door)door.userOperated=true;}
 syncDeviceButtons();$('device-status').textContent=change.label+'：'+(change.type==='door'?(change.on?'开门':'关门'):(change.on?'灯已打开':'灯已关闭'));
}
document.querySelectorAll('[data-all-device]').forEach(b=>b.onclick=()=>{
 showRealtime();const type=b.dataset.allDevice,on=b.dataset.on==='true';for(const item of devices.scoped(type,state.floor,deviceRoom())){if(type==='door')devices.setDoor(item.def.id,on);else devices.setLight(item.def.id,on);}
 $('device-status').textContent=(state.room?currentRoom().title:floorInfo[state.floor].name)+'：'+(type==='door'?(on?'全部开门':'全部关门'):(on?'全部开灯':'全部关灯'));ui.notify($('device-status').textContent);
});
function bindModelInteractions(){
 const canvas=renderer.domElement,ray=new THREE.Raycaster(),pointers=new Set();let start=null;
 const point=e=>({id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now()});
 canvas.addEventListener('pointerdown',e=>{pointers.add(e.pointerId);start=pointers.size===1&&e.button===0?point(e):null;});
 canvas.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>=6)start=null;});
 canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);start=null;});
 canvas.addEventListener('pointerup',e=>{
  const tap=isTap(start,point(e));pointers.delete(e.pointerId);start=null;if(!tap||state.loading||!activeGroup||stage.hidden)return;
  const rect=canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),activeCamera);
  activeGroup.updateMatrixWorld(true);
  const hit=ray.intersectObject(activeGroup,true).find(h=>{for(let o=h.object;o;o=o.parent)if(!o.visible)return false;if(cutaway.transparency.isFaded(h.object,h.point,h.faceIndex))return false;const m=h.object.material,planes=m?.clippingPlanes;if(!planes?.length)return true;const clipped=p=>p.distanceToPoint(h.point)<0;return !(m.clipIntersection?planes.every(clipped):planes.some(clipped));});
  if(hit?.object.userData.doorId)devices.toggleDoor(hit.object.userData.doorId);
  else if(hit?.object.userData.lightId)devices.toggleLight(hit.object.userData.lightId);
  else if(hit?.object.userData.tvSwitch)appliances.toggleTV();
  else if(hit?.object.userData.furnitureSpotId&&!tour.active){const spot=family.layout.spots.find(s=>s.id===hit.object.userData.furnitureSpotId);arrangeActivity($('activity-person').value,spot.action,spot.id);}
 });
}

document.querySelectorAll('[data-floor]').forEach(b=>b.onclick=()=>changeFloor(b.dataset.floor));document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{state.mode=b.dataset.mode;updateMode();});$('inside').onclick=()=>{if(!rooms||state.loading)return;if(state.floor==='ALL'){focusStairs();return;}state.room=currentRoom().id;state.mode='3d';updateDetails();updateMode();roomView(true);};$('open-render').onclick=()=>{state.mode='render';updateMode();};$('reset').onclick=()=>resetView();$('zoom-in').onclick=()=>zoom(.82);$('zoom-out').onclick=()=>zoom(1.22);$('cut').onclick=()=>{state.cut=true;pressed(['cut','solid'],'cut');applyCut();};$('solid').onclick=()=>{state.cut=false;pressed(['cut','solid'],'solid');applyCut();};$('day').onclick=()=>{showRealtime();light(false);ui.notify('已切换日间光线');};$('night').onclick=()=>{showRealtime();light(true);ui.notify('已切换夜间光线，可开关灯观察照明');};$('labels').onchange=updateLabels;$('full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.querySelector('.workspace').requestFullscreen();}catch{$('view-name').textContent='此浏览器暂不支持全屏';}};$('retry').onclick=()=>{if(!renderer||renderer.getContext().isContextLost())location.reload();else changeFloor(state.floor);};stage.addEventListener('keydown',e=>{if(e.key==='+')zoom(.85);if(e.key==='-')zoom(1.18);if(e.key==='Home')resetView();});
try{let navigation,layout,furnitureDefinition,tourDefinition;[manifest,rooms,overviewDefinition,navigation,layout,furnitureDefinition,tourDefinition,occlusionDefinition]=await Promise.all([json('model/manifest.json?v=interactive-2'),json('rooms.json'),json('model/overview.json?v=landscape-1'),json('model/resident-navigation.json?v=1'),json('model/family-layout.json?v=1'),json('model/furniture-life.json?v=1'),json('model/tour.json?v=1'),json('model/occlusion.json?v=1')]);devices=new HouseInteractions(manifest.interactions,deviceChanged,reduced);appliances=new HouseAppliances(furnitureDefinition,devices);family=new FurnitureLife(navigation,devices,layout,furnitureDefinition,appliances,{paused:reduced});tour=new HouseTour(navigation,devices,layout,tourDefinition,appliances,tourChanged);initRenderer();await changeFloor('ALL');buildTourControls();}catch(e){failure(e);}
