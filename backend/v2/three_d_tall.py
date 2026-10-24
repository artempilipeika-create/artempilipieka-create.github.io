"""Verified PN-600 donors, shared with the browser catalogue and PDF."""
import json
from pathlib import Path
VARIANTS=json.loads((Path(__file__).parent/'cabinet_assets/planner/tall-variants.json').read_text())
APPLIANCE_VARIANTS=json.loads((Path(__file__).parent/'cabinet_assets/planner/appliance-tall-variants.json').read_text())
DRAWER_KITS=json.loads((Path(__file__).parent/'cabinet_assets/planner/appliance-tall-drawer-kits.json').read_text())
BY_ID={v['id']:v for v in VARIANTS+APPLIANCE_VARIANTS}

def tall_variant(it):
    v=BY_ID.get(it.get('bazis_id'))
    return v if v and v['source_sha256']==it.get('bazis_sha256') else None


def tall_shelf_count(it):
    v=tall_variant(it)
    if not v:return 0
    value=it.get('upper_shelf_count')
    return len(v['upper_shelves']) if value is None else value


def tall_drawer_kit(it):
    v=tall_variant(it)
    if not v or v.get('family')!='appliance' or not v.get('drawer'):return None
    available=it['depth']-DRAWER_KITS['rear_service_mm']-DRAWER_KITS['rear_clearance_mm']
    return next((k for k in reversed(DRAWER_KITS['kits']) if k['length_mm']<=available),None)


def tall_drawer_note(it):
    k=tall_drawer_kit(it)
    if not k or k['length_mm']==500:return None
    return (f"Шуфляда: боковины {k['length_mm']} мм, дно {k['length_mm']-4} мм по глубине; "
            f"направляющие L-{k['length_mm']}, арт. {k['article']}, 1 комплект. "
            "В БАЗИС проверить и при необходимости вручную заменить направляющие, укоротить боковины и дно, переместить заднюю стенку ящика по деталировке экспорта.")


def tall_hardware(it):
    v=tall_variant(it)
    if not v:return []
    kit=tall_drawer_kit(it);rows=[]
    for source in v['hardware_items']:
        row=dict(source)
        if row['key']=='shelf-support-marcopol':row['quantity']=tall_shelf_count(it)*4
        if kit and kit['length_mm']!=500:
            if row.get('article')=='114797':row.update({key:kit[key] for key in ('name','article','quantity','unit')})
            elif row.get('article')==kit['screw_article']:row['quantity']=kit['screw_quantity']
        rows.append(row)
    return rows
