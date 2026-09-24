"""Versioned column semantics. Every worksheet row has an explicit disposition."""
from decimal import Decimal
import re
from .catalogue_model import decimal, fingerprint

FIELDS={'position','name','article','material','manufacturer','structure','thickness','format_length','format_width',
        'length','width','qty','texture','rotation','comments','X1','X2','Y1','Y2','L1','L2','W1','W2','row_type'}
SIDES={'L1':'X1','L2':'X2','W1':'Y1','W2':'Y2'}
DEFAULT_EDGE_DICTIONARY={'0':'none','нет':'none','no':'none','false':'none','-':'none','*':'present','1':'present','':'unknown'}
IDENTITY_FIELDS=('article','material','manufacturer','structure','thickness','format_length','format_width')


def material_heading(value):
    """Only a visible board description can start an explicitly enabled block."""
    return isinstance(value,str) and bool(re.search(r'(?<!\w)(?:Л?ДСП|Л?МДФ|Л?Х?ДФ|ДВП|HDF|MDF|OSB|ФАНЕРА)(?!\w)',value,re.I))


def header_values(rows,columns,start,end):
    by_number={r['row']:r for r in rows}
    if start==end:
        return {c:by_number.get(end,{}).get('cells',{}).get(c,{}).get('value') for c in columns}
    return {c:' | '.join(str(by_number.get(n,{}).get('cells',{}).get(c,{}).get('value')).strip()
                        for n in range(start,end+1)
                        if by_number.get(n,{}).get('cells',{}).get(c,{}).get('value') not in (None,'')) or None
            for c in columns}


def validate_template(t):
    if set(t)!={'headers','sheet_policy','mapping','inheritance','edge_dictionary','units'}: raise ValueError('Template keys invalid')
    mapping=t['mapping']
    if not isinstance(mapping,dict) or set(mapping)-FIELDS or not {'length','width','qty'}<=set(mapping): raise ValueError('Invalid column mapping')
    if any(not isinstance(c,str) or not re.fullmatch('[A-Z]{1,3}',c) for c in mapping.values()): raise ValueError('Invalid column')
    policy=t['sheet_policy']
    if set(policy)-{'mode','sheets','header_row','header_start','data_start'} or policy.get('mode') not in {'explicit','named'}: raise ValueError('Invalid sheet policy')
    if not isinstance(policy.get('header_row'),int) or not 1<=policy['header_row']<=100: raise ValueError('Header row required')
    start=policy.get('header_start',policy['header_row']);data_start=policy.get('data_start',policy['header_row']+1)
    if type(start) is not int or not 1<=start<=policy['header_row'] or policy['header_row']-start>2: raise ValueError('Invalid header span')
    if type(data_start) is not int or not policy['header_row']<data_start<=10001: raise ValueError('Invalid first data row')
    if policy['mode']=='named' and (not policy.get('sheets') or not isinstance(policy['sheets'],list)): raise ValueError('Named sheets required')
    inheritance=t['inheritance']
    if set(inheritance)-{'enabled','header_marker','service_markers','blank_resets','continuation_marker','confirmed_continuation','material_blocks','fill_down','confirmed'}: raise ValueError('Invalid inheritance rules')
    simple=inheritance.get('material_blocks') or inheritance.get('fill_down')
    if simple and (inheritance.get('enabled') is not True or inheritance.get('confirmed') is not True): raise ValueError('Explicit inheritance confirmation required')
    if inheritance.get('enabled') and not simple and ('row_type' not in mapping or not inheritance.get('header_marker')): raise ValueError('Explicit material header marker required')
    if inheritance.get('fill_down') and not {'material','article'}&set(mapping): raise ValueError('Material column required for fill down')
    if inheritance.get('continuation_marker') and not inheritance.get('confirmed_continuation'): raise ValueError('Continuation must be explicitly approved in template')
    if not isinstance(t['edge_dictionary'],dict) or any(v not in {'none','present','unknown'} for v in t['edge_dictionary'].values()): raise ValueError('Invalid edge dictionary')
    if set(t['units'])-{'length','width','thickness','format_length','format_width'} or any(v not in {'mm','cm','m'} for v in t['units'].values()): raise ValueError('Unapproved units')
    if not isinstance(t['headers'],dict) or not t['headers']: raise ValueError('Header fingerprint required')
    return fingerprint(t['headers'])


def issue(sheet,row,field,raw,reason,action='Исправить значение или явно исключить строку с причиной'):
    return {'sheet':sheet,'row':row,'field':field,'raw':raw,'reason':reason,'possible_action':action}


def numeric(value,field,unit,errors,changes,sheet,row):
    n=decimal(value)
    if n is None:
        errors.append(issue(sheet,row,field,value,'missing_or_non_numeric'))
        return value  # Empty, text and errors never become 0 or 1.
    factor={'mm':1,'cm':10,'m':1000}[unit]
    converted=n*factor
    if factor!=1 or ',' in str(value): changes.append({'field':field,'raw':value,'normalized':str(converted),'unit':unit,'target':'mm' if field!='qty' else 'pieces'})
    if converted<=0: errors.append(issue(sheet,row,field,value,'must_be_positive'))
    if field=='qty' and converted!=converted.to_integral_value(): errors.append(issue(sheet,row,field,value,'integer_quantity_required'))
    if field!='qty' and converted.as_tuple().exponent < -3:
        errors.append(issue(sheet,row,field,value,'precision_requires_review_no_rounding'))
    return int(converted) if converted==converted.to_integral_value() else str(converted)


def parse(workbook,t,selected):
    validate_template(t)
    available=[s['name'] for s in workbook['sheets']]
    if not selected and t['sheet_policy']['mode']=='named': selected=t['sheet_policy']['sheets']
    if not selected: return {'selection_required':True,'available_sheets':available,'rows':[]}
    if len(set(selected))!=len(selected) or any(s not in available for s in selected): raise ValueError('Invalid worksheet selection')
    output=[]; mapping=t['mapping']; inheritance=t['inheritance']; header_row=t['sheet_policy']['header_row']
    data_start=t['sheet_policy'].get('data_start',header_row+1)
    for sheet in workbook['sheets']:
        if sheet['name'] not in selected: continue  # Explicit unselected sheet; available list is retained.
        if not any(r['row']==header_row for r in sheet['rows']): raise ValueError('Header row absent')
        actual=header_values(sheet['rows'],t['headers'],t['sheet_policy'].get('header_start',header_row),header_row)
        if actual!=t['headers']: raise ValueError('Header fingerprint mismatch')
        inherited={}; block=None
        for source in sheet['rows']:
            n=source['row']; cells=source['cells']; raw={k:cells.get(c,{}).get('value') for k,c in mapping.items()}
            result={'sheet':sheet['name'],'row':n,'cells':cells,'raw_fields':raw,'values':dict(raw),
                    'errors':[],'conversions':[],'edges':{},'inheritance':None,'disposition':'service'}
            errors=result['errors']; marker=raw.get('row_type')
            nonempty=[c for c in cells.values() if c.get('value') not in (None,'')]
            block_values=[c for c in nonempty if material_heading(c.get('value'))]
            is_block=inheritance.get('material_blocks') and len(block_values)==1 and (n<data_start or len(nonempty)==1)
            if is_block:
                cell=block_values[0]
                inherited={};block=None
                if cell.get('type')=='e' or cell.get('formula') is not None and cell.get('cached') is None:
                    errors.append(issue(sheet['name'],n,'material',cell,'formula_without_usable_cached_value'))
                else:
                    inherited={'material':cell['value']};block=n
                result['reason']='material_header';result['inheritance']={'header_row':n,'reset':True,'fields':dict(inherited)}
            elif n<data_start: result['reason']='header_or_preamble'
            elif not any(c.get('value') not in (None,'') or c.get('formula') is not None for c in cells.values()):
                result.update(disposition='blank',reason='empty_row')
                if inheritance.get('blank_resets',True): inherited={};block=None
            elif inheritance.get('enabled') and inheritance.get('header_marker') and marker==inheritance['header_marker']:
                # Recognize before dimensional validation. A new block always clears old article.
                inherited={k:raw.get(k) for k in IDENTITY_FIELDS}
                block=n;result['reason']='material_header';result['inheritance']={'header_row':n,'reset':True}
            elif inheritance.get('enabled') and inheritance.get('continuation_marker') and marker==inheritance['continuation_marker']:
                inherited.update({k:raw[k] for k in inherited if raw.get(k) not in (None,'')})
                result['reason']='explicit_confirmed_continuation'
            elif marker in inheritance.get('service_markers',[]):
                result['reason']='template_service_row';inherited={};block=None
            else:
                result['disposition']='valid'
                if inheritance.get('fill_down') and any(raw.get(k) not in (None,'') for k in ('article','material')):
                    # New explicit material clears the complete previous identity.
                    inherited={k:raw.get(k) for k in IDENTITY_FIELDS};block=n
                    for k in IDENTITY_FIELDS:
                        cell=cells.get(mapping.get(k),{})
                        if cell.get('type')=='e' or cell.get('formula') is not None and cell.get('cached') is None:
                            inherited[k]=None
                for k,v in inherited.items():
                    if raw.get(k) in (None,''): result['values'][k]=v
                if block: result['inheritance']={'header_row':block,'fields':inherited}
                for field,col in mapping.items():
                    c=cells.get(col,{})
                    if c.get('formula') is not None and (c.get('cached') is None or c.get('type')=='e'):
                        errors.append(issue(sheet['name'],n,field,c,'formula_without_usable_cached_value'))
                    elif c.get('type')=='e': errors.append(issue(sheet['name'],n,field,c,'excel_error'))
                for field in ('length','width','qty'):
                    result['values'][field]=numeric(raw.get(field),field,t['units'].get(field,'mm'),errors,result['conversions'],sheet['name'],n)
                texture=str(raw.get('texture') or '').strip().casefold()
                texture_value={'none':'none','нет':'none','без текстуры':'none','0':'none','false':'none','n':'none',
                    'length':'length','по длине':'length','вдоль':'length','1':'length','true':'length','да':'length','y':'length',
                    'width':'width','по ширине':'width','поперёк':'width'}.get(texture)
                if texture_value:
                    result['values']['texture']=texture_value
                rotation=str(raw.get('rotation') if raw.get('rotation') is not None else '').strip().casefold()
                if rotation in {'true','1','да','y','false','0','нет','n'}:
                    result['values']['rotation']=rotation in {'true','1','да','y'}
                for field in ('thickness','format_length','format_width'):
                    value=result['values'].get(field)
                    if value not in (None,''): result['values'][field]=numeric(value,field,t['units'].get(field,'mm'),errors,result['conversions'],sheet['name'],n)
                for side,alias in SIDES.items():
                    a,b=raw.get(side),raw.get(alias)
                    both=side in mapping and alias in mapping
                    conflict=both and a not in (None,'') and b not in (None,'') and a!=b
                    value=a if a not in (None,'') or alias not in mapping else b
                    meaning=t['edge_dictionary'].get('' if value is None else str(value))
                    result['edges'][side]={'raw':{k:raw.get(k) for k in (side,alias) if k in mapping},
                         'raw_sku':value if meaning is None else None,'mark':meaning or 'sku_unresolved',
                         'mode':'auto_suggestion','edge_id':None,'confirmed':False,'conflict':conflict}
                    if conflict: errors.append(issue(sheet['name'],n,side,{side:a,alias:b},'side_alias_conflict'))
                    if meaning is None or meaning=='unknown': errors.append(issue(sheet['name'],n,side,value,'edge_requires_resolution'))
                if errors: result['disposition']='problematic'
            # Service/header formula errors cannot silently seed an inherited identity.
            if result.get('reason') in {'material_header','explicit_confirmed_continuation'}:
                for field,col in mapping.items():
                    c=cells.get(col,{})
                    if c.get('formula') is not None and (c.get('cached') is None or c.get('type')=='e'):
                        errors.append(issue(sheet['name'],n,field,c,'formula_without_usable_cached_value'))
                        inherited[field]=None
            output.append(result)
    counts={k:sum(r['disposition']==k for r in output) for k in ('valid','problematic','blank','service')}
    return {'selection_required':False,'available_sheets':available,'selected_sheets':selected,'rows':output,
            'summary':{'source_rows':len(output),'dispositions':counts,'part_rows':counts['valid']+counts['problematic'],
                       'mapping':mapping,'template_fingerprint':fingerprint(t),'materials':sorted({str(r['values'].get('material')) for r in output if r['disposition'] in {'valid','problematic'}})}}


def identity_input(row,file_id):
    v=row['values']
    inherited=(row.get('inheritance') or {}).get('fields',{})
    raw={k:(row['raw_fields'].get(k) if row['raw_fields'].get(k) not in (None,'') else inherited.get(k,row['raw_fields'].get(k)))
         for k in set(row['raw_fields'])|set(inherited)}
    return {**{'raw_'+k:raw.get(source) for k,source in [('article','article'),('material_name','material'),('manufacturer','manufacturer'),
            ('structure','structure'),('thickness','thickness'),('format_length','format_length'),('format_width','format_width')]},
            'source_file':str(file_id),'sheet':row['sheet'],'row':row['row'],'cells':row['cells'],
            'raw_fields':row['raw_fields'],'inheritance':row['inheritance'],
            'normalized_physical':{k:v.get(k) for k in ('thickness','format_length','format_width')},'conversions':row['conversions']}
