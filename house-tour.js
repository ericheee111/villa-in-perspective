import { FamilyLife } from './family-life.js?v=2';

const CAST=[{id:'guide',name:'销售小林',shirt:0x496c70,hair:0x463b32,style:'short',scale:.84},{id:'visitor1',name:'陈先生',shirt:0xa69777,hair:0x373831,style:'short',scale:.80},{id:'visitor2',name:'林女士',shirt:0xb58d94,hair:0x564133,style:'buns',scale:.80},{id:'visitor3',name:'小朋友',shirt:0x8aaf91,hair:0x43392d,style:'bob',scale:.67}];

export class HouseTour extends FamilyLife {
  constructor(nav,devices,layout,definition,appliances,onChange=()=>{}){super(nav,devices,layout);this.definition=definition;this.appliances=appliances;this.onChange=onChange;this.active=false;this.index=0;this.phase='idle';this.elapsed=0;this.speedFactor=1;this.root.name='Guided_House_Tour';this.root.visible=false;}
  addFloor(floor){this.ready.add(floor);}
  get stop(){return this.definition.stops[this.index];}
  start(){
    if(this.ready.size<3)return false;
    if(!this.people.length)for(const [i,profile] of CAST.entries()){const anchor=this.definition.stops[0].formation[i].position;const p=this.addPerson({...profile,floor:'F1',seed:[anchor[0],anchor[2]]});if(!p)throw new Error('Missing tour entrance');p.initial={cell:p.cell,position:p.position.clone()};p.speed=1.10-i*.035;}
    this.time=0;this.stairLocks.clear();this.pendingReplies=[];this.paused=false;this.active=true;this.shown=true;
    for(const p of this.people){p.position.copy(p.initial.position);p.floor='F1';p.cell=p.initial.cell;p.component=this.navigation.floors.F1.components[0];p.transit=null;p.transfer=null;p.preparing=null;p.speech=null;p.yielding=false;p.chatRemaining=0;p.hold=false;p.goal=null;}
    this.setStop(0);return true;
  }
  setStop(index){
    this.appliances.release('tour');this.index=Math.max(0,Math.min(this.definition.stops.length-1,index));this.phase='walking';this.elapsed=0;this.lineIndex=-1;this.blockedNotice=false;
    for(const [i,p] of this.people.entries()){const formation=this.stop.formation[i];p.tourGoal={id:'tour-'+this.index+'-'+p.id,action:p.id==='guide'?'guide':'listen',floor:this.stop.floor,cell:formation.cell,position:formation.position,look:[this.stop.focus[0],this.stop.focus[2]]};p.goal=p.tourGoal;p.path=[];p.navPurpose=null;p.wait=i*1.3;p.failures=0;if(!p.transit){p.mode='route';p.action='walk';}p.hold=false;p.chatRemaining=0;p.speech=null;}
    this.onChange({type:'move',index:this.index,stop:this.stop});
  }
  next(){if(!this.active)return;if(this.index===this.definition.stops.length-1)this.end(true);else this.setStop(this.index+1);}
  previous(){if(this.active)this.setStop(this.index-1);}
  end(completed=false){this.active=false;this.root.visible=false;this.stairLocks.clear();this.appliances.release('tour');this.onChange({type:completed?'complete':'end',index:this.index,stop:this.stop});}
  selectGoal(p){p.goal=p.tourGoal;p.path=[];p.navPurpose=null;p.mode='route';p.wait=.3;p.failures=0;}
  finish(p){p.goal=null;p.path=[];p.navPurpose=null;p.mode='idle';p.action='wait';p.wait=1.2;p.failures=0;}
  conversation(){return false;}
  findPath(person,goal,doors){
    const path=super.findPath(person,goal,doors);if(path.length||this.time<(this.nextYieldAttempt||0))return path;
    this.nextYieldAttempt=this.time+1.2;const clearPath=super.findPath(person,goal,doors,true);if(!clearPath.length)return path;
    const points=clearPath.map(i=>this.point(person.floor,i)),blocker=this.people.find(p=>p!==person&&p.floor===person.floor&&!p.transit&&!p.yielding&&!p.path.length&&points.some(q=>q.distanceTo(p.position)<.56));
    if(!blocker)return path;
    for(const radius of [.85,1.2,1.6,2.0])for(let i=0;i<16;i++){
      const angle=i*Math.PI/8,x=blocker.position.x+Math.cos(angle)*radius,z=blocker.position.z+Math.sin(angle)*radius,cell=this.cell(blocker.floor,x,z);
      if(this.blocked(blocker.floor,x,z,doors,blocker)||points.some(q=>Math.hypot(q.x-x,q.z-z)<.63))continue;
      const retreat=super.findPath(blocker,cell,doors);if(!retreat.length)continue;blocker.path=retreat;blocker.mode='route';blocker.yielding=true;blocker.hold=false;blocker.wait=0;return path;
    }
    return path;
  }
  arrive(p){if(p.navPurpose?.type==='stairs'){super.arrive(p);return;}p.mode='activity';p.action=p.id==='guide'?'guide':'listen';p.remaining=Infinity;const focus=p.id==='guide'?this.stop.focus:this.people[0].position.toArray();p.yaw=Math.atan2(focus[0]-p.position.x,focus[2]-p.position.z);}
  status(p){return p.transit?'跟随队伍上下楼':p.mode==='activity'?(p.id==='guide'?'介绍'+this.stop.title:'听取介绍'):'前往'+this.stop.title;}
  update(dt,options={}){
    if(!this.active){this.root.visible=false;return;}
    const active=options.active!==false&&!this.paused;
    const leader=this.people[0];for(const p of this.people)p.hold=false;
    super.update(dt,options);if(!active)return;dt=Math.min(.05,Math.max(0,dt));this.elapsed+=dt;
    if(this.phase==='walking'){
      if(this.people.every(p=>p.mode==='activity'&&p.floor===this.stop.floor)){this.phase='presenting';this.elapsed=0;this.appliances.acquireLight('tour',this.stop.light,this.stop.id!=='cinema',50);if(this.stop.id==='cinema')this.appliances.watch('tour');this.onChange({type:'arrive',index:this.index,stop:this.stop});}
      else if(this.elapsed>90&&!this.blockedNotice){this.blockedNotice=true;this.onChange({type:'waiting',index:this.index,stop:this.stop});}
    }
    if(this.phase==='presenting'){
      if(options.narrationBusy&&this.lineIndex>=0)this.elapsed=Math.min(this.elapsed,([11,16,this.stop.duration][this.lineIndex])-.001);
      const line=this.elapsed<11?0:this.elapsed<16?1:2;if(line!==this.lineIndex){this.lineIndex=line;const person=line===1?this.people[2]:leader,text=[this.stop.intro,this.stop.question,this.stop.answer][line];this.say(person,text,line===1?5:11);this.onChange({type:'line',index:this.index,stop:this.stop,text,speaker:person.name});}
      if(this.elapsed>=this.stop.duration)this.next();
    }
  }
}
