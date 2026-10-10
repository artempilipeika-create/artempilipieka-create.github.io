"""Verified Z1 donors and the same quantity rules as planner/vitrine-model.js."""
import json
import math
from pathlib import Path

VARIANTS = json.loads((Path(__file__).parent/'cabinet_assets/planner/vitrine-variants.json').read_text())
BY_ID = {v['id']: v for v in VARIANTS}
LIGHTING = json.loads((Path(__file__).parent/'cabinet_assets/planner/vitrine-lighting.json').read_text())
URLS = {
    'led': 'https://wline.by/svetodiodnaya_lenta_gibkaya_aq-220923-p/220925',
    'profile': 'https://petroplav.by/shop/profil-fasadnyj-z1-6mm/',
    'seal': 'https://petroplav.by/shop/uplotnitel-z1/',
    'corner': 'https://petroplav.by/shop/ugolki-z1/',
}


def vitrine_variant(it):
    v = BY_ID.get(it.get('bazis_id'))
    known = v and [v['source_sha256'], *[s['source_sha256'] for s in v.get('previous_sources', [])]]
    return v if known and it.get('bazis_sha256') in known else None


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
    system = LIGHTING[v['light_system']]
    step = system['led_cut_step_mm']
    led_cut = math.ceil((h-100)/step)*step if step else h-100
    profile = system.get('profile')
    stock = next((s for s in profile['stock'] if s['length_mm'] >= h-100), None) if profile else None
    return dict(profile='Z1', finish='black', light_system=v['light_system'],
                groove_width_mm=system['groove_width_mm'], groove_depth_mm=system['groove_depth_mm'],
                groove_length_each_mm=h-100, groove_total_m=round((h-100)*n/1000, 6),
                groove_z_from_back_mm=(d+18)/2,
                lighting_sides=['left', 'right'] if n == 2 else [v['lighting']],
                led_article=system['led_article'], led_length_m=round((h-100)*n/1000, 6),
                led_order_length_m=round(led_cut*n/1000, 6),
                led_power_w=round((h-100)*n/1000*system['led_power_w_per_m'], 6), led_voltage_v=system['led_voltage_v'],
                led_cut_step_mm=step, led_cut_length_each_mm=led_cut if step else None,
                light_profile_length_m=round((h-100)*n/1000, 6) if profile else 0,
                light_profile_cuts_mm=[h-100]*n if profile else [],
                light_profile_stock_mm=stock['length_mm'] if stock else None,
                light_profile_article=stock['article'] if stock else None,
                light_profile_stock_count=n if stock else 0, light_profile_end_caps=2*n if profile else 0,
                profile_cuts_mm=cuts, profile_length_m=round(sum(cuts)/1000, 6),
                seal_length_m=round(2*(w-31.5+h-131.5)/1000, 6),
                glass_size_mm=[w-31.5, h-131.5, 4], glass_shelves=glass_shelves(it))


def vitrine_hardware(it):
    v, m = vitrine_variant(it), vitrine_metrics(it)
    if not v:
        return []
    system = LIGHTING[v['light_system']]
    items = [dict(r, quantity=len(glass_shelves(it))*4 if r['key'] == 'glass-shelf-support' else r['quantity']) for r in v['hardware_items']]
    items.append(dict(key=system['led_key'],name=system['led_name'],quantity=m['led_order_length_m'],unit='m',source_url=system['led_url'],article=m['led_article']))
    if system.get('profile'):
        profile=system['profile']
        stock=next(s for s in profile['stock'] if s['length_mm']==m['light_profile_stock_mm'])
        for key,name,qty,unit,url,article in [
            ('light-profile-lira-'+stock['article'],f"LIRA-1707 · чёрный профиль с экраном · {stock['length_mm']} мм",m['light_profile_stock_count'],'pcs',stock['url'],stock['article']),
            ('light-profile-lira-end-cap','Заглушка LIRA-1707, чёрная',m['light_profile_end_caps'],'pcs',profile['end_cap']['url'],profile['end_cap']['article']),
            ('light-profile-lira-holder','Держатель врезного профиля LIRA-1707 · количество по монтажу',None,'pcs',profile['holder']['url'],profile['holder']['article']),
            ('light-profile-lira-fasteners','Крепёж держателей LIRA-1707 · подбор по монтажу',None,'set',profile['holder']['url'],None),
        ]:
            items.append(dict(key=key,name=name,quantity=qty,unit=unit,source_url=url,article=article))
    for key, name, qty, unit, url, article in [
        ('profile-z1-black', 'Профиль фасадный Z1, чёрный', m['profile_length_m'], 'm', URLS['profile'], None),
        ('seal-z1', 'Уплотнитель Z1 · расчёт по периметру стекла', m['seal_length_m'], 'm', URLS['seal'], None),
        ('corner-z1', 'Уголки Z1 для сборки рамки', 4, 'pcs', URLS['corner'], None),
        ('kubic-screws', 'Саморез 3,5 × 16 мм, потайная головка · KUBIC', len(glass_shelves(it))*4, 'pcs', 'https://www.italianaferramenta.it/en/catalog/kubic-209', None),
    ]:
        items.append(dict(key=key, name=name, quantity=qty, unit=unit, source_url=url, article=article))
    return items


def vitrine_contents(it):
    v, m = vitrine_variant(it), vitrine_metrics(it)
    system=LIGHTING[v['light_system']]
    side = {'left': 'слева', 'right': 'справа', 'both': 'с двух сторон'}
    text = (f"Витрина Z1, чёрная рамка; петли {side[v['opening']]}; подсветка {side[v['lighting']]}. "
            f"Паз: ширина {m['groove_width_mm']:g} мм, глубина {m['groove_depth_mm']:g} мм, {m['groove_total_m']:g} м; ось {m['groove_z_from_back_mm']:g} мм от заднего края. "
            f"{system['led_name']} · арт. {m['led_article']}: {m['led_order_length_m']:g} м по полной траектории паза, резка {m['led_cut_step_mm']} мм; окончательный отрезок проверить при монтаже. "
            f"Профиль Z1: {' + '.join(str(x) for x in m['profile_cuts_mm'])} мм, рез 45°. Хлысты 6 м — по раскрою всего заказа. "
            f"Уплотнитель Z1: ориентир {m['seal_length_m']:g} м по периметру стекла; расход и совместимость уточнить у поставщика. "
            f"Стекло фасада: {it['width']-31.5:g} × {it['height']-131.5:g} × 4 мм. "
            f"Полки: {len(glass_shelves(it))} шт., {it['width']-44} × {it['depth']-20} × 4 мм; KUBIC — по 4 шт. на полку. Саморезы 3,5 × 16 мм с потайной головкой: {len(glass_shelves(it))*4} шт. дополнительно к исходным крепежам. "
            f"Питание 12 В, управление, провод и соединения подобрать для группы. Нагрузка модуля: {m['led_power_w']:g} Вт. Стекло и рамка учитываются отдельно от распила ЛДСП.")
    if system.get('profile'):
        text += (f" LIRA-1707 с экраном: {' + '.join(str(x) for x in m['light_profile_cuts_mm'])} мм; "
                 f"{m['light_profile_stock_count']} хлыст(а) {m['light_profile_stock_mm']} мм, арт. {m['light_profile_article']}. "
                 f"Заглушки {system['profile']['end_cap']['article']}: {m['light_profile_end_caps']} шт. Экран отдельно не добавлять. {system['profile']['mount_note']}")
    if it.get('glass_shelf_count') is not None:
        text += ' Полки и KUBIC изменить в БАЗИС вручную; центры от пола: '+', '.join(f'{x:g}' for x in glass_shelves(it))+' мм.'
    return text
