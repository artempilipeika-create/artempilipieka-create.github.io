import {clone} from './furniture-core.mjs';
const key=s=>JSON.stringify([s.name,s.scene.room,s.scene.items,s.scene.upper_row_elevation_mm]);
export class History{
  constructor(adapter,limit=80){this.adapter=adapter;this.limit=limit;this.undoStack=[];this.redoStack=[];this.pending=null;this.onChange=()=>{};}
  reset(){this.undoStack=[];this.redoStack=[];this.pending=null;this.onChange();}
  begin(label){if(!this.pending)this.pending={label,before:clone(this.adapter.snapshot())};}
  commit(){
    if(!this.pending)return;
    const {label,before}=this.pending,after=clone(this.adapter.snapshot());this.pending=null;
    if(key(before)!==key(after)){
      this.undoStack.push({label,before,after});if(this.undoStack.length>this.limit)this.undoStack.shift();this.redoStack=[];
    }
    this.onChange();
  }
  cancel(){const p=this.pending;this.pending=null;if(p)this.adapter.restore(p.before);this.onChange();}
  run(label,fn){this.begin(label);try{const result=fn();this.commit();return result;}catch(error){this.cancel();throw error;}}
  undo(){this.commit();const e=this.undoStack.pop();if(!e)return;this.adapter.restore(e.before);this.redoStack.push(e);this.onChange();}
  redo(){this.commit();const e=this.redoStack.pop();if(!e)return;this.adapter.restore(e.after);this.undoStack.push(e);this.onChange();}
}
