"""Pure server preliminary calculation from resolved immutable inputs only."""
from collections import defaultdict
from decimal import Decimal, ROUND_CEILING
from .calculation_math import dec,money,plain,category_totals,ROUNDING_VERSION,CATEGORIES
from .sheet_estimator import estimate,PlacementError

VERSION='mf-preliminary-decimal-v2-glue'

def calculate(inputs):
    revision=inputs['revision'];profile=inputs['production_profile'];settings=profile['settings'];policies=profile['policies']
    tariffs=inputs['tariffs'];prices=inputs['prices'];discount=inputs.get('discount')
    lines=[];plans=[];recipes=[];price_snapshots=[];issues=list(revision.get('issues',[]));materials={};edges={};processing=defaultdict(Decimal)
    def line(category,operation,quantity=None,unit=None,price=None,state='complete',reason=None,**snapshot):
        if state=='complete' and (quantity is None or price is None): state='incomplete';reason=reason or 'APPROVED_PRICE_REQUIRED'
        lines.append(plain({'category':category,'operation':operation,'quantity':quantity,'unit':unit,'unit_price':price,
             'gross':money(dec(quantity)*dec(price)) if state=='complete' else None,'state':state,'reason':reason,**snapshot}))
    def service(operation,q,unit,**snapshot):
        rate=tariffs.get(operation)
        if not rate: return line('services',operation,q,unit,state='incomplete',reason='APPROVED_TARIFF_REQUIRED',**snapshot)
        line('services',operation,q,unit,rate['amount'],tariff_entry_id=rate['entry_id'],**snapshot)
    def blocked(cat,op,code,state='needs_confirmation',**snapshot): line(cat,op,state=state,reason=code,**snapshot)
    for detail in revision.get('details',[]):
        ident=detail['detail_id'];material=detail.get('material');supply=detail['supply_source'];route=detail['route']
        try:
            l,w=dec(detail['length']),dec(detail['width']);q=detail['qty']
            if type(q) is not int or not 1<=q<=5000 or min(l,w)<=0: raise ValueError()
            if any(max(0,-d.as_tuple().exponent)>settings['geometry_decimal_places'] for d in (l,w)): raise ValueError()
        except (ValueError,ArithmeticError): blocked('materials','geometry','INVALID_GEOMETRY_OR_QTY','invalid',detail_id=ident);continue
        if detail.get('grain')=='unknown': blocked('materials','orientation','GRAIN_CONFIRMATION_REQUIRED',detail_id=ident);continue
        if not material: blocked('materials','material','EXACT_RELEASED_MATERIAL_REQUIRED','incomplete',detail_id=ident);continue
        thickness=dec(material['thickness']);sl=dec(material['length']);sw=dec(material['width'])
        if min(thickness,sl,sw)<=0: blocked('materials','material','INVALID_MATERIAL_GEOMETRY','invalid',detail_id=ident);continue
        if supply=='customer' and (not detail.get('provided_sheets') or not detail.get('customer_reason')):
            blocked('materials','customer_material','CUSTOMER_SHEET_PARAMETERS_REQUIRED',detail_id=ident);continue
        if route=='glued_18_18' and thickness!=dec(settings['glued_finished_thickness_mm'])/settings['glue_layers']:
            blocked('materials','recipe','GLUE_REQUIRES_EXACT_18MM_LAYERS','invalid',detail_id=ident);continue
        def add_material_part(mat,owner,customer_key,provided_sheets,part_id,pl,pw,pq):
            material_key=mat.get('variant_id') or 'customer:'+str(customer_key)
            key=(material_key,owner)
            if key not in materials: materials[key]={'material':mat,'parts':[],'provided_sheets':provided_sheets,'supply':owner,'routes':set()}
            group=materials[key]
            if group['material']!=mat: issues.append({'category':'materials','code':'MATERIAL_GROUP_IDENTITY_CONFLICT','state':'invalid'})
            if owner=='customer' and group['provided_sheets']!=provided_sheets:
                issues.append({'category':'materials','code':'CUSTOMER_SHEET_COUNT_CONFLICT','state':'invalid'})
            group['routes'].add(route)
            group['parts'].append({'detail_id':part_id,'length':plain(pl),'width':plain(pw),'qty':pq,'rotation':detail['rotation'],'grain':detail['grain']})
            return material_key

        if route=='glued_18_18':
            backing=detail.get('glue_backing');back_material=(backing or {}).get('material') or material
            back_supply=(backing or {}).get('supply_source',supply)
            back_key=(backing or {}).get('customer_material_key',detail.get('customer_material_key'))
            back_sheets=(backing or {}).get('provided_sheets',detail.get('provided_sheets'))
            back_reason=(backing or {}).get('customer_reason',detail.get('customer_reason'))
            try: back_thickness=dec(back_material['thickness']);bsl=dec(back_material['length']);bsw=dec(back_material['width'])
            except (KeyError,ValueError,ArithmeticError):
                blocked('materials','recipe','GLUE_BACKING_MATERIAL_REQUIRED','invalid',detail_id=ident);continue
            if min(back_thickness,bsl,bsw)<=0 or back_thickness!=dec(settings['glued_finished_thickness_mm'])/settings['glue_layers']:
                blocked('materials','recipe','GLUE_BACKING_REQUIRES_EXACT_18MM_LAYER','invalid',detail_id=ident);continue
            if back_supply=='customer' and (not back_sheets or not back_reason):
                blocked('materials','customer_material','CUSTOMER_BACKING_PARAMETERS_REQUIRED',detail_id=ident);continue
            allowance=dec(settings['glue_allowance_each_side_mm']);bl=l+2*allowance;bw=w+2*allowance
            front_key=add_material_part(material,supply,detail.get('customer_material_key'),detail.get('provided_sheets'),ident+':front',bl,bw,q)
            backing_key=add_material_part(back_material,back_supply,back_key,back_sheets,ident+':backing',bl,bw,q)
            basis='one_blank_area'
            recipes.append(plain({'version':'glued_18_18-v2','finished_detail_id':ident,'finished_length':l,'finished_width':w,'finished_qty':q,
                'finished_thickness':settings['glued_finished_thickness_mm'],'blank_length':bl,'blank_width':bw,'front_qty':q,'backing_qty':q,
                'front_material_key':front_key,'backing_material_key':backing_key,'same_material':front_key==backing_key and supply==back_supply,
                'operations':['blank_nesting','glue','glued_finish_cut','edge_processing','packaging'],'glue_area_basis':basis}))
            service('glue',bl*bw*q/1000000,'m2',detail_id=ident,basis='one_blank_area')
            service('glued_finish_cut',(l+w)*q/1000,'m',detail_id=ident,basis='one_length_plus_one_width')
        else:
            add_material_part(material,supply,detail.get('customer_material_key'),detail.get('provided_sheets'),ident,l,w,q)
        if detail['packaging']: service('packaging',l*w*q/1000000,'m2',detail_id=ident,basis='finished_area')
        for side,assignment in detail['edges'].items():
            if assignment.get('state')=='unresolved': blocked('edge_material','edge_material','EXACT_EDGE_REQUIRED','incomplete',detail_id=ident,side=side);continue
            edge=assignment.get('edge')
            if edge is None: continue
            net=(l if side in {'L1','L2'} else w)*q/1000;eid=edge['edge_id'];ownership=assignment['supply_source'];price=prices.get(eid)
            ek=(eid,edge['width'],edge['thickness'],ownership,price['entry_id'] if price else None)
            if ek not in edges: edges[ek]={'edge':edge,'net':Decimal(0),'supply':ownership,'price':price}
            edges[ek]['net']+=net
            finished_thickness=dec(settings['glued_finished_thickness_mm']) if route=='glued_18_18' else thickness
            if dec(edge['width'])<finished_thickness:
                blocked('services','edge_processing','EDGE_WIDTH_INCOMPATIBLE','invalid',detail_id=ident,side=side);continue
            complex_part=min(l,w)<dec(settings['complex_edge_threshold_mm'])
            # Both historically proposed thick tests are ambiguous (NC-02); no invented priority.
            possible_thick=dec(edge['width'])>=42 or dec(edge['thickness'])>=Decimal('1.5')
            classification=policies.get('edge_classification') or {}
            explicit=classification.get(eid)
            if explicit:
                thick=explicit['thick']
                op=explicit.get('complex_overlap') if thick and complex_part else ('edge_thick' if thick else ('edge_complex' if complex_part else 'edge_normal'))
                if op not in {'edge_thick','edge_complex','edge_normal'}: op=None
            else:
                auto_thick=dec(edge['width'])>=Decimal('42') and dec(edge['thickness'])>=Decimal('1.5')
                op=None if auto_thick and complex_part else ('edge_thick' if auto_thick else ('edge_complex' if complex_part else 'edge_normal'))
            if op is None: blocked('services','edge_processing','NC-02_CLASSIFICATION_REQUIRED',detail_id=ident,side=side,net_metres=plain(net));continue
            processing[(op,eid)]+=net
    for (material_key,supply),group in sorted(materials.items()):
        material=group['material']
        try: plan=estimate({'length':material['length'],'width':material['width']},group['parts'],settings)
        except PlacementError as exc: blocked('materials','sheet_plan',str(exc),'invalid',material_key=material_key);continue
        plans.append({'material_key':material_key+':'+supply,**plan});n=plan['estimated_sheet_count'];price=prices.get(material.get('variant_id'))
        if supply=='customer':
            if n>group['provided_sheets']: blocked('materials','customer_sheets','INSUFFICIENT_CUSTOMER_SHEETS','invalid',required=n,provided=group['provided_sheets'])
            line('materials','clean_sheets',n,'sheet','0',supply_source='customer',material_key=material_key,provided_sheets=group['provided_sheets'],estimated=True,manufacturing_compatibility={'geometry':'estimated_valid','native_profile':'NOT_YET_VERIFIED'})
        elif not price: blocked('materials','clean_sheets','NC-05_APPROVED_MATERIAL_PRICE_REQUIRED','incomplete',estimated_sheet_count=n,material_key=material_key)
        else:
            sheet_price=dec(price['amount'])
            factor=dec(material['length'])*dec(material['width'])/1000000 if price['unit']=='m2' else Decimal(1)
            line('materials','clean_sheets',n,'sheet',sheet_price*factor,price_entry_id=price['entry_id'],material_key=material_key,source_unit=price['unit'],conversion_factor=plain(factor),estimated=True)
        price_snapshots.append({'kind':'material','item_key':material_key,'price':price,'supply_source':supply,'material':material})
        scope=policies.get('cutting_18')
        thickness=dec(material['thickness'])
        if thickness==18 and scope and scope['basis']=='estimated_plan_excluding_trim' and material['family'] in scope['families'] and (group['routes']=={'solid'} or scope['include_glue_blanks']):
            service('cutting_18',plan['cut_metres'],'m',material_key=material_key,plan_hash=plan['plan_hash'],basis=scope['basis'],estimated=True)
        else: blocked('services','cutting','NC-09_CUT_SCOPE_REQUIRED',material_key=material_key,estimated_cut_metres=plan['cut_metres'],thickness=plain(thickness))
    for key,group in sorted(edges.items(),key=lambda kv:tuple(str(x) for x in kv[0])):
        eid=key[0];net=group['net'];ownership=group['supply'];price=group['price'];policy=policies.get('edge_consumption') or {'basis':'factor_ceil','factor':'1.15','step_m':'5'};billable=None
        if policy:
            if policy['basis']=='net': billable=net
            elif policy['basis']=='factor_ceil':
                step=dec(policy['step_m']);billable=(net*dec(policy['factor'])/step).to_integral_value(rounding=ROUND_CEILING)*step
        snap={'edge_id':eid,'net_metres':plain(net),'procurement_metres':plain(billable),'billable_metres':plain(billable),'supply_source':ownership}
        if ownership=='customer': line('edge_material','edge_material',net,'m','0',**snap)
        elif not price: blocked('edge_material','edge_material','NC-05_APPROVED_EDGE_PRICE_REQUIRED','incomplete',**snap)
        elif billable is None: blocked('edge_material','edge_material','NC-01_EDGE_CONSUMPTION_REQUIRED',**snap)
        else: line('edge_material','edge_material',billable,'m',price['amount'],price_entry_id=price['entry_id'],**snap)
        price_snapshots.append({'kind':'edge','item_key':eid,'price':price,'edge':group['edge'],'policy':policy,**snap})
    for (op,eid),net in sorted(processing.items()): service(op,net,'m',edge_id=eid,basis='net_metres')
    if not revision.get('details'): issues.append({'category':'materials','code':'NO_CALCULABLE_DETAILS','state':'incomplete'})
    for issue in issues: blocked(issue.get('category','materials'),'input',issue['code'],issue.get('state','needs_confirmation'))
    totals=category_totals(lines,discount)
    reasons=[{'category':l['category'],'code':l['reason'],'state':l['state']} for l in lines if l['state']!='complete']
    if discount is None: reasons.extend({'category':c,'code':'APPROVED_DISCOUNT_PROFILE_REQUIRED','state':'incomplete'} for c in CATEGORIES)
    states={r['state'] for r in reasons}
    status=next((s for s in ('invalid','incomplete','needs_confirmation') if s in states),'complete')
    calculated=sum((dec(t['net']) for t in totals.values()),Decimal(0)) if discount is not None else None
    return plain({'engine_version':VERSION,'rounding_policy':ROUNDING_VERSION,'type':'preliminary','completeness':status,
        'currency':'BYN','lines':lines,'category_totals':totals,'calculated_part':calculated,
        'known_gross':sum((dec(t['gross']) for t in totals.values()),Decimal(0)),
        'total':calculated if status=='complete' else None,'unresolved_categories':sorted({r['category'] for r in reasons}),
        'reasons':reasons,'sheet_estimates':plans,'manufacturing_recipes':recipes,'price_snapshots':price_snapshots,
        'final_state':'BAZIS_RUN_REQUIRED','production_ready':False})
