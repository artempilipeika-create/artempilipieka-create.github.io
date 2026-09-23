"""Edge-only AUTO. Manual SKU and explicit manual NONE are equally protected."""
from copy import deepcopy
from .catalogue_model import decimal


def compatible(material,edge):
    if not material or not edge: return False
    thickness,width=decimal(material.get('thickness')),decimal(edge.get('width'))
    return thickness is not None and width is not None and width>=thickness


def apply_auto(snapshot,edge_items,mappings):
    result=deepcopy(snapshot); material=result.get('resolution',{}).get('selected')
    edges={e['edge_id']:e for e in edge_items}
    approved=[m for m in mappings if material and str(m['variant_id'])==material['variant_id'] and str(m['edge_id']) in edges]
    mapping=max(approved,key=lambda m:m['version']) if approved else None
    for side,state in result.get('edges',{}).items():
        state['warnings']=[]
        if state.get('mode')=='manual_override':
            eid=state.get('edge_id')
            if eid and not compatible(material,edges.get(eid)):
                state['warnings'].append('manual_edge_incompatible_or_absent_in_release')
        elif state.get('mark')=='none':
            state.update(edge_id=None,confirmed=False,mode='auto_suggestion',candidates=[])
        elif state.get('conflict') or state.get('raw_sku') is not None:
            # An imported exact SKU is not permission to replace it with a default.
            state.update(edge_id=None,confirmed=False,mode='auto_suggestion',candidates=[e['edge_id'] for e in edge_items if e.get('article')==state.get('raw_sku')])
        elif mapping and compatible(material,edges[str(mapping['edge_id'])]):
            state.update(mode='confirmed_database_mapping',edge_id=str(mapping['edge_id']),confirmed=True,
                         mapping_id=str(mapping['mapping_id']),mapping_version=mapping['version'],
                         snapshot=deepcopy(edges[str(mapping['edge_id'])]))
        else:
            code=material.get('article') if material else None
            suggestions=[e['edge_id'] for e in edge_items if code and code in (e.get('designation') or '')]
            state.update(mode='auto_suggestion',edge_id=None,confirmed=False,candidates=suggestions)
            for key in ('mapping_id','mapping_version','snapshot'): state.pop(key,None)
    return result
