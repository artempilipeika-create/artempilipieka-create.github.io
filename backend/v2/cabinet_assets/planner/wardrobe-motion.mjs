// Runtime viewing poses in millimetres. The project items are read-only here.
import {drawerStroke,hingePose,slidingKey} from './wardrobe-clearance.mjs';
export {slidingKey as drawerKey};
const rad=Math.PI/180,unit=.001;
const advance=(value,target,amount)=>value<target?Math.min(target,value+amount):Math.max(target,value-amount);
const smooth=v=>v*v*(3-2*v);
export class WardrobeMotion{
  constructor(){this.reset();}
  reset(){
    this.id=null;this.open=false;this.door=0;this.extension=0;
    this.angles=new Map();this.defaultDegrees=90;this.leaf=null;this.drawer=null;
    this.contact=null;this.message='';this.limit=1;
    this.requested=null;this.shown=null;this.lastTime=null;this.changed=true;
  }
  show(id){
    if(this.id!==id)this.reset();
    this.id=id;this.open=true;this.changed=true;
  }
  degrees(id){return this.angles.get(id)??this.defaultDegrees;}
  setDegrees(id,degrees){
    this.angles.set(id,degrees);this.leaf=id;this.door=1;this.changed=true;
  }
  close(){this.open=false;this.requested=null;this.contact=null;this.message='';this.changed=true;}
  toggleDrawer(key,limit=1){
    if(!this.open||!key)return;
    this.requested=this.requested===key?null:key;
    this.limit=Math.max(0,Math.min(1,limit));this.drawer=key;this.changed=true;
  }
  step(time,reduced=false){
    const dt=this.lastTime==null?0:Math.min(80,Math.max(0,time-this.lastTime));
    const oldDoor=this.door,oldExtension=this.extension,oldShown=this.shown;
    if(reduced){
      this.door=Number(this.open);this.shown=this.requested;this.extension=this.shown?this.limit:0;
    }else{
      if(this.open||!this.extension)this.door=advance(this.door,Number(this.open),dt/380);
      if(this.shown!==this.requested){
        this.extension=advance(this.extension,0,dt/300);
        if(!this.extension)this.shown=this.requested;
      }
      if(this.shown&&this.shown===this.requested&&this.door===1)this.extension=advance(this.extension,this.limit,dt/300);
    }
    if(!this.open&&!this.door&&!this.extension)this.id=null;
    this.dirty=this.changed||oldDoor!==this.door||oldExtension!==this.extension||oldShown!==this.shown;
    this.changed=false;
    const moving=this.door!==Number(this.open)||this.shown!==this.requested||this.extension!==(this.requested?this.limit:0);
    this.lastTime=moving?time:null;
    return moving;
  }
  pose(entries,items){
    const travel=this.shown?drawerStroke(items,this.id,this.shown)*unit*this.extension:0;
    for(const it of items){
      const g=entries.get(it.item_id)?.group;
      if(!g)continue;
      const active=Boolean(this.id)&&it.assistant_carcass?.group_id===this.id;
      if(!active&&!g.userData.wardrobePosed)continue;
      const leaf=it.item_id.match(/:door-(?:(?:lower|upper)-)?(left|right)$/),key=slidingKey(it);
      if(!leaf&&!key)continue;
      let angle=0,dx=0,dz=0;
      if(leaf&&active){
        const p=hingePose(it,this.degrees(it.item_id)*smooth(this.door));
        angle=p.a;dx=p.dx*unit;dz=p.dz*unit;
      }
      const slide=active&&key&&key===this.shown?travel:0;
      if(key){
        dz+=slide;
        for(const part of g.children)if(part.userData.drawerRail)part.position.z=(part.userData.railTravel-1)*slide;
      }
      const base=-(it.rotation||0)*rad;
      g.position.x=it.x*unit+dx*Math.cos(base)+dz*Math.sin(base);
      g.position.z=it.z*unit-dx*Math.sin(base)+dz*Math.cos(base);
      g.rotation.y=base+angle;
      g.userData.wardrobePosed=active;
    }
  }
}
