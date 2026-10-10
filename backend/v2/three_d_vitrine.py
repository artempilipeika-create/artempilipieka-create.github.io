"""Verified Z1 donors and the same quantity rules as planner/vitrine-model.js."""
import json
import math
from pathlib import Path

VARIANTS = json.loads((Path(__file__).parent/'cabinet_assets/planner/vitrine-variants.json').read_text())
BY_ID = {v['id']: v for v in VARIANTS}
URLS = {
    'led': 'https://wline.by/svetodiodnaya_lenta_gibkaya_aq-220923-p/220925',
    'profile': 'https://petroplav.by/shop/profil-fasadnyj-z1-6mm/',
    'seal': 'https://petroplav.by/shop/uplotnitel-z1/',
    'corner': 'https://petroplav.by/shop/ugolki-z1/',
}


def vitrine_variant(it):
    v = BY_ID.get(it.get('bazis_id'))
    return v if v and v['source_sha256'] == it.get('bazis_sha256') else None


def glass_shelves(it):
    n = it.get('glass_shelf_count')
    if n is None:
        return [1043]
    gap = (it['height']-136-n*4)/(n+1)
    return [round(118+gap+2+i*(gap+4), 6) for i in range(n)]


def vitrine_metrics(it):
    v = vitrine_variant(it)
    if not v:
        return None
    w, h, d = it['width'], it['height'], it['depth']
    n = 2 if v['lighting'] == 'both' else 1
    cuts = [h-104, h-104, w-4, w-4]
    return dict(profile='Z1', finish='black', groove_width_mm=4, groove_depth_mm=8,
                groove_length_each_mm=h-100, groove_total_m=round((h-100)*n/1000, 6),
                groove_z_from_back_mm=(d+18)/2,
                lighting_sides=['left', 'right'] if n == 2 else [v['lighting']],
                led_article='15.0341', led_length_m=round((h-100)*n/1000, 6),
                led_order_length_m=round(math.ceil((h-100)/25)*25*n/1000, 6),
                led_power_w=round((h-100)*n/1000*7.5, 6), led_voltage_v=12,
                profile_cuts_mm=cuts, profile_length_m=round(sum(cuts)/1000, 6),
                seal_length_m=round(2*(w-31.5+h-131.5)/1000, 6),
                glass_size_mm=[w-31.5, h-131.5, 4], glass_shelves=glass_shelves(it))


def vitrine_hardware(it):
    v, m = vitrine_variant(it), vitrine_metrics(it)
    if not v:
        return []
    items = [dict(r, quantity=len(glass_shelves(it))*4 if r['key'] == 'glass-shelf-support' else r['quantity']) for r in v['hardware_items']]
    for key, name, qty, unit, url, article in [
        ('led-aq-15.0341', 'Лента AQ LED-LINE 4 мм · 12 В · нейтральный свет', m['led_order_length_m'], 'm', URLS['led'], '15.0341'),
        ('profile-z1-black', 'Профиль фасадный Z1, чёрный', m['profile_length_m'], 'm', URLS['profile'], None),
        ('seal-z1', 'Уплотнитель Z1 · расчёт по периметру стекла', m['seal_length_m'], 'm', URLS['seal'], None),
        ('corner-z1', 'Уголки Z1 для сборки рамки', 4, 'pcs', URLS['corner'], None),
    ]:
        items.append(dict(key=key, name=name, quantity=qty, unit=unit, source_url=url, article=article))
    return items


def vitrine_contents(it):
    v, m = vitrine_variant(it), vitrine_metrics(it)
    side = {'left': 'слева', 'right': 'справа', 'both': 'с двух сторон'}
    text = (f"Витрина Z1, чёрная рамка; петли {side[v['opening']]}; подсветка {side[v['lighting']]}. "
            f"Паз: ширина 4 мм, глубина 8 мм, {m['groove_total_m']:g} м; ось {m['groove_z_from_back_mm']:g} мм от заднего края. "
            f"Лента AQ 15.0341: {m['led_order_length_m']:g} м по полной траектории паза, резка 25 мм; окончательный отрезок проверить при монтаже. "
            f"Профиль Z1: {' + '.join(str(x) for x in m['profile_cuts_mm'])} мм, рез 45°. Хлысты 6 м — по раскрою всего заказа. "
            f"Уплотнитель Z1: ориентир {m['seal_length_m']:g} м по периметру стекла; расход и совместимость уточнить у поставщика. "
            f"Стекло фасада: {it['width']-31.5:g} × {it['height']-131.5:g} × 4 мм. "
            f"Полки: {len(glass_shelves(it))} шт., {it['width']-44} × {it['depth']-20} × 4 мм; KUBIC — по 4 шт. на полку. "
            'Питание 12 В и управление подобрать для группы. Стекло и рамка учитываются отдельно от распила ЛДСП.')
    if it.get('glass_shelf_count') is not None:
        text += ' Полки и KUBIC изменить в БАЗИС вручную; центры от пола: '+', '.join(f'{x:g}' for x in glass_shelves(it))+' мм.'
    return text
