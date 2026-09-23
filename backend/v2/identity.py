"""Strict resolution is deliberately independent from broad catalogue search."""
from .catalogue_model import canonical, dimension, matches, safe_item

STATES={'exact_match','confirmed_mapping','unresolved','ambiguous','manual_override','custom_customer'}


def conflicts(raw,item):
    result=[]
    for field,key in [('manufacturer','raw_manufacturer'),('structure','raw_structure')]:
        supplied=canonical(raw.get(key))
        if supplied and supplied!=canonical(item.get(field)): result.append(field)
    for field,key in [('thickness','raw_thickness'),('length','raw_format_length'),('width','raw_format_width')]:
        supplied=raw.get(key)
        if supplied not in (None,'') and (not dimension(supplied) or dimension(supplied)!=dimension(item.get(field))): result.append(field)
    return result


def resolve(raw,catalogue,release,aliases=(),namespace='client'):
    article=canonical(raw.get('raw_article')); name=canonical(raw.get('raw_material_name'))
    exact=[i for i in catalogue if (article and article==canonical(i.get('article'))) or
           (not article and name and not i.get('article') and name==canonical(i.get('name')))]
    possible=[i for i in exact if not conflicts(raw,i)]
    result={'status':'unresolved','method':'strict_features','raw':raw,'selected':None,
            'candidates':[i['variant_id'] for i in exact], 'reason':'Материал требует согласования',
            'confirmed_by':None,'confirmed_at':None,'mapping_version':None,'mapping_id':None,
            'catalogue_release':str(release)}
    # Exact requires all physical facts provided. A missing manufacturer is not a guessed one.
    required=('raw_thickness','raw_format_length','raw_format_width')
    complete=all(raw.get(k) not in (None,'') for k in required)
    if len(possible)==1 and complete:
        i=possible[0]
        if i.get('manufacturer') and canonical(raw.get('raw_manufacturer'))==canonical(i['manufacturer']) and \
           (not i.get('structure') or canonical(raw.get('raw_structure'))==canonical(i['structure'])):
            result.update(status='exact_match',selected=safe_item(i,release),reason='Exact full article/name and supplied physical features')
            return result
    if len(possible)>1 or (exact and not possible):
        result.update(status='ambiguous',reason='Physical identity conflict or multiple exact variants')
    # A versioned approved alias may resolve a spelling, never override physical conflicts.
    candidates=[]
    for alias in aliases:
        if alias['source_namespace']!=namespace or alias['source_value']!=(article or name): continue
        if alias.get('manufacturer') and alias['manufacturer']!=canonical(raw.get('raw_manufacturer')): continue
        i=next((x for x in catalogue if x['variant_id']==str(alias['variant_id'])),None)
        if i and not conflicts(raw,i): candidates.append((alias,i))
    if len(candidates)==1:
        a,i=candidates[0]
        result.update(status='confirmed_mapping',method='approved_alias',selected=safe_item(i,release),
            reason=a['reason'],confirmed_by=str(a['approved_by']),confirmed_at=str(a['approved_at']),
            mapping_id=str(a['alias_id']),mapping_version=a['version'])
    elif len(candidates)>1: result.update(status='ambiguous',reason='Multiple approved aliases')
    if not result['candidates']:
        result['candidates']=[i['variant_id'] for i in catalogue if matches(i,article or name or '__no_identity__')][:25]
    return result
