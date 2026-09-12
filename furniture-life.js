import * as THREE from './vendor/three.module.js';
import { FamilyLife, ROUTINES } from './family-life.js?v=2';

export class HouseAppliances {
  constructor(definition,devices){this.definition=definition;this.devices=devices;this.lightLeases=new Map();this.tvUsers=new Set();this.coffeeUsers=new Set();this.washUsers=new Set();this.time=0;this.effects=new Map();this.tvManual=null;this.changingLight=false;}
  acquireLight(owner,id,on,priority=10){
    const light=this.devices.lights.get(id);if(!light)return;
    let lease=this.lightLeases.get(id);if(!lease){lease={baseline:light.on,requests:new Map(),manual:false};this.lightLeases.set(id,lease);}
    lease.requests.set(owner,{on,priority});lease.manual=false;this.applyLight(id,lease);
  }
  applyLight(id,lease){if(lease.manual)return;const requests=[...lease.requests.values()].sort((a,b)=>b.priority-a.priority||Number(a.on)-Number(b.on));const desired=requests[0]?.on??lease.baseline;if(this.devices.lights.get(id)?.on!==desired){this.changingLight=true;try{this.devices.setLight(id,desired);}finally{this.changingLight=false;}}}
  manualLight(id){if(this.changingLight)return;const lease=this.lightLeases.get(id);if(lease){lease.baseline=this.devices.lights.get(id).on;lease.manual=true;}}
  release(owner){for(const [id,lease] of this.lightLeases){lease.requests.delete(owner);this.applyLight(id,lease);if(!lease.requests.size)this.lightLeases.delete(id);}this.tvUsers.delete(owner);this.coffeeUsers.delete(owner);this.washUsers.delete(owner);}
  begin(p){
    const owner='family-'+p.id,action=p.goal.action,id=action==='sleep'?this.definition.sleepLights[p.id]:p.goal.light||(action==='bathroom'?'light-f1bath':null);
    if(id)this.acquireLight(owner,id,!['sleep','tv'].includes(action),action==='sleep'?30:action==='tv'?20:10);
    if(action==='tv')this.watch(owner);if(action==='coffee')this.coffeeUsers.add(owner);if(action==='wash')this.washUsers.add(owner);
  }
  watch(owner){if(!this.tvUsers.size)this.tvManual=null;this.tvUsers.add(owner);}
  get tvOn(){return this.tvManual??this.tvUsers.size>0;}
  toggleTV(){this.tvManual=!this.tvOn;}
  addFloor(floor,group){
    if(this.effects.has(floor))return;const root=new THREE.Group();root.name='Furniture_Activity_Effects';this.effects.set(floor,root);group.add(root);
    if(floor===this.definition.screen.floor){
      const def=this.definition.screen;this.screenMaterial=new THREE.ShaderMaterial({uniforms:{time:{value:0},power:{value:0}},vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:`uniform float time;uniform float power;varying vec2 vUv;
      void main(){vec2 p=vUv;vec3 sky=mix(vec3(.88,.72,.49),vec3(.20,.43,.57),p.y);float sun=1.0-smoothstep(.075,.082,length(p-vec2(.73,.74)));sky=mix(sky,vec3(1.,.93,.68),sun);float ridge=.37+.1*sin(p.x*8.+.4)+.055*sin(p.x*19.);if(p.y<ridge)sky=vec3(.25,.44,.43);float near=.22+.08*sin(p.x*7.+2.);if(p.y<near)sky=vec3(.13,.31,.31);if(p.y<.16){float wave=.5+.5*sin(p.x*40.+p.y*65.+time*1.8);sky=mix(vec3(.27,.52,.57),vec3(.58,.73,.66),wave*.35);}vec2 cloud=vec2(fract(p.x-time*.012),p.y);float c=exp(-pow((cloud.x-.33)*8.,2.)-pow((cloud.y-.78)*30.,2.));sky=mix(sky,vec3(.95,.94,.83),c*.75);float boatX=.5+.29*sin(time*.09);if(abs(p.x-boatX)<.045&&p.y>.095&&p.y<.106)sky=vec3(.2,.15,.12);gl_FragColor=vec4(mix(vec3(.009,.015,.018),sky,power),1.);}`,toneMapped:false});
      const screen=new THREE.Mesh(new THREE.PlaneGeometry(...def.size),this.screenMaterial);screen.position.fromArray(def.position);screen.userData.tvSwitch=true;root.add(screen);this.screenLight=new THREE.PointLight(0x8bc9d3,0,5,2);this.screenLight.position.copy(screen.position).add(new THREE.Vector3(0,0,.24));root.add(this.screenLight);
    }
    for(const [name,def] of [['coffee',this.definition.coffee],['wash',this.definition.wash]])if(floor===def.floor){const effect=new THREE.Group();effect.position.fromArray(def.position);effect.visible=false;root.add(effect);this[name+'Effect']=effect;if(name==='coffee'){for(let i=0;i<4;i++){const puff=new THREE.Mesh(new THREE.SphereGeometry(.03,8,6),new THREE.MeshBasicMaterial({color:0xe3ece4,transparent:true,opacity:.35,depthWrite:false}));puff.userData.phase=i*.23;effect.add(puff);}}else{const water=new THREE.Mesh(new THREE.CylinderGeometry(.011,.016,.16,7),new THREE.MeshBasicMaterial({color:0x9ddbe5,transparent:true,opacity:.58,depthWrite:false}));water.position.y=-.08;effect.add(water);}}
    const resources=new Set();for(const spot of this.definition.spots.filter(s=>s.floor===floor&&s.seat)){if(resources.has(spot.resource))continue;resources.add(spot.resource);const pick=new THREE.Mesh(new THREE.BoxGeometry(.45,.5,.46),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false}));pick.position.fromArray(spot.seat.position);pick.position.y+=.15;pick.userData.furnitureSpotId=spot.id;pick.name='Furniture_pick_'+spot.id;root.add(pick);}
  }
  update(dt,active=true){
    if(active)this.time+=Math.max(0,dt);if(this.screenMaterial){this.screenMaterial.uniforms.time.value=this.time;this.screenMaterial.uniforms.power.value=this.tvOn?1:0;this.screenLight.intensity=this.tvOn?2:0;}
    if(this.coffeeEffect){this.coffeeEffect.visible=this.coffeeUsers.size>0;for(const p of this.coffeeEffect.children){const phase=(this.time*.35+p.userData.phase)%1;p.position.set(Math.sin(this.time+p.userData.phase*8)*.028,phase*.28,0);p.scale.setScalar(.6+phase*.7);p.material.opacity=.35*(1-phase);}}
    if(this.washEffect)this.washEffect.visible=this.washUsers.size>0;
  }
}

export class FurnitureLife extends FamilyLife {
  constructor(nav,devices,layout,definition,appliances,options={}){const replaced=new Set(definition.spots.map(s=>s.id));super(nav,devices,{...layout,spots:[...layout.spots.filter(s=>!replaced.has(s.id)),...definition.spots]},options);this.appliances=appliances;this.definition=definition;}
  available(p,s){return this.ready.has(s.floor)&&(!s.owner||s.owner===p.id)&&!this.people.some(o=>o!==p&&o.goal&&(o.goal.id===s.id||(s.resource&&o.goal.resource===s.resource)));}
  selectGoal(p){
    const requested=p.requestedAction||p.orderAction||(!this.gathering?.started?this.gathering?.action:null),spotId=p.requestedSpot||p.orderSpot,routine=ROUTINES[p.id];
    for(let i=0;i<(requested?1:routine.length);i++){const action=requested||routine[p.routineIndex++%routine.length],candidates=this.layout.spots.filter(s=>s.action===action&&(!spotId||s.id===spotId)&&this.available(p,s));candidates.sort((a,b)=>this.spotScore(p,a)-this.spotScore(p,b));if(candidates.length){p.goal=candidates[0];p.requestedAction=null;p.requestedSpot=null;p.mode='route';p.path=[];p.navPurpose=null;p.wait=0;p.failures=0;return;}}
    p.wait=2;
  }
  requestActivity(id,action,spotId=null){this.cancelGathering();if(id==='all'&&['tv','eat'].includes(action))this.gathering={action,ids:this.people.map(p=>p.id),started:false,since:this.time};for(const p of this.people.filter(p=>id==='all'||p.id===id)){p.requestedAction=p.orderAction=action;p.requestedSpot=p.orderSpot=spotId;if(p.goal?.action===action&&(!spotId||p.goal.id===spotId)){p.requestedAction=null;p.requestedSpot=null;if(p.mode==='activity'){p.orderAction=null;p.orderSpot=null;}if(this.gathering)p.remaining=Infinity;continue;}if(p.transit||p.transfer||p.preparing)continue;p.chatRemaining=0;if(p.mode==='activity')this.endActivity(p);else this.finish(p);}}
  cancelGathering(){if(this.gathering)for(const p of this.people)if(p.remaining===Infinity)p.remaining=14;this.gathering=null;}
  resumeDaily(){this.cancelGathering();for(const p of this.people){p.requestedAction=null;p.requestedSpot=null;p.orderAction=null;p.orderSpot=null;}}
  arrive(p){
    if(p.navPurpose?.type==='stairs'){super.arrive(p);return;}
    super.arrive(p);this.appliances.begin(p);
    if(p.orderAction===p.action&&(!p.orderSpot||p.orderSpot===p.goal.id)){p.orderAction=null;p.orderSpot=null;}
    if(this.gathering&&!this.gathering.started&&this.gathering.action===p.action)p.remaining=Infinity;
    if(p.goal.seat){p.seat=p.goal.seat;p.seatApproach=p.position.clone();this.seatTransfer(p,false);}
    if(['tv','sleep'].includes(p.action)){p.preparing={remaining:.85,transfer:p.transfer};p.transfer=null;p.action='switch';p.mode='preparing';this.say(p,p.goal.action==='sleep'?'关好灯，准备睡觉啦。':'打开电视，坐下来慢慢看。');}
    if(p.action==='coffee')this.say(p,'咖啡在冲泡，闻起来好香。');if(p.action==='read')this.say(p,'窝在沙发上，读几页书。');
  }
  seatTransfer(p,waking){
    const position=new THREE.Vector3(...p.seat.position);position.y-=p.scale*.255;const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),p.yaw);
    p.transfer={from:p.position.clone(),to:waking?p.seatApproach.clone():position,q0:q.clone(),q1:q.clone(),t:0,waking,arc:.055};p.mode='furniture-transfer';
  }
  endActivity(p){if(p.action==='bathroom'&&!p.requestedAction)p.requestedAction='wash';if(p.seat)this.seatTransfer(p,true);else super.endActivity(p);}
  finish(p){this.appliances.release('family-'+p.id);p.seat=null;p.preparing=null;p.bedApproach=null;super.finish(p);}
  posePerson(p,moving){
    let seated=p.seat?1:0;if(p.preparing)seated=0;else if(p.seat&&p.transfer){const t=p.transfer.t,ease=t*t*(3-2*t);seated=p.transfer.waking?1-ease:ease;}
    let sleepBlend=1;if(p.action==='sleep'&&p.transfer){const t=p.transfer.t,ease=t*t*(3-2*t);sleepBlend=p.transfer.waking?1-ease:ease;}
    p.rig.pose(this.time+p.phase,moving,p.chatRemaining>0?'chat':p.action,{seated,tableY:seated>.5?p.goal?.tableY??null:null,sleepBlend});
  }
  update(dt,options={}){super.update(dt,options);if(options.active===false||this.paused||!this.shown)return;for(const p of this.people)if(p.requestedAction&&p.goal&&!p.transit&&!p.transfer&&!p.preparing){if(p.goal.action===p.requestedAction&&(!p.requestedSpot||p.goal.id===p.requestedSpot)){p.requestedAction=null;p.requestedSpot=null;}else if(p.mode==='activity')this.endActivity(p);else this.finish(p);}if(!this.gathering||this.gathering.started)return;const group=this.gathering;if(this.people.every(p=>p.goal?.action===group.action&&p.mode==='activity')){group.started=true;for(const p of this.people)p.remaining=30;this.say(this.people[0],group.action==='tv'?'大家到齐了，一起看吧！':'大家都坐好了，开饭啦！');}else if(this.time-group.since>240){this.say(this.people[0],'大家慢慢来，我们先坐一会儿。');this.cancelGathering();}}
}
