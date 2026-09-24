"""Commercial allow-list. Copies snapshot numbers; never calculates money or quantities."""
from .calculation_math import plain

TITLE='ПРЕДВАРИТЕЛЬНЫЙ РАСЧЁТ'
DISCLAIMER='Стоимость рассчитана до фактического производственного раскроя. Окончательная стоимость подтверждается после проверки заказа специалистом Martin Forest и фактического раскроя.'
CUSTOMER='Материал заказчика. Стоимость материала не начисляется. Рассчитываются производственные услуги и используемая кромка.'
CATEGORIES={'materials':'Материалы','edge_material':'Материал кромки','services':'Производственные услуги'}
OPERATIONS={'cutting_18':'Расчётный метраж распила','cutting':'Расчётный метраж распила','glue':'Склейка',
 'glued_finish_cut':'Финальная обрезка 36 мм','packaging':'Упаковка','edge_normal':'Кромкооблицовка обычная',
 'edge_complex':'Кромкооблицовка сложная','edge_thick':'Кромкооблицовка толстая','edge_processing':'Кромкооблицовка'}
UNITS={'sheet':'лист','m2':'м²','m':'м'}


def material(m):
    return {k:m.get(k) for k in ('name','manufacturer','article','structure','thickness','length','width')}


def project(calculation, *, number, name, customer, revision_number, date):
    r=calculation['result'];inputs=calculation['input_snapshot']
    materials=[];edges=[];services=[];unresolved=[]
    snapshots=r.get('price_snapshots',[])
    for l in r['lines']:
        if l['category']=='materials' and l['operation']=='clean_sheets':
            supply=l.get('supply_source','company')
            snap=next((s for s in snapshots if s['kind']=='material' and s['item_key']==l['material_key'] and s['supply_source']==supply),{})
            row={**material(snap.get('material',{})), 'quantity':l.get('quantity',None),
                 'unit':'sheet','unit_price':l['unit_price'],'amount':l['gross'],'supply_source':supply,
                 'price_unit':(snap.get('price') or {}).get('unit'),'sale_price':(snap.get('price') or {}).get('amount')}
            if row['quantity'] is None: row['quantity']=l.get('estimated_sheet_count')
            materials.append(row)
            if l['state']!='complete': unresolved.append('Стоимость материала: '+(row['name'] or row['article'] or 'Материал заказа'))
        elif l['category']=='edge_material':
            snap=next((s for s in snapshots if s['kind']=='edge' and s['item_key']==l.get('edge_id') and s['supply_source']==l.get('supply_source')), {})
            edge=snap.get('edge',{})
            row={k:edge.get(k) for k in ('name','designation','article','width','thickness')}
            row.update(net_metres=l.get('net_metres'),unit_price=l['unit_price'],amount=l['gross'],supply_source=l.get('supply_source'))
            policy=snap.get('policy')
            if policy:
                row.update(procurement_metres=l.get('procurement_metres'),billable_metres=l.get('billable_metres'),
                    policy={k:policy[k] for k in ('basis','factor','step_m') if k in policy})
            edges.append(row)
            if l['state']!='complete': unresolved.append('Стоимость и объём кромки: '+(row['name'] or row['designation'] or row['article'] or 'Кромка заказа'))
        elif l['category']=='services':
            if l['quantity'] is not None and str(l['quantity']).strip('0.')=='': continue
            title=OPERATIONS.get(l['operation'],'Производственная операция')
            services.append({'name':title,'quantity':l['quantity'],'unit':l['unit'],'unit_price':l['unit_price'],'amount':l['gross']})
            if l['state']!='complete': unresolved.append('Объём или тариф: '+title)
        elif l['state']!='complete':
            unresolved.append('Параметры деталей и материалов требуют проверки специалистом')
    # Invalid details can have no financial material line. Preserve their known identity for review.
    known={(m['name'],m['article'],m['supply_source']) for m in materials}
    for d in inputs['revision'].get('details',[]):
        m=d.get('material')
        if m and (m.get('name'),m.get('article'),d['supply_source']) not in known:
            row={**material(m),'quantity':None,'unit':'sheet','unit_price':None,'amount':None,'supply_source':d['supply_source'],'price_unit':None,'sale_price':None}
            materials.append(row);known.add((row['name'],row['article'],row['supply_source']))
    if any(t['percent'] is None for t in r['category_totals'].values()): unresolved.append('Условия скидок требуют подтверждения')
    details=[]
    for index,d in enumerate(inputs['revision'].get('details',[]),1):
        sides={}
        for side in ('L1','L2','W1','W2'):
            assignment=d.get('edges',{}).get(side,{})
            e=assignment.get('edge')
            sides[side]=({k:e.get(k) for k in ('name','article','width','thickness')} if e else None)
        details.append({'number':index,'name':d.get('name',''),'comments':d.get('comments',''),
            'material':material(d.get('material') or {}),'length':d.get('length'),'width':d.get('width'),
            'qty':d.get('qty'),'grain':d.get('grain'),'rotation':d.get('rotation'),'edges':sides,
            'unresolved_edges':[s for s,e in d.get('edges',{}).items() if e.get('state')=='unresolved']})
    complete=r['completeness']=='complete'
    return plain({'title':TITLE,'order_number':number,'order_name':name,'customer':customer or 'Клиент',
      'revision_number':revision_number,'date':str(date)[:10],'state':r['completeness'],
      'status_label':'Предварительный расчёт подготовлен' if complete else 'Требует уточнения стоимости',
      'synthetic':r.get('synthetic',False),'materials':materials,'edges':edges,'services':services,'details':details,
      'discounts':[{'category':k,'name':label,**{f:r['category_totals'][k][f] for f in ('gross','percent','discount','net','complete')}} for k,label in CATEGORIES.items()],
      'amount_label':'ПРЕДВАРИТЕЛЬНАЯ СТОИМОСТЬ' if complete else 'РАССЧИТАННАЯ ЧАСТЬ',
      'amount':r['total'] if complete else r['calculated_part'],'currency':r['currency'],
      'unresolved':list(dict.fromkeys(unresolved)),'disclaimer':DISCLAIMER,'customer_material_notice':CUSTOMER})
