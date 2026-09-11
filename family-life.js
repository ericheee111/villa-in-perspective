import * as THREE from './vendor/three.module.js';
import { ResidentLife } from './residents.js';

const ROUTINES={father:['drink','work','eat','tv','bathroom','clean','sleep'],mother:['eat','clean','drink','work','tv','bathroom','sleep'],brother:['work','drink','eat','clean','tv','bathroom','sleep'],daughter:['clean','eat','drink','work','tv','bathroom','sleep']};
const LABELS={look:'稍作休息',walk:'散步',wait:'等一等',stairs:'上下楼',eat:'吃饭',drink:'喝水',bathroom:'使用洗手间',sleep:'睡觉',clean:'打扫',work:'工作学习',tv:'看电视',chat:'聊天'};
const LINES={eat:['开饭啦，慢慢吃。','今天的饭真香！'],drink:['喝口水，休息一下。','记得多喝水哦。'],bathroom:['洗手间使用中。'],sleep:['晚安，做个好梦。','先睡一会儿。'],clean:['把这里收拾干净。','一起把家照顾好。'],work:['专心一会儿，马上就好。','这个问题有办法了。'],tv:['一起看会儿电视吧。','这一段真有意思。']};
const DIALOGUES=[['今天想吃什么呀？','想吃番茄炒蛋！'],['忙完一起看电视吧。','好呀，等我一下。'],['开饭前记得洗手哦。','好，我这就去。'],['今天过得怎么样？','挺开心的，还想聊一会儿。']];
const V=a=>new THREE.Vector3(...a);

export class FamilyLife extends ResidentLife {
  constructor(navigation,devices,layout,options={}){super(navigation,devices,options);this.layout=layout;this.stairLocks=new Map();this.nextChat=12;this.pendingReplies=[];this.planCursor=0;}
  addFloor(floor){super.addFloor(floor);for(const p of this.people)if(p.routineIndex===undefined){p.routineIndex=0;p.mode='idle';p.wait=.3;p.failures=0;}}
  say(p,text,seconds=6){p.speech={text,until:this.time+seconds};}
  status(p){return p.transit?'正在上下楼':p.mode==='route'&&p.goal?'前往'+LABELS[p.goal.action]:LABELS[p.action]||'稍作休息';}
  blocked(floor,x,z,doors,person=null,people=true){
    if(super.blocked(floor,x,z,doors,person,people))return true;
    return people&&this.people.some(p=>p!==person&&p.transit?.toFloor===floor&&this.point(floor,p.transit.link.nodes[floor]).distanceTo(new THREE.Vector3(x,this.point(floor,p.transit.link.nodes[floor]).y,z))<this.navigation.radius*2+.08);
  }
  selectGoal(p){
    for(let n=0;n<ROUTINES[p.id].length;n++){
      const action=ROUTINES[p.id][p.routineIndex++%ROUTINES[p.id].length];
      const candidates=this.layout.spots.filter(s=>s.action===action&&this.ready.has(s.floor)&&(!s.owner||s.owner===p.id)&&!this.people.some(o=>o!==p&&o.goal?.id===s.id));
      candidates.sort((a,b)=>this.spotScore(p,a)-this.spotScore(p,b));
      if(candidates.length){p.goal=candidates[0];p.mode='route';p.path=[];p.navPurpose=null;p.wait=0;p.failures=0;return;}
    }
    p.wait=2;
  }
  spotScore(p,s){let score=(s.floor===p.floor?0:15)+V(s.position).distanceTo(p.position);if(s.action==='work'){const preferred=p.id==='brother'?'work-brother':p.id==='father'?'work-master':'work-family';if(s.id===preferred)score-=30;}return score;}
  plan(p,doors){
    if(!p.goal)return;
    let target=p.goal.cell,purpose={type:'activity'};
    if(p.goal.floor!==p.floor){const order=['B1','F1','F2'],up=order.indexOf(p.goal.floor)>order.indexOf(p.floor);const link=this.layout.stairs.find(s=>up?s.lower===p.floor:s.upper===p.floor);if(!link||!this.ready.has(up?link.upper:link.lower)){this.finish(p);return;}target=link.nodes[p.floor];purpose={type:'stairs',link,up};}
    p.path=this.findPath(p,target,doors);p.navPurpose=purpose;
    if(!p.path.length){if(p.position.distanceTo(this.point(p.floor,target))<.075)this.arrive(p);else{p.failures++;p.wait=2+this.random()*2;if(p.failures===2&&this.clearOpenDoor(p,target))return;if(p.failures>=3){this.say(p,'这边暂时过不去，换个活动吧。');this.finish(p);}}}
  }
  clearOpenDoor(p,target){
    // A default open leaf may obstruct a corridor. Respect every manually operated door.
    for(const door of this.devices.doors.values()){
      const d=door.def;if(d.floor!==p.floor||d.kind!=='hinge'||!door.open||door.userOperated)continue;
      const closed=this.doorSegments(p.floor,new Map([[d.id,d.closed]]));
      if(!this.findPath(p,target,closed).length)continue;
      const sweeping=this.doorSegments(p.floor,new Map([[d.id,{value:door.value,target:d.closed}]]));
      if(this.people.some(o=>o.floor===p.floor&&this.blocked(p.floor,o.position.x,o.position.z,sweeping,o,false)))continue;
      this.adjustingDoor=true;try{this.devices.setDoor(d.id,false);}finally{this.adjustingDoor=false;}this.say(p,'这扇门挡住走廊了，先收好。');p.wait=1.2;p.failures=0;return true;
    }
    return false;
  }
  arrive(p){
    if(p.navPurpose?.type==='stairs'){p.mode='stair-wait';p.action='wait';return;}
    p.mode='activity';p.action=p.goal.action;p.remaining=p.action==='sleep'?26+this.random()*12:9+this.random()*9;
    const look=p.goal.look;p.yaw=Math.atan2(look[0]-p.position.x,look[1]-p.position.z);
    const lines=LINES[p.action];if(lines)this.say(p,lines[Math.floor(this.random()*lines.length)]);
    if(p.action==='sleep')this.bedTransfer(p,false);
  }
  bedTransfer(p,waking){
    const bed=p.goal.bed;if(!waking)p.bedApproach=p.position.clone();
    const lying=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.atan2(-bed.direction[0],-bed.direction[1])).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2));
    const upright=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),p.yaw),bedPoint=new THREE.Vector3(bed.x,bed.surfaceY+.18,bed.z);
    p.transfer={from:p.position.clone(),to:waking?p.bedApproach.clone():bedPoint,q0:waking?lying:upright,q1:waking?upright:lying,t:0,waking};p.mode='bed-transfer';
  }
  finish(p){p.goal=null;p.path=[];p.navPurpose=null;p.mode='idle';p.action='look';p.wait=.6+this.random();p.failures=0;}
  startStairs(p){
    const {link,up}=p.navPurpose,toFloor=up?link.upper:link.lower,exit=this.point(toFloor,link.nodes[toFloor]);
    if(this.stairLocks.has(link.id))return;
    if(this.blocked(toFloor,exit.x,exit.z,this.doorSegments(toFloor),p)){
      const other=this.people.find(o=>o!==p&&o.floor===toFloor&&o.mode==='stair-wait'&&o.navPurpose?.link.id===link.id);
      if(other){const doors=this.doorSegments(other.floor),candidates=other.component.filter(i=>{const q=this.point(other.floor,i),d=q.distanceTo(other.position);return d>.85&&d<1.5&&!this.blocked(other.floor,q.x,q.z,doors,other);});candidates.sort((a,b)=>this.point(other.floor,a).distanceToSquared(other.position)-this.point(other.floor,b).distanceToSquared(other.position));for(const cell of candidates.slice(0,12)){const path=this.findPath(other,cell,doors);if(path.length){other.path=path;other.mode='route';other.yielding=true;break;}}}
      return;
    }
    this.stairLocks.set(link.id,p.id);p.transit={link,toFloor,path:(up?link.path:[...link.path].reverse()).map(V),index:1,t:0};p.mode='transit';p.action='stairs';
  }
  moveStairs(p,dt){
    const t=p.transit,a=t.path[t.index-1],b=t.path[t.index],distance=a.distanceTo(b);t.t=Math.min(1,t.t+p.speed*dt/Math.max(.01,distance));
    p.position.lerpVectors(a,b,t.t);p.position.y+=Math.sin(Math.PI*t.t)*(.075+Math.abs(b.y-a.y)*.25);p.yaw=Math.atan2(b.x-a.x,b.z-a.z);
    if(t.t>=1){t.index++;t.t=0;if(t.index>=t.path.length){p.floor=t.toFloor;p.cell=t.link.nodes[p.floor];p.component=this.navigation.floors[p.floor].components[0];this.stairLocks.delete(t.link.id);p.transit=null;p.mode='route';p.navPurpose=null;p.wait=.15;}}
  }
  conversation(){
    const available=this.people.filter(p=>!p.transit&&!p.transfer&&!['sleep','bathroom'].includes(p.action)&&!p.chatRemaining&&p.mode!=='stair-wait');
    for(let i=0;i<available.length;i++)for(let j=i+1;j<available.length;j++){
      const a=available[i],b=available[j];if(a.floor!==b.floor||a.position.distanceTo(b.position)>2.2)continue;
      const lines=DIALOGUES[Math.floor(this.random()*DIALOGUES.length)];this.say(a,lines[0],4);this.pendingReplies.push({at:this.time+2.4,p:b,text:lines[1]});a.chatRemaining=b.chatRemaining=6;a.yaw=Math.atan2(b.position.x-a.position.x,b.position.z-a.position.z);b.yaw=a.yaw+Math.PI;return true;
    }
    return false;
  }
  update(dt,{floor='ALL',active=true}={}){
    this.root.visible=this.shown;
    const visibility=()=>{for(const p of this.people)p.rig.root.visible=p.action!=='bathroom'&&(floor==='ALL'||(!p.transit&&floor===p.floor));};visibility();
    if(!active||this.paused||!this.shown)return;
    dt=Math.min(.05,Math.max(0,dt));this.time+=dt;const cache=new Map();let planned=false;
    for(const reply of this.pendingReplies.filter(r=>r.at<=this.time))this.say(reply.p,reply.text,4);this.pendingReplies=this.pendingReplies.filter(r=>r.at>this.time);
    if(this.time>=this.nextChat){this.conversation();this.nextChat=this.time+18+this.random()*10;}
    const people=this.people.slice(this.planCursor).concat(this.people.slice(0,this.planCursor));this.planCursor=(this.planCursor+1)%Math.max(1,this.people.length);
    for(const p of people){
      let moving=false;const doors=cache.get(p.floor)||this.doorSegments(p.floor);cache.set(p.floor,doors);
      if(p.chatRemaining>0){p.chatRemaining-=dt;}
      else if(p.transfer){const t=p.transfer;t.t=Math.min(1,t.t+dt/1.4);const ease=t.t*t.t*(3-2*t.t);p.position.lerpVectors(t.from,t.to,ease);p.position.y+=Math.sin(Math.PI*ease)*.35;p.rig.root.quaternion.slerpQuaternions(t.q0,t.q1,ease);if(t.t===1){p.transfer=null;if(t.waking)this.finish(p);else p.mode='activity';}}
      else if(p.transit){this.moveStairs(p,dt);moving=true;}
      else if(p.mode==='stair-wait'){p.wait-=dt;if(p.wait<=0){this.startStairs(p);p.wait=1;}}
      else if(p.mode==='activity'){p.remaining-=dt;if(p.remaining<=0){if(p.action==='sleep')this.bedTransfer(p,true);else this.finish(p);}}
      else if(p.path.length){
        const target=this.point(p.floor,p.path[0]),delta=target.clone().sub(p.position),distance=Math.hypot(delta.x,delta.z),amount=Math.min(distance,p.speed*dt),next=p.position.clone().lerp(target,distance?amount/distance:1);
        if(this.blocked(p.floor,next.x,next.z,doors,p)){p.blockedTime+=dt;p.action='wait';if(p.blockedTime>1.3){p.path=[];p.wait=.5+this.random();p.blockedTime=0;}}
        else{p.position.copy(next);moving=distance>.001;p.action='walk';p.blockedTime=0;if(moving){const desired=Math.atan2(delta.x,delta.z);p.yaw+=Math.atan2(Math.sin(desired-p.yaw),Math.cos(desired-p.yaw))*Math.min(1,dt*10);}if(distance<=amount+.0001){p.cell=p.path.shift();if(!p.path.length){if(p.yielding){p.yielding=false;p.navPurpose=null;p.wait=3;}else this.arrive(p);}}}
      }else{p.wait-=dt;if(p.wait<=0){if(!p.goal)this.selectGoal(p);if(p.goal&&!planned){this.plan(p,doors);planned=true;}}}
      p.rig.root.position.copy(p.position);if(!p.transfer&&p.action!=='sleep')p.rig.root.rotation.set(0,p.yaw,0);p.rig.pose(this.time+p.phase,moving,p.chatRemaining>0?'chat':p.action);
    }
    visibility();
  }
  setPaused(paused){this.paused=paused;}
}
