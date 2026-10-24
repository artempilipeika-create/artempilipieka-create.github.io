"""Separate family and discrete widths, audited from the twelve FR3D donors."""
import json
from pathlib import Path
from .three_d_gola import gola_error, gola_hardware
VARIANTS=json.loads((Path(__file__).parent/'cabinet_assets/planner/pullout-dryer-variants.json').read_text())
BY_ID={v['id']:v for v in VARIANTS}
def dryer_variant(it):
    v=BY_ID.get(it.get('bazis_id'))
    return v if v and v['source_sha256']==it.get('bazis_sha256') else None
def dryer_error(it):
    v=dryer_variant(it)
    if not v:return 'Сушка не совпадает с проверенным исходником'
    if it['width'] not in v['allowed_widths']:return 'Ширина шкафа с сушкой: только '+', '.join(map(str,v['allowed_widths']))+' мм'
    if not v['min_depth']<=it['depth']<=700:return 'Шкаф с сушкой: глубина 510–700 мм'
    return gola_error(it,v)
def dryer_hardware(it):
    v=dryer_variant(it)
    error=dryer_error(it)
    if error:raise ValueError(error)
    k=next(k for k in v['dryer_kits'] if k['width']==it['width'])
    return gola_hardware(it,v)+[dict(key='pullout-dryer',name=k['name'],article=k['article'],quantity=1,unit='set')]
def dryer_contents(it):
    v=dryer_variant(it)
    return ('NORWING' if v['dryer_brand']=='norwing' else 'FLAT LINE')+f" · {it['width']} мм; сверху выдвижная сушка, снизу один ящик {v['series']}; "+('Gola II без подсветки' if v['execution']=='gola' else 'накладные ручки')
