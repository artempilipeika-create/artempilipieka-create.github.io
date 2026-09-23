"""Reuse the accepted photographic preview, without publishing its legacy runtime."""
from pathlib import Path
import re,shutil
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'backend/v2/ui_assets';OUT.mkdir(exist_ok=True)
routes=['index.html','about/index.html','services/index.html','services/raspil/index.html','services/kromka/index.html','how-it-works/index.html','contacts/index.html','order/index.html','3d/index.html']
for route in routes:
    text=(ROOT/'public'/route).read_text()
    depth=route.count('/'); prefix='../'*depth
    def absolute(m):
        attr,path=m.group(1),m.group(2)
        if path.startswith(('http','tel:','#')):return m.group(0)
        while path.startswith('../'):path=path[3:]
        links={'index.html':'','login.html':'login','account.html':'account','register.html':'register','constructor.html':'constructor.html','order.html?mode=manager':'editor?mode=manager','order.html?mode=self':'editor?mode=self'}
        path=links.get(path,path)
        if path in ('site-v2.css','site-nav.js','favicon.svg','assets/panels.webp'):path='ui/'+path.replace('assets/','')
        return f'{attr}="/{path}"'
    text=re.sub(r'(href|src)="([^"]+)"',absolute,text)
    # Keep the original photograph once. Do not pretend references are our factory.
    if route=='index.html':
        text=re.sub(r'<figure class="mf-material-photo">.*?</figure>','<aside class="mf-detail-note"><p class="mf-kicker">От списка — к детали</p><h3>Точность начинается<br>с деталировки.</h3><dl><div><dt>Материал</dt><dd>Артикул, структура и толщина</dd></div><div><dt>Размеры</dt><dd>Длина, ширина и количество</dd></div><div><dt>Торцы</dt><dd>Четыре независимые стороны</dd></div></dl></aside>',text,flags=re.S)
        text=re.sub(r'<img class="mf-materials-image"[^>]+>','<div class="mf-material-swatch"><span>ЛДСП / МДФ / ЛХДФ</span><strong>Декор.<br>Структура.<br>Торец.</strong><p>Точное обозначение материала сохраняется на каждом этапе заказа.</p></div>',text)
        text=text.replace('Материал · Размеры · Внимание к детали','Иллюстрация материала · визуальный ориентир')
    text=text.replace('затем перенести предварительный список деталей в заказ','сформировать предварительный список деталей в отдельном инструменте')
    text=text.replace('Предварительный список деталей можно перенести в редактор заказа.','Подключение рабочего инструмента к защищённому кабинету требует отдельной проверки доступа.')
    # Visual fix: furniture outcome, honest 3D availability; no workflow changes.
    text=text.replace('Текстура и торцы мебельных плит','Визуализация кухни с дубовыми шкафами и зелёными фасадами')
    text=text.replace('Торцы и плоскости мебельных плит','Кухня по индивидуальным размерам — интерьерная визуализация')
    text=text.replace('Иллюстрация материала · визуальный ориентир','Концепция интерьера · 3D-визуализация')
    text=text.replace('Для ваших проектов. По вашим размерам.','Детали для кухни, шкафа и вашей идеи.')
    text=text.replace('В 3D-конструкторе комода можно изменить размеры, выбрать компоновку и материалы, сформировать предварительный список деталей в отдельном инструменте.','3D помогает заранее оценить пропорции мебели, сочетание фасадов и компоновку. Это отдельное направление: рабочий инструмент пока не подключён к кабинету.')
    text=text.replace('О 3D-конструкторе','Посмотреть возможности 3D')
    text=text.replace('3D / Комод','3D / Проработка идеи')
    text=text.replace('Представьте комод в объёме','3D-визуализация проекта')
    text=text.replace('Размеры, компоновка и материалы — в существующем 3D-конструкторе Martin Forest.','Комод, шкаф или тумба: сначала оценить пропорции и материалы, затем подготовить деталировку.')
    text=text.replace('Выберите компоновку комода, измените ширину, высоту и глубину, подберите материалы корпуса и фасадов. Подключение рабочего инструмента к защищённому кабинету требует отдельной проверки доступа.','Визуализация помогает обсудить габариты, расположение ящиков и дверей, декоры корпуса и фасадов. Она не заменяет проверенную деталировку и согласование заказа.')
    text=text.replace('Конструктор — производственный прототип. Состав деталей и конструктив проверяются перед изготовлением. Для работы нужен вход и доступ к 3D.','Рабочий 3D-инструмент пока не подключён к личному кабинету. Здесь представлено направление, а не доступный онлайн-конструктор. Заказ можно подготовить через существующий редактор.')
    text=text.replace('Рабочий инструмент сохранён в отдельном разделе. Подготовленную деталировку можно продолжить в редакторе заказа.','Начните с размеров и пожеланий к мебели. Для текущего заказа используйте Excel или ручной ввод деталей; автоматического переноса из 3D сейчас нет.')
    text=text.replace('href="/constructor.html">Открыть 3D-конструктор','href="/order/">Подготовить деталировку')
    text=text.replace('href="/constructor.html">Открыть конструктор','href="/3d/">Узнать о 3D-направлении')
    text=text.replace('>3D-конструктор</a>','>3D-визуализация</a>')
    if route in ('about/index.html','services/index.html','order/index.html'):
        text=text.replace('class="mf-subhero"','class="mf-subhero mf-furniture-banner"',1)
    if route=='services/raspil/index.html':
        text=text.replace('<img src="/ui/panels.webp"','<img loading="lazy" src="/ui/panels.webp"')
    target=OUT/route;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(text)
css=(ROOT/'public/site-v2.css').read_text();css=re.sub(r"^@import[^\n]+\n",'',css,count=1)
css=css.replace('--mf-muted:#68736b','--mf-muted:#536459')
css+='''\n/* Stage 7 accessibility refinements, same accepted visual language. */
[hidden]{display:none!important}html{scroll-behavior:smooth}body{overflow-wrap:break-word}
:focus-visible{outline:3px solid #ae6b16;outline-offset:4px}
.mf-detail-note{background:#e9e8dd;padding:clamp(24px,4vw,64px);align-self:stretch}
.mf-detail-note dl{margin-top:32px}.mf-detail-note dl div{padding:18px 0;border-top:1px solid #aeb7a8}.mf-detail-note dt{font-weight:700}.mf-detail-note dd{margin:4px 0 0}
.mf-material-swatch{background:#d7c9ae;color:#23392e;padding:clamp(24px,6vw,90px);display:flex;flex-direction:column;justify-content:center;gap:32px}
.mf-material-swatch strong{font:500 clamp(40px,5vw,72px)/1.1 Georgia,serif}
.mf-nav a[aria-current=page]{text-decoration:underline;text-underline-offset:8px}
@media(max-width:900px){.mf-wrap{width:calc(100% - 40px)}.mf-nav{gap:14px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*:before,*:after{animation:none!important;transition:none!important}}
'''
css += """
/* Furniture visual pass: same layout and palette, presentation only. */
.mf-hero-image{object-position:50% 55%}
.mf-hero-shade{background:linear-gradient(90deg,#082a20bf,#082a2099 50%,#08231dad)}
.mf-furniture-banner{background-image:linear-gradient(90deg,#153d2df5,#153d2dbd),url('/ui/panels.webp');background-size:cover;background-position:center 55%}
@media(max-width:900px){.mf-hero-image{object-position:62% center}.mf-hero-shade{background:linear-gradient(90deg,#082a20cf,#082a209e)}.mf-furniture-banner{background-position:62% center}}
"""
(OUT/'site-v2.css').write_text(css)
# panels.webp is the versioned furniture visualization; do not restore the old boards image.
assert (OUT/'panels.webp').is_file()
shutil.copy(ROOT/'public/favicon.svg',OUT/'favicon.svg')
(OUT/'site-nav.js').write_text("""'use strict';
fetch('/api/v2/auth/me',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(u=>{if(u)document.querySelectorAll('[data-account-link]').forEach(a=>{a.textContent='Личный кабинет';a.href='/account';});}).catch(()=>{});
document.querySelectorAll('.mf-menu').forEach(menu=>{menu.addEventListener('keydown',e=>{if(e.key==='Escape'){menu.open=false;menu.querySelector('summary').focus();}});});
""")
print('Stage 7: nine accepted public pages, explicit assets; no legacy scripts copied.')
