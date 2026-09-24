"""Pure catalogue classification, stable signatures and safe search projection."""
from collections import Counter, defaultdict
from decimal import Decimal, InvalidOperation
import hashlib
import json
import re
import unicodedata
from uuid import UUID, uuid5
from .xlsx import raw_value

ID_NAMESPACE=UUID('5183eac4-7b57-4e34-8077-92ce6f58b928')
HEADERS=['Артикул материала','Наименование материала','Единица измерения','Стоимость','Длина','Ширина',
         'Толщина','Обозначение','Свес','Класс','Тип материала','Идентификатор для синхронизации']


def canonical(value):
    return unicodedata.normalize('NFC',str(value)).strip() if value is not None else None


def packed(value):
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'))


def fingerprint(value):
    return hashlib.sha256(packed(value).encode()).hexdigest()


def stable(namespace,kind,value):
    return str(uuid5(ID_NAMESPACE,packed([namespace,kind,value])))


def decimal(value):
    try:
        n=Decimal(str(value).strip().replace(',','.'))
        return n if n.is_finite() else None
    except (InvalidOperation,ValueError):
        return None


def dimension(value):
    n=decimal(value)
    return format(n.normalize(),'f') if n is not None and n>0 else None


def normalize_master(workbook,namespace):
    result=[]; classes=Counter(); external=defaultdict(list)
    for sheet in workbook['sheets']:
        rows=sheet['rows']
        if not rows or [raw_value(rows[0]['cells'],chr(65+i)) for i in range(12)]!=HEADERS:
            raise ValueError('Master headers must match approved A–L profile')
        for source in rows[1:]:
            cells=source['cells']; v={chr(65+i):raw_value(cells,chr(65+i)) for i in range(12)}
            tags=set((v['J'] or '').split()); classes[' '.join(sorted(tags))]+=1
            rec={'sheet':sheet['name'],'row':source['row'],'cells':cells,'raw':v,
                 'disposition':'excluded','reason':'non_catalogue_class','normalized':{},'signature':None}
            rec['raw_row_id']=stable(workbook['sha256']+namespace,'raw',[sheet['name'],source['row']])
            if tags not in ({'M1'},{'M2'}):
                if tags & {'M1','M2'}: rec.update(disposition='review',reason='mixed_class_requires_approval')
            else:
                kind='material' if tags=={'M1'} else 'edge'
                dims={k:dimension(v[c]) for k,c in [('length','E'),('width','F'),('thickness','G')]}
                unit=canonical(v['C']); is_board_unit=unit in {'кв.м','кв.м.','м2','м²','m2','m²'}
                is_edge_unit=unit in {'пог.м','пог.м.','пог. м','м.п','м','m','п.м','п.м.'}
                formula_error=any(c.get('formula') is not None and (c.get('cached') is None or c.get('type')=='e') for c in cells.values())
                if formula_error:
                    rec.update(disposition='error',reason='formula_without_usable_cache')
                elif not v['B']:
                    rec.update(disposition='error',reason='missing_name')
                elif kind=='material' and not all(dims.values()):
                    rec.update(disposition='excluded' if not dims['length'] and not dims['width'] else 'review',reason='M1_without_board_geometry')
                elif kind=='material' and not is_board_unit:
                    rec.update(disposition='review',reason='unapproved_board_unit')
                elif kind=='edge' and (not is_edge_unit or not dims['width'] or not dims['thickness']):
                    rec.update(disposition='review',reason='unapproved_edge_unit_or_geometry')
                else:
                    article=canonical(v['A']) or None
                    family='edge' if kind=='edge' else ('HDF' if re.search(r'(?<![\w])(?:лхдф|хдф|lhdf|hdf)(?![\w])',v['B'],re.I) else 'board')
                    item={'kind':kind,'article':article,'name':v['B'],'manufacturer':None,'decor':None,
                          'structure':None,'family':family,**dims,'designation':v['H'],
                          'source_namespace':namespace,'unit':unit}
                    # Unknown manufacturer/structure stay unknown. No name-based guess becomes identity.
                    identity={k:item[k] for k in ('kind','article','manufacturer','decor','structure','thickness','length','width')}
                    if not article: identity['articleless_name']=canonical(v['B'])
                    sig=fingerprint(identity)
                    item['variant_id' if kind=='material' else 'edge_id']=stable(namespace,'variant' if kind=='material' else 'edge',sig)
                    if kind=='material': item['material_id']=stable(namespace,'material',sig)
                    item['identity_signature']=sig
                    rec.update(disposition='published',reason='validated_catalogue_candidate',normalized=item,signature=sig)
            result.append(rec)
            if v['L'] is not None and canonical(v['L'])!='': external[canonical(v['L'])].append(rec)
    # External IDs are never used before proving namespace uniqueness. Conflicts do not merge.
    for rows in external.values():
        if len(rows)>1:
            for row in rows:
                if row['disposition']=='published': row.update(disposition='review',reason='duplicate_external_sync_id')
    identity_names=defaultdict(set)
    for row in result:
        if row['disposition']=='published': identity_names[row['signature']].add(row['normalized']['name'])
    for row in result:
        if row['disposition']=='published' and len(identity_names[row['signature']])>1:
            row.update(disposition='review',reason='same_identity_different_name_requires_audit')
    seen={}
    for row in result:
        if row['disposition']=='published':
            sig=row['signature']
            if sig in seen:
                previous=seen[sig]
                if row['normalized']['name']!=previous['normalized']['name']:
                    row.update(disposition='review',reason='same_identity_different_name_requires_audit')
                else: row.update(disposition='duplicate',reason='exact_identity_duplicate',duplicate_of=previous['raw_row_id'])
            else: seen[sig]=row
    return result,dict(classes)


def safe_item(item,release_id):
    keys=('variant_id','material_id','edge_id','kind','article','name','manufacturer','decor','structure','family',
          'thickness','length','width','designation','unit','texture','grain')
    return {**{k:item.get(k) for k in keys if k in item},'catalogue_release':str(release_id)}


def search_key(text):
    text=(canonical(text) or '').casefold().replace(',','.')
    for alias in ('лхдф','lhdf','хдф'): text=text.replace(alias,'hdf')
    # Search only. Never feed this transliteration into strict identity or persistent IDs.
    return text.translate(str.maketrans({'х':'x','×':'x'}))


def matches(item,query):
    hay=' '.join(str(item.get(k) or '') for k in ('article','name','manufacturer','decor','family','thickness','length','width'))
    hay+=' '+str(item.get('length'))+'x'+str(item.get('width'))
    return all(token in search_key(hay) for token in search_key(query).split())
