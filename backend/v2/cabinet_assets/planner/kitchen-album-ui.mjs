// One saved project, one paid image, then a deterministic four-page PDF.
export async function openKitchenAlbum({save,snapshot,capture,request,technical,nativeImage}){
  if(document.getElementById('kitchen-album-dialog'))return;
  const d=document.createElement('dialog');d.id='kitchen-album-dialog';d.className='mf-sales-dialog mf-kitchen-album';
  d.setAttribute('aria-labelledby','kitchen-album-title');
  d.innerHTML=`<div class="mf-sales-heading"><div><small>MARTIN FOREST / КЛИЕНТСКАЯ ПРЕЗЕНТАЦИЯ</small><h2 id="kitchen-album-title">Альбом вашей кухни</h2></div><button type="button" data-close aria-label="Закрыть">×</button></div>
    <p>Четыре страницы: интерьер, второй ракурс, материалы и комплект для самостоятельной сборки.</p>
    <p data-message role="status" aria-live="polite">Сохраняем кухню и готовим ракурсы…</p>
    <canvas data-preview width="1200" height="800" aria-label="Главный вид кухни"></canvas>
    <div class="mf-album-pages"><span>01 · Интерьер</span><span>02 · Второй ракурс</span><span>03 · Материалы</span><span>04 · Комплект</span></div>
    <label class="mf-sales-check"><input data-consent type="checkbox">Разрешаю одну платную генерацию изображения через подключённый сервис. Стоимость — по его тарифу; повторные генерации запускаются только вручную.</label>
    <div class="mf-sales-actions"><button data-create disabled>Создать альбом с фоторендером</button><button data-check class="secondary" hidden>Проверить готовность</button></div>
    <p class="mf-album-note">Главный вид станет фотореалистичным. Второй ракурс останется точным видом из конструктора. При ошибке автоматического повтора не будет.</p>
    <label class="mf-sales-check"><input data-reviewed type="checkbox" disabled>Проверил изображение: шкафчики, фасады, техника и материалы соответствуют моей кухне</label>
    <div class="mf-sales-actions"><a data-pdf class="presentation-download" hidden>Скачать альбом · PDF</a><a data-cover class="presentation-download" hidden>Обложка · PNG</a></div>
    <details><summary>Другие варианты</summary><div class="mf-sales-actions"><button data-draft class="secondary" disabled>Альбом без фоторендера</button><button data-new class="secondary" hidden>Новая платная генерация</button><button data-technical class="secondary">Технический альбом · 5 листов</button><button data-native class="secondary">Картинка из конструктора</button></div></details>`;
  document.body.append(d);d.showModal();
  const q=s=>d.querySelector(s),say=t=>q('[data-message]').textContent=t;
  let frozen,views,hero=null,pdfURL=null,coverURL=null,busy=true,ready=false,automatic=false,requestId=null,receiptKey=null,closed=false;
  const same=()=>frozen&&JSON.stringify(snapshot())===JSON.stringify(frozen);
  const revoke=()=>{for(const url of [pdfURL,coverURL])if(url)URL.revokeObjectURL(url);pdfURL=coverURL=null;};
  const refresh=()=>{
    q('[data-create]').disabled=busy||!automatic||!q('[data-consent]').checked||!frozen||Boolean(hero);
    q('[data-check]').disabled=busy;q('[data-draft]').disabled=busy||!views;
    q('[data-reviewed]').disabled=busy||!hero||!ready;
    for(const selector of ['[data-consent]','[data-new]','[data-technical]','[data-native]'])q(selector).disabled=busy;
    const allow=ready&&(!hero||q('[data-reviewed]').checked);
    q('[data-pdf]').hidden=!allow;q('[data-cover]').hidden=!allow;
    q('[data-new]').hidden=!hero&&q('[data-check]').hidden;
    q('[data-consent]').closest('label').hidden=Boolean(hero);
    q('[data-create]').hidden=Boolean(hero);
    q('.mf-album-note').hidden=ready;
    d.setAttribute('aria-busy',String(busy));
  };
  const close=()=>{closed=true;revoke();d.close();d.remove();};
  q('[data-close]').onclick=close;d.addEventListener('cancel',e=>{e.preventDefault();close();});
  q('[data-consent]').onchange=refresh;q('[data-reviewed]').onchange=refresh;
  q('[data-technical]').onclick=()=>{close();technical();};q('[data-native]').onclick=()=>{close();nativeImage();};
  const draw=async data=>{
    const bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));
    const bitmap=await createImageBitmap(new Blob([bytes])),canvas=q('[data-preview]'),ctx=canvas.getContext('2d');
    ctx.fillStyle='#f6f3ed';ctx.fillRect(0,0,canvas.width,canvas.height);
    const ratio=Math.min(canvas.width/bitmap.width,canvas.height/bitmap.height),w=bitmap.width*ratio,h=bitmap.height*ratio;
    ctx.drawImage(bitmap,(canvas.width-w)/2,(canvas.height-h)/2,w,h);bitmap.close();
  };
  const assertSame=()=>{if(!same())throw Error('Кухня изменилась. Закройте альбом и откройте заново, чтобы использовать сохранённую версию.');};
  const build=async()=>{
    assertSame();ready=false;revoke();say('Собираем четыре страницы альбома…');
    const r=await fetch(`/api/v2/3d-projects/${frozen.id}/sales-album.pdf`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:frozen.version,layout:'client',hero_data_url:hero||views.hero,detail_data_url:views.detail,photo:Boolean(hero)})});
    if(!r.ok){const b=await r.json().catch(()=>({}));throw Error(b.detail?.code||'Не удалось собрать PDF. Сохранённый рендер можно использовать повторно.');}
    const blob=await r.blob();assertSame();if(closed)return;
    const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=1273;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#f6f3ed';ctx.fillRect(0,0,1800,1273);
    ctx.fillStyle='#19382e';ctx.font='bold 30px Arial';ctx.fillText('MARTIN FOREST',80,82);
    ctx.font='42px Georgia';const title=frozen.name||'Кухня по вашему проекту';ctx.fillText(title,80,168,1640);
    ctx.drawImage(q('[data-preview]'),195,212,1410,940);
    ctx.font='22px Arial';ctx.fillText(hero?'Визуализация проекта · Комплект для самостоятельной сборки':'Вид из конструктора · Комплект для самостоятельной сборки',80,1210);
    const cover=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(closed)return;if(!cover)throw Error('Не удалось подготовить обложку.');
    pdfURL=URL.createObjectURL(blob);coverURL=URL.createObjectURL(cover);
    q('[data-pdf]').href=pdfURL;q('[data-pdf]').download='Martin_Forest_Kitchen_Album.pdf';
    q('[data-cover]').href=coverURL;q('[data-cover]').download='Martin_Forest_Kitchen_Cover.png';
    ready=true;say(hero?'Альбом готов. Проверьте рендер и отметьте соответствие кухне — после этого появятся файлы для клиента.':'Альбом готов без платной генерации. Можно скачать PDF и обложку.');
  };
  const consume=async result=>{
    if(result.state==='pending'){say('Рендер ещё создаётся. Проверка готовности не запускает новую генерацию.');q('[data-check]').hidden=false;return;}
    if(result.state!=='ready'){q('[data-check]').hidden=false;throw Error(result.message||'Рендер не получен. Новая генерация не запущена.');}
    assertSame();hero=result.image_data_url;q('[data-reviewed]').checked=false;q('[data-check]').hidden=true;
    await draw(hero);await build();
  };
  const perform=async action=>{
    if(busy||closed)return;busy=true;refresh();
    try{assertSame();await action();}catch(error){if(!closed)say(error.message);}finally{busy=false;if(!closed)refresh();}
  };
  q('[data-create]').onclick=()=>perform(async()=>{
    if(!q('[data-consent]').checked)return;
    say('Создаём один фоторендер. Можно закрыть окно и вернуться к альбому этой кухни.');
    try{sessionStorage.setItem(receiptKey,requestId);}catch{}
    q('[data-check]').hidden=false;
    await consume(await request(`/3d-projects/${frozen.id}/sales-photo`,'POST',{version:frozen.version,preview_data_url:views.hero,request_id:requestId,paid_confirmed:true}));
  });
  q('[data-check]').onclick=()=>perform(async()=>{say('Проверяем сохранённый результат…');await consume(await request(`/3d-projects/${frozen.id}/sales-photo/${requestId}`));});
  q('[data-draft]').onclick=()=>perform(async()=>{hero=null;q('[data-reviewed]').checked=false;await draw(views.hero);await build();});
  q('[data-new]').onclick=()=>{
    if(busy||!confirm('Запустить ещё одну платную генерацию? Предыдущий запрос мог быть оплачен.'))return;
    requestId=crypto.randomUUID();try{sessionStorage.setItem(receiptKey,requestId);}catch{}
    hero=null;ready=false;revoke();q('[data-consent]').checked=false;q('[data-check]').hidden=true;
    say('Отметьте согласие и нажмите «Создать альбом». Будет отправлен новый платный запрос.');refresh();
  };
  for(const selector of ['[data-pdf]','[data-cover]'])q(selector).onclick=e=>{if(!same()||!ready||(hero&&!q('[data-reviewed]').checked)){e.preventDefault();say('Проверьте изображение и сохранённую версию кухни.');}};
  refresh();
  try{
    await save();if(closed)return;frozen=structuredClone(snapshot());views=await capture();if(closed)return;await draw(views.hero);
    const capabilities=await request('/3d-sales-capabilities');if(closed)return;automatic=capabilities.automatic_render;
    receiptKey=`mf-kitchen-render:${frozen.user}:${frozen.id}:${frozen.version}`;
    try{requestId=sessionStorage.getItem(receiptKey);}catch{}
    if(requestId){try{await consume(await request(`/3d-projects/${frozen.id}/sales-photo/${requestId}`));}catch(e){say(e.message);q('[data-check]').hidden=false;}}
    else {requestId=crypto.randomUUID();
      say(automatic?'Кухня сохранена. Подтвердите одну платную генерацию или выберите альбом без фоторендера.':'Фоторендер не подключён. Альбом с точными видами конструктора доступен без генерации.');}
  }catch(error){if(!closed)say(error.message);}finally{busy=false;if(!closed)refresh();}
}
