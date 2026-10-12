// Pure persistence coordinator. A request always belongs to its captured draft,
// never to whichever project happens to be on screen when the response arrives.
const copy=value=>JSON.parse(JSON.stringify(value));
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])])):value;
export function fingerprint(snapshot){
  const scene=copy(snapshot.scene);delete scene.selected_item_id;delete scene.view_mode;
  return JSON.stringify(ordered({name:snapshot.name.trim()||'3D-проект',scene}));
}
export class ProjectAutosave {
  constructor({snapshot,meta=null,record=null,send,persist,ack=()=>{},changed=()=>{},uuid=()=>crypto.randomUUID()}){
    this.send=send;this.persist=persist;this.ack=ack;this.changed=changed;this.uuid=uuid;
    this.id=record?.id||uuid();this.snapshot=copy(record?.snapshot||snapshot);this.meta=copy(record?.meta||meta);
    this.baseline=record?.baseline??fingerprint(snapshot);this.pending=record?.pending||null;
    this.operation=record?.operation||null;
    this.error=null;this.localError=null;this.busy=null;
  }
  get dirty(){return Boolean(this.pending)||fingerprint(this.snapshot)!==this.baseline;}
  get conflict(){return this.error?.status===409||this.error?.message==='PROJECT_3D_VERSION_CONFLICT';}
  record(){return copy({format:1,id:this.id,meta:this.meta,snapshot:this.snapshot,baseline:this.baseline,pending:this.pending,operation:this.operation,updated_at:new Date().toISOString()});}
  write(){try{this.persist(this.record(),this.dirty||Boolean(this.operation));this.localError=null;}catch(error){this.localError=error;}this.changed();}
  capture(snapshot){
    this.snapshot=copy(snapshot);
    // A definite validation rejection wrote nothing. Undo back to the last
    // acknowledged scene is already safe, and needs no redundant save/retry.
    if(!this.dirty&&this.error?.status===422)this.error=null;
    this.write();
  }
  flush(force=false){
    if(this.busy)return this.busy;
    if(this.conflict)return Promise.reject(this.error);
    this.busy=this.run(force).finally(()=>{this.busy=null;this.changed();});this.changed();return this.busy;
  }
  async run(force){
    while(this.dirty||(force&&!this.meta)){
      force=false;
      if(!this.pending){this.pending={snapshot:copy(this.snapshot),meta:copy(this.meta),request_id:this.uuid()};this.write();}
      const sent=this.pending;
      try{
        const result=await this.send(sent.snapshot,sent.meta,sent.request_id);
        this.meta={project_id:result.project_id,version:result.version};
        this.baseline=fingerprint(sent.snapshot);this.pending=null;this.error=null;
        this.ack(result);this.write();
      }catch(error){
        this.error=error;
        // A definite rejection did not write anything. Allow a corrected scene
        // to be sent; uncertain network/5xx replies must retry the identical ID.
        if(error.status>=400&&error.status<500&&error.status!==409&&error.status!==408&&error.status!==429)this.pending=null;
        this.write();throw error;
      }
    }
    return this.meta;
  }
}
