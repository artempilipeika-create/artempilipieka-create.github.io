"""Server-only deterministic OBLX preview. Native semantics require separate calibration.

No browser XML, timestamps, UUID XML fields, money, PII or inferred local mappings.
The legacy XML shape is provenance, never proof of native interpretation.
"""
from collections import defaultdict
from copy import deepcopy
from decimal import Decimal
import re
import xml.etree.ElementTree as ET
from .calculation_math import dec, plain, hash_value

VERSION = 'mf-server-oblx-v1'
SIDES = {'L1':'TopEdge_L1','L2':'BottomEdge_L2','W1':'LeftEdge_W1','W2':'RightEdge_W2'}
PREVIEW = {
    'version':'mf-oblx-preview-v1', 'exporter_version':VERSION,
    'mode':'internal_preview', 'native_calibration':'NOT VERIFIED',
    'orient':{'none':'N','length':'Y','width':'Y'},
    'without_but':'unchanged_dimensions', 'edge_allowance':'thickness',
    'edge_overhung':'50', 'edge_clip':'Y', 'edge_butt_type':'1',
    'rotation':'manifest_only', 'axes':'NOT VERIFIED',
    'result_format':'mf-native-result-v1',
}


def text(value, maximum=200):
    value = '' if value is None else str(value)
    if len(value)>maximum or any(ord(c)<32 and c not in '\t\n\r' or 0xD800<=ord(c)<=0xDFFF or ord(c) in (0xFFFE,0xFFFF) for c in value):
        raise ValueError('UNSUPPORTED_XML_TEXT')
    return value


def number(value):
    n=dec(value)
    if not n.is_finite() or n<0 or n>100000: raise ValueError('INVALID_NATIVE_NUMBER')
    return format(n.normalize(),'f')


def identity(item, kind):
    if not item: raise ValueError('EXACT_IDENTITY_REQUIRED')
    keys=('variant_id','material_id','edge_id','article','name','manufacturer','decor','structure','family',
          'length','width','thickness','catalogue_release')
    out={k:item[k] for k in keys if k in item}
    for key in ('thickness','width') + (('length',) if kind=='material' else ()):
        if dec(out.get(key,0))<=0: raise ValueError('EXACT_GEOMETRY_REQUIRED')
        out[key]=number(out[key])
    for k in ('name','article','manufacturer','decor','structure'): 
        if k in out: text(out[k])
    out['identity_sha256']=hash_value(out)
    return out


def manufacturing_input(revision, calculation, export_profile):
    content=revision['content'];snapshot=calculation['input_snapshot'];profile=snapshot['production_profile']
    if (hash_value(content)!=revision['content_hash'] or snapshot['revision_hash']!=revision['content_hash']
        or hash_value(snapshot)!=calculation['input_hash'] or snapshot['revision']!=content):
        raise ValueError('INPUT_SEAL_MISMATCH')
    if content.get('issues'): raise ValueError('REVISION_ISSUES_UNRESOLVED')
    if export_profile['exporter_version']!=VERSION: raise ValueError('EXPORTER_VERSION_UNSUPPORTED')
    parts=[];recipes={r['finished_detail_id']:r for r in calculation['result']['manufacturing_recipes']}
    details=content.get('details',[])
    if not 1<=len(details)<=1000: raise ValueError('DETAIL_COUNT_LIMIT')
    seen=set();total=0
    source_rows={str(r['draft_row_id']):r['snapshot'] for r in content.get('source_evidence',{}).get('draft_rows',[])}
    for d in sorted(details,key=lambda x:x['detail_id']):
        did=text(d['detail_id'],100)
        if did in seen: raise ValueError('DUPLICATE_DETAIL_ID')
        seen.add(did)
        q=d['qty'];length=number(d['length']);width=number(d['width'])
        if type(q) is not int or not 1<=q<=5000 or min(dec(length),dec(width))<=0: raise ValueError('INVALID_GEOMETRY_OR_QTY')
        if d['grain'] not in ('none','length','width') or type(d['rotation']) is not bool: raise ValueError('ORIENTATION_REQUIRED')
        m=identity(d['material'],'material');customer=d['supply_source']=='customer'
        if not m.get('variant_id') and not (customer and d.get('customer_material_key')): raise ValueError('EXACT_MATERIAL_REQUIRED')
        if m.get('variant_id') and str(m.get('catalogue_release'))!=str(revision['catalogue_release_id']): raise ValueError('CATALOGUE_CONFLICT')
        if customer and (not d.get('provided_sheets') or not d.get('customer_reason')): raise ValueError('CUSTOMER_INPUT_REQUIRED')
        material_key=m.get('variant_id') or 'customer:'+text(d['customer_material_key'],80)
        assignments={}
        if set(d['edges'])-set(SIDES): raise ValueError('UNKNOWN_EDGE_SIDE')
        for side in SIDES:
            a=d['edges'].get(side,{'edge':None,'state':'confirmed','supply_source':'company'})
            if a.get('state')!='confirmed': raise ValueError('EXACT_EDGE_REQUIRED')
            e=identity(a['edge'],'edge') if a.get('edge') else None
            if e and (not e.get('edge_id') or str(e.get('catalogue_release'))!=str(revision['catalogue_release_id'])): raise ValueError('EXACT_EDGE_REQUIRED')
            original=source_rows.get(str(d.get('draft_row_id')),{}).get('edges',{}).get(side,{})
            assignments[side]={'edge':e,'supply_source':a['supply_source'],
                'mode':original.get('mode','explicit_revision' if side in d['edges'] else 'none'),
                'manual_lock':bool(original.get('mode') in ('manual','manual_override') or side in d['edges']),
                'assignment_sha256':hash_value(a)}
        blank={'detail_id':did,'length':length,'width':width,'qty':q,'edges':assignments}
        recipe=None
        if d['route']=='glued_18_18':
            recipe=deepcopy(recipes.get(did))
            if not recipe: raise ValueError('SEALED_GLUE_RECIPE_REQUIRED')
            settings=profile['settings']
            expected=(dec(length)+2*dec(settings['glue_allowance_each_side_mm']),dec(width)+2*dec(settings['glue_allowance_each_side_mm']),q*settings['glue_layers'])
            if (dec(recipe['blank_length']),dec(recipe['blank_width']),recipe['child_qty'])!=expected or dec(m['thickness'])!=18:
                raise ValueError('RECIPE_SEAL_MISMATCH')
            blank={'detail_id':recipe['child_blank_id'],'length':number(recipe['blank_length']),'width':number(recipe['blank_width']),
                'qty':recipe['child_qty'],'edges':{s:{'edge':None,'supply_source':'company','mode':'recipe_child_blank','manual_lock':True} for s in SIDES}}
        elif d['route']!='solid': raise ValueError('UNSUPPORTED_MANUFACTURING_ROUTE')
        total+=blank['qty']
        parts.append({'finished_detail_id':did,'finished_length':length,'finished_width':width,'finished_qty':q,
            'material_key':material_key,'material':m,'supply_source':d['supply_source'],
            'provided_sheets':d.get('provided_sheets') if customer else None,'grain':d['grain'],'rotation_allowed':d['rotation'],
            'finished_edges':assignments,'route':d['route'],'recipe':recipe,'blank':blank})
    if total>20000: raise ValueError('TOTAL_QUANTITY_LIMIT')
    return plain({'schema_version':2,'exporter_version':VERSION,'export_profile':export_profile,
        'production_profile_version':profile['profile_id'],'production_settings':profile['settings'],
        'catalogue_release_id':revision['catalogue_release_id'],'parts':parts})


def export(manufacturing, display_number):
    p=manufacturing['export_profile']
    if p['version']!=PREVIEW['version'] or p!=PREVIEW:
        # New calibrated geometry is a versioned code change, never arbitrary XML templates.
        raise ValueError('EXPORT_PROFILE_NOT_IMPLEMENTED')
    if not re.fullmatch(r'MF-[0-9]{1,20}',display_number): raise ValueError('SAFE_PRODUCTION_NUMBER_REQUIRED')
    root=ET.Element('Root',Programm=VERSION)
    def field(node,name,value=''): ET.SubElement(node,name).text=text(value,1000)
    field(root,'Order',display_number);field(root,'OrderComment','INTERNAL PREVIEW — native calibration required')
    field(root,'NumberOfSets','1');materials=ET.SubElement(root,'Materials')
    groups=defaultdict(list)
    for part in manufacturing['parts']: groups[(part['material_key'],part['supply_source'])].append(part)
    position=0
    for key,parts in sorted(groups.items()):
        m=parts[0]['material']
        if any(x['material']!=m for x in parts): raise ValueError('MATERIAL_IDENTITY_CONFLICT')
        node=ET.SubElement(materials,'Material')
        for k,v in [('Name',m['name']),('Code',m.get('article')),('Thickness',number(m['thickness'])),('Type','Y')]: field(node,k,v)
        details=ET.SubElement(node,'Details')
        for part in sorted(parts,key=lambda x:x['finished_detail_id']):
            position+=1;b=part['blank'];d=ET.SubElement(details,'Detail')
            for k,v in [('ToCut','Y'),('B3DModel',''),('Pos',position),('Name','Part '+str(position)),('Designation',''),
                        ('Length',b['length']),('Width',b['width']),('WithoutButLength',b['length']),('WithoutButWidth',b['width']),
                        ('Count',b['qty']),('Orient',p['orient'][part['grain']])]: field(d,k,v)
            for side,tag in SIDES.items():
                edge=b['edges'][side]['edge'];n=ET.SubElement(d,tag)
                values=[('Name',edge['name'] if edge else ''),('Code',edge.get('article') if edge else ''),
                    ('Sign',edge.get('article') if edge else ''),('Thickness',number(edge['thickness']) if edge else '0'),
                    ('Allowance',number(edge['thickness']) if edge else '0'),('Overhung',p['edge_overhung'] if edge else '0'),
                    ('Clip',p['edge_clip'] if edge else 'N'),('ButtType',p['edge_butt_type'] if edge else '2')]
                for k,v in values: field(n,k,v)
            for k,v in [('UserProperty',''),('Grove',''),('Comment','Вращение разрешено.' if part['rotation_allowed'] else 'Вращение запрещено.'),
                        ('Priority','0'),('PlasticType','0'),('FrontPlastics',''),('BackPlastics','')]: field(d,k,v)
    return ET.tostring(root,encoding='utf-8',xml_declaration=True,short_empty_elements=True)


def inspect(data):
    """Bounded structural inspection; explicitly NOT a native BAZIS validator."""
    if len(data)>4*1024*1024 or b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper(): raise ValueError('UNSAFE_XML')
    decoded=data.decode('utf-8-sig')
    if '\x00' in decoded or '<!DOCTYPE' in decoded.upper() or '<!ENTITY' in decoded.upper(): raise ValueError('UNSAFE_XML')
    declaration=re.match(r'''\s*<\?xml[^?]*encoding=[\"']([^\"']+)''',decoded,re.I)
    if declaration and declaration.group(1).lower() not in ('utf-8','utf8'): raise ValueError('UNSUPPORTED_XML_ENCODING')
    root=ET.fromstring(data)
    if root.tag!='Root' or len(list(root.iter()))>50000: raise ValueError('XML_STRUCTURE_LIMIT')
    materials=root.findall('./Materials/Material');details=root.findall('./Materials/Material/Details/Detail')
    return {'programm':root.get('Programm'),'sets':root.findtext('NumberOfSets'),
        'materials':len(materials),'positions':len(details),'parts':sum(int(d.findtext('Count')) for d in details),
        'details':[{'length':d.findtext('Length'),'width':d.findtext('Width'),'qty':int(d.findtext('Count')),
            'orient':d.findtext('Orient'),'edges':{s:d.findtext(t+'/Code') or '' for s,t in SIDES.items()}} for d in details],
        'native_calibration':'NOT VERIFIED'}
