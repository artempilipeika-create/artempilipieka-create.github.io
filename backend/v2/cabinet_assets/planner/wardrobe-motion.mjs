// Runtime viewing poses in millimetres. The project items are read-only here.
const rad=Math.PI/180,unit=.001;
const advance=(value,target,amount)=>value<target?Math.min(target,value+amount):Math.max(target,value-amount);
const smooth=v=>v*v*(3-2*v);
export function drawerKey(item){
  return item?.item_id?.match(/:drawer-(\d+-\d+)-(?:face|front|rear|bottom|side-left|side-right)$/)?.[1]??null;
}

export class WardrobeMotion{
  constructor(){this.reset();}
  reset(){
    this.id=null;this.open=false;this.door=0;this.extension=0;
    this.requested=null;this.shown=null;this.lastTime=null;this.changed=true;
  }
  show(id){
    if(this.id!==id)this.reset();
    this.id=id;this.open=true;this.changed=true;
  }
  close(){this.open=false;this.requested=null;this.changed=true;}
  toggleDrawer(key){
    if(!this.open||!key)return;
    this.requested=this.requested===key?null:key;this.changed=true;
  }
  step(time,reduced=false){
    const dt=this.lastTime==null?0:Math.min(80,Math.max(0,time-this.lastTime));
    const oldDoor=this.door,oldExtension=this.extension,oldShown=this.shown;
    if(reduced){
      this.door=Number(this.open);this.shown=this.requested;this.extension=Number(Boolean(this.shown));
    }else{
      if(this.open||!this.extension)this.door=advance(this.door,Number(this.open),dt/380);
      if(this.shown!==this.requested){
        this.extension=advance(this.extension,0,dt/300);
        if(!this.extension)this.shown=this.requested;
      }
      if(this.shown&&this.shown===this.requested&&this.door===1)this.extension=advance(this.extension,1,dt/300);
    }
    if(!this.open&&!this.door&&!this.extension)this.id=null;
    this.dirty=this.changed||oldDoor!==this.door||oldExtension!==this.extension||oldShown!==this.shown;
    this.changed=false;
    const moving=this.door!==Number(this.open)||this.shown!==this.requested||this.extension!==Number(Boolean(this.requested));
    this.lastTime=moving?time:null;
    return moving;
  }
  pose(entries,items){
    const side=this.shown&&items.find(it=>it.assistant_carcass?.group_id===this.id&&it.item_id.endsWith(':drawer-'+this.shown+'-side-left'));
    const travel=(side?.depth||0)*unit*.82*smooth(this.extension);
    for(const it of items){
      const g=entries.get(it.item_id)?.group;
      if(!g)continue;
      const active=Boolean(this.id)&&it.assistant_carcass?.group_id===this.id;
      if(!active&&!g.userData.wardrobePosed)continue;
      const leaf=it.item_id.match(/:door-(?:(?:lower|upper)-)?(left|right)$/),key=drawerKey(it);
      if(!leaf&&!key)continue;
      let angle=0,dx=0,dz=0;
      if(leaf&&active){
        const sign=leaf[1]==='left'?-1:1;
        const pivotX=sign*(it.width/2-1.5)*unit,pivotZ=it.depth*.5*unit;
        angle=sign*Math.PI*.5*smooth(this.door);
        dx=pivotX*(1-Math.cos(angle))-pivotZ*Math.sin(angle);
        dz=pivotZ*(1-Math.cos(angle))+pivotX*Math.sin(angle);
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
