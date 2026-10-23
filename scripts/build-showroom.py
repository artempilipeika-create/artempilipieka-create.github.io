"""Build the public product studio using the accepted site shell and real NMD2 renders."""
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'backend/v2/ui_assets'
page=OUT/'3d/index.html'
text=page.read_text()
content='''<main id="content" class="mf-showroom">
<section class="mf-wrap mf-showroom-intro"><div><p class="mf-kicker">MARTIN FOREST / СТУДИЯ МЕБЕЛИ</p><h1>Ваша мебель.<br>В каждой детали.</h1></div><p>Рассмотрите модуль со всех сторон, оцените пропорции и начните свой проект.</p></section>
<section class="mf-wrap mf-product" aria-label="Модель НМД2-600">
<div class="mf-product-media"><span class="mf-product-badge">Нижний кухонный модуль</span>
<div class="mf-product-stage" id="showroom-stage"><img src="/ui/showroom/nmd2-front.webp" alt="НМД2-600 — фасады и регулируемые опоры" width="1200" height="1080" fetchpriority="high"></div>
<div class="mf-product-controls" aria-label="Ракурс модели"><button type="button" data-showroom-view="front" aria-pressed="true">Фасады</button><button type="button" data-showroom-view="back" aria-pressed="false">Корпус</button><button type="button" data-showroom-view="detail" aria-pressed="false">Деталь</button></div>
<div class="mf-scene-settings"><div role="group" aria-label="Обстановка"><span>Обстановка</span><button type="button" data-showroom-room="room" aria-pressed="true" disabled>Шоурум</button><button type="button" data-showroom-room="studio" aria-pressed="false" disabled>Студия</button></div><div role="group" aria-label="Освещение"><span>Свет</span><button type="button" data-showroom-light="daylight" aria-pressed="true" disabled>Дневной</button><button type="button" data-showroom-light="warm" aria-pressed="false" disabled>Тёплый</button></div></div>
<p class="mf-product-status" id="showroom-status" role="status" aria-live="polite">Включите 3D, чтобы вращать модель.</p></div>
<div class="mf-product-info"><p class="mf-kicker">КОЛЛЕКЦИЯ КУХОННЫХ МОДУЛЕЙ</p><h2>НМД2-600</h2><p class="mf-product-description">Две распашные двери, внутренняя полка и регулируемые опоры. Лаконичная основа для вашей кухни.</p>
<dl class="mf-product-dimensions"><div><dt>Ширина</dt><dd>600 <small>мм</small></dd></div><div><dt>Высота с опорами</dt><dd>820 <small>мм</small></dd></div><div><dt>Глубина корпуса</dt><dd>510 <small>мм</small></dd></div></dl>
<div class="mf-product-features"><span>Корпус 18 мм</span><span>Два фасада</span><span>Внутренняя полка</span><span>Опоры 100 мм</span></div>
<button type="button" class="mf-product-action" id="showroom-start">Рассмотреть в 3D ↗</button><a class="mf-product-secondary" href="/constructor.html">Открыть конструктор кухни ↗</a>
<p class="mf-product-fineprint">Нейтральный цвет показан для примера. Декор выбирается в конструкторе. Высота корпуса — 720 мм, глубина с фасадами — 531 мм. Столешница подбирается отдельно.</p></div>
</section>
<section class="mf-wrap mf-showroom-notes" aria-label="Возможности конструктора"><article class="mf-showroom-note"><span>01</span><h3>Выберите модуль</h3><p>Нижние и верхние шкафы, пеналы и угловые решения — в едином каталоге.</p></article><article class="mf-showroom-note"><span>02</span><h3>Настройте под себя</h3><p>Измените размеры, выберите компоновку и материалы корпуса и фасадов.</p></article><article class="mf-showroom-note"><span>03</span><h3>Сохраните проект</h3><p>Продолжайте работу в личном кабинете. Деталировка проверяется перед изготовлением.</p></article></section>
</main>'''
text=re.sub(r'<main id="content"[^>]*>.*?</main>',lambda _:content,text,flags=re.S)
text=re.sub(r'<title>.*?</title>','<title>Студия мебели · НМД2-600 — Martin Forest</title>',text)
text=re.sub(r'<meta name="description" content="[^"]*">','<meta name="description" content="Кухонный модуль НМД2-600 в 3D: размеры, корпус, фасады и конструктор кухни Martin Forest.">',text)
if '/ui/showroom/showroom.css' not in text:text=text.replace('</head>','<link rel="stylesheet" href="/ui/showroom/showroom.css"></head>')
if '/ui/showroom/viewer.mjs' not in text:text=text.replace('</body>','<script type="module" src="/ui/showroom/viewer.mjs"></script></body>')
page.write_text(text)
home=OUT/'index.html';text=home.read_text()
section='''<section class="mf-section mf-constructor"><div class="mf-wrap mf-showroom-home"><div><p class="mf-kicker">СТУДИЯ МЕБЕЛИ / 3D</p><h2>Представить.<br>Рассмотреть.<br>Создать своё.</h2><p class="mf-prose">Начните с одного модуля. Оцените его пропорции, рассмотрите корпус и фасады, затем соберите свой проект в конструкторе.</p><a class="mf-text-link" href="/3d/">Перейти в студию мебели <span aria-hidden="true">↗</span></a></div><a class="mf-home-model" href="/3d/" aria-label="Рассмотреть НМД2-600 в 3D"><figure><img src="/ui/showroom/nmd2-front.webp" alt="НМД2-600 с двумя фасадами и регулируемыми опорами" width="1200" height="1080" loading="lazy"><figcaption><div><strong>НМД2-600</strong><small>600 × 820 × 510 мм · Нижний модуль</small></div><span aria-hidden="true">↗</span></figcaption></figure></a></div></section>'''
text=re.sub(r'<section class="mf-section mf-constructor">.*?</section>',lambda _:section,text,flags=re.S)
if '/ui/showroom/showroom.css' not in text:text=text.replace('</head>','<link rel="stylesheet" href="/ui/showroom/showroom.css"></head>')
home.write_text(text)
for page in [home,OUT/'3d/index.html']:
 text=page.read_text();header,rest=text.split('</header>',1)
 if '>3D-студия</a>' not in header:header=header.replace('<a href="/how-it-works/">','<a href="/3d/">3D-студия</a><a href="/how-it-works/">')
 page.write_text(header+'</header>'+rest)
print('Product studio and homepage ready')
