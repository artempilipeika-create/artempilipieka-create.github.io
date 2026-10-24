"""Measured room envelope and survey, saved with the project; no production geometry."""
from typing import Literal
from pydantic import Field, model_validator
from .auth_api import StrictModel

class RoomFeature(StrictModel):
    id: str=Field(min_length=1,max_length=80)
    kind: Literal['window','door','socket','switch','water','sewer','gas','ventilation','meter','radiator','column','shaft','gas_cooker','gas_boiler','water_heater']
    wall: Literal['a','b','c','d']
    label: str=Field(default='',max_length=100)
    offset: int=Field(ge=0,le=12000)
    elevation: int=Field(ge=0,le=5000)
    width: int=Field(ge=1,le=12000)
    height: int=Field(ge=1,le=5000)
    projection: int=Field(default=0,ge=0,le=3000)
    wall_gap: int=Field(default=0,ge=0,le=12000)
    notes: str=Field(default='',max_length=500)
    socket_count: int=Field(default=1,ge=1,le=4,strict=True)
    mount_id: str|None=Field(default=None,min_length=1,max_length=80)
    mount_face: Literal['front','start','end']='front'

def feature_box(f,room,host=None):
    """Measured XYZ envelope; mounted offsets follow the selected face, not the outer wall."""
    horizontal=f.wall in ('a','c')
    along=-(room.width if horizontal else room.depth)/2+f.offset+f.width/2
    x=room.width/2-f.projection/2-f.wall_gap if f.wall=='b' else -room.width/2+f.projection/2+f.wall_gap if f.wall=='d' else along
    z=-room.depth/2+f.projection/2+f.wall_gap if f.wall=='a' else room.depth/2-f.projection/2-f.wall_gap if f.wall=='c' else along
    w,d=(f.width,f.projection) if horizontal else (f.projection,f.width)
    if host:
        hx,_,hz,_,_,_=feature_box(host,room)
        ax,az=(1,0) if host.wall in ('a','c') else (0,1)
        nx,nz={'a':(0,1),'b':(-1,0),'c':(0,-1),'d':(1,0)}[host.wall]
        if f.mount_face=='front':
            x,z=hx+nx*host.projection/2-ax*host.width/2,hz+nz*host.projection/2-az*host.width/2
        else:
            sign=-1 if f.mount_face=='start' else 1
            x,z=hx+ax*sign*host.width/2-nx*host.projection/2,hz+az*sign*host.width/2-nz*host.projection/2
            ax,az,nx,nz=nx,nz,ax*sign,az*sign
        x+=ax*(f.offset+f.width/2)+nx*f.projection/2
        z+=az*(f.offset+f.width/2)+nz*f.projection/2
        w,d=(f.width,f.projection) if nz else (f.projection,f.width)
    return x,f.elevation+f.height/2,z,w,f.height,d

class Room(StrictModel):
    width: int=Field(default=4200,ge=1500,le=12000)
    depth: int=Field(default=3200,ge=1500,le=12000)
    height: int=Field(default=2700,ge=2000,le=5000)
    # None identifies earlier projects and does not assert that a survey took place.
    setup_complete: bool|None=None
    survey: Literal['none','present']|None=None
    features: list[RoomFeature]=Field(default_factory=list,max_length=100)

    @model_validator(mode='after')
    def measured_envelope(self):
        ids=set()
        for f in self.features:
            if f.id in ids:raise ValueError('Duplicate room feature id')
            ids.add(f.id)
            span=self.width if f.wall in ('a','c') else self.depth
            cross=self.depth if f.wall in ('a','c') else self.width
            if (not f.mount_id and (f.offset+f.width>span or f.projection+f.wall_gap>cross)) or f.elevation+f.height>self.height:
                raise ValueError('Room feature outside measured envelope')
            if f.kind=='shaft' and (f.elevation!=0 or f.projection<1):raise ValueError('Shaft must start at floor and have positive depth')
            if f.kind=='door' and f.elevation!=0:raise ValueError('Door must start at floor')
            if f.wall_gap and f.kind not in ('radiator','gas_cooker','gas_boiler','water_heater'):raise ValueError('Wall gap applies only to equipment')
            if f.kind=='gas_cooker' and f.elevation!=0:raise ValueError('Cooker must stand on floor')
            if f.kind in ('gas_cooker','gas_boiler','water_heater') and f.projection<1:raise ValueError('Equipment must have positive depth')
            if f.kind!='socket' and (f.mount_id or f.socket_count!=1 or f.mount_face!='front'):raise ValueError('Mount and count apply only to sockets')
            host=None
            if f.mount_id:
                host=next((h for h in self.features if h.id==f.mount_id and h.kind in ('shaft','column')),None)
                if host is None:raise ValueError('Socket mounting surface is missing')
                length=host.width if f.mount_face=='front' else host.projection
                if f.offset+f.width>length or f.elevation<host.elevation or f.elevation+f.height>host.elevation+host.height:raise ValueError('Socket outside mounting face')
                x,y,z,w,h,d=feature_box(f,self,host)
                if x-w/2< -self.width/2-.5 or x+w/2>self.width/2+.5 or z-d/2< -self.depth/2-.5 or z+d/2>self.depth/2+.5:raise ValueError('Socket outside room')
            if f.kind=='socket':
                x,y,z,w,h,d=feature_box(f,self,host)
                for solid in self.features:
                    if solid.kind not in ('shaft','column') or solid.projection<=0:continue
                    sx,sy,sz,sw,sh,sd=feature_box(solid,self)
                    if abs(x-sx)<(w+sw)/2-.5 and abs(z-sz)<(d+sd)/2-.5 and abs(y-sy)<(h+sh)/2-.5:raise ValueError('Socket intersects a wall protrusion')
        # Dimensions are sufficient to start; retain explicit surveys in existing projects.
        if self.setup_complete and self.survey is not None:
            if (self.survey=='present')!=bool(self.features):raise ValueError('Room survey and features disagree')
        return self
