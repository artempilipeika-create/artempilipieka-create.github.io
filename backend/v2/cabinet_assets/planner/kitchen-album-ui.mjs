// One saved kitchen, one paid photo, automatically inserted into the client PDF.
export async function openKitchenAlbum({save,snapshot,capture,request}){
  if(document.getElementById('kitchen-album-dialog'))return;
  const d=document.createElement('dialog');d.id='kitchen-album-dialog';d.className='mf-sales-dialog mf-kitchen-album';
  d.setAttribute('aria-labelledby','kitchen-album-title');
  d.innerHTML=`<div class="mf-sales-heading"><div><small>MARTIN FOREST / КЛИЕНТСКАЯ ПРЕЗЕНТАЦИЯ</small><h2 id="kitchen-album-title">Альбом вашей кухни</h2></div><button type="button" data-close aria-label="Закрыть">×</button></div>
    <p>Один фоторендер в стиле «Живой интерьер» автоматически войдёт в PDF: интерьер, вид кухни, материалы с образцами и комплект.</p>
    <p data-message role="status" aria-live="polite">Сохраняем кухню и проверяем готовый фоторендер…</p>
    <canvas data-preview width="1200" height="800" aria-label="Главный вид кухни"></canvas>
    <div class="mf-album-pages"><span>01 · Интерьер</span><span>02 · Вид кухни</span><span>03 · Материалы</span><span>04 · Комплект</span></div>
    <label class="mf-sales-check"><input data-consent type="checkbox">Разрешаю одну платную генерацию фоторендера. Он автоматически попадёт в PDF. Открытие готового альбома и скачивание не запускают новую генерацию.</label>
    <div class="mf-sales-actions"><button data-create disabled>Создать фоторендер и PDF</button><button data-check class="secondary" hidden>Проверить готовность · бесплатно</button><button data-build class="secondary" hidden>Собрать PDF из готового рендера</button><a data-pdf class="presentation-download" hidden>Скачать альбом · PDF</a></div>
    <p class="mf-album-note">Качество «Живого интерьера» сохранено. Второй вид берётся из конструктора без платной генерации. Перед отправкой клиенту проверьте изображение и материалы.</p>`;
  document.body.append(d);d.showModal();
  const q=s=>d.querySelector(s),say=t=>q('[data-message]').textContent=t;
  let frozen,views,hero=null,pdfURL=null,busy=true,automatic=false,closed=false,requested=false,timer=null;
  const requestId=crypto.randomUUID();
  const same=()=>frozen&&JSON.stringify(snapshot())===JSON.stringify(frozen);
  const assertSame=()=>{if(!same())throw Error('Кухня изменилась. Закройте альбом и откройте заново, чтобы использовать сохранённую версию.');};
  const refresh=()=>{
    q('[data-create]').disabled=busy||requested||!automatic||!q('[data-consent]').checked||!frozen;
    q('[data-create]').hidden=requested||Boolean(hero);
    q('[data-consent]').disabled=busy||!automatic;
    q('[data-consent]').closest('label').hidden=requested||Boolean(hero);
    q('[data-check]').hidden=!requested||Boolean(hero);q('[data-check]').disabled=busy;
    q('[data-build]').hidden=!hero||Boolean(pdfURL);q('[data-build]').disabled=busy;
    q('[data-pdf]').hidden=!pdfURL;
    d.setAttribute('aria-busy',String(busy));
  };
  const close=()=>{closed=true;clearTimeout(timer);if(pdfURL)URL.revokeObjectURL(pdfURL);d.close();d.remove();};
  q('[data-close]').onclick=close;d.addEventListener('cancel',e=>{e.preventDefault();close();});
  q('[data-consent]').onchange=refresh;
  const draw=async data=>{
    const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0))]));
    try{
      if(closed)return;
      const canvas=q('[data-preview]'),ctx=canvas.getContext('2d');ctx.fillStyle='#f6f3ed';ctx.fillRect(0,0,canvas.width,canvas.height);
      const scale=Math.min(canvas.width/bitmap.width,canvas.height/bitmap.height),w=bitmap.width*scale,h=bitmap.height*scale;
      ctx.drawImage(bitmap,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
    }finally{bitmap.close();}
  };
  const build=async()=>{
    assertSame();say('Фоторендер готов. Автоматически помещаем его в PDF-альбом…');
    const r=await fetch(`/api/v2/3d-projects/${frozen.id}/sales-album.pdf`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:frozen.version,layout:'client',hero_data_url:hero,detail_data_url:views.detail,photo:true})});
    if(!r.ok){const b=await r.json().catch(()=>({}));throw Error(b.detail?.code||'Не удалось собрать PDF. Фоторендер сохранён; повторная сборка PDF бесплатна.');}
    const blob=await r.blob();assertSame();if(closed)return;
    if(pdfURL)URL.revokeObjectURL(pdfURL);pdfURL=URL.createObjectURL(blob);
    q('[data-pdf]').href=pdfURL;q('[data-pdf]').download='Martin_Forest_Kitchen_Album.pdf';
    say('Альбом готов. Этот фоторендер уже внутри PDF, а на странице 3 — материалы с образцами. Можно скачать файл.');
  };
  const consume=async result=>{
    if(closed)return;assertSame();
    if(result.state==='none'){
      if(requested)throw Error('Сохранённый результат пока не найден. Новая платная генерация не запущена.');
      say(automatic?'Кухня сохранена. Подтвердите одну платную генерацию — дальше PDF соберётся автоматически.':'Сервис фоторендера сейчас недоступен. Ранее оплаченные изображения будут доступны после восстановления сервиса.');return;
    }
    requested=true;
    if(result.state==='pending'){
      say('Фоторендер создаётся. PDF соберётся автоматически. Проверка готовности бесплатна.');
      clearTimeout(timer);timer=setTimeout(()=>perform(check),3000);return;
    }
    if(result.state!=='ready')throw Error(result.message||'Рендер не получен. Повторный платный запрос не запускается.');
    clearTimeout(timer);hero=result.image_data_url;await draw(hero);if(!closed)await build();
  };
  const perform=async action=>{
    if(busy||closed)return;clearTimeout(timer);busy=true;refresh();
    try{assertSame();await action();}catch(error){if(!closed)say(error.message);}finally{busy=false;if(!closed)refresh();}
  };
  const check=async()=>{say('Проверяем сохранённый результат без новой генерации…');await consume(await request(`/3d-projects/${frozen.id}/sales-photo`));};
  q('[data-create]').onclick=()=>perform(async()=>{
    if(requested||!q('[data-consent]').checked)return;
    requested=true;refresh();say('Создаём один фоторендер в стиле «Живой интерьер», затем автоматически соберём PDF.');
    await consume(await request(`/3d-projects/${frozen.id}/sales-photo`,'POST',{version:frozen.version,preview_data_url:views.hero,request_id:requestId,paid_confirmed:true,render_style:'lived_in'}));
  });
  q('[data-check]').onclick=()=>perform(check);
  q('[data-build]').onclick=()=>perform(build);
  q('[data-pdf]').onclick=e=>{if(!same()||!pdfURL){e.preventDefault();say('Кухня изменилась. Откройте альбом заново для сохранённой версии.');}};
  refresh();
  try{
    await save();if(closed)return;frozen=structuredClone(snapshot());views=await capture();if(closed)return;await draw(views.hero);
    const result=await request(`/3d-projects/${frozen.id}/sales-photo/reuse`,'POST',{version:frozen.version,preview_data_url:views.hero});
    if(closed)return;
    // A missing provider/key must not prevent retrieval of an already paid image.
    if(result.state==='none'){const capabilities=await request('/3d-sales-capabilities');automatic=capabilities.automatic_render;}
    await consume(result);
  }catch(error){if(!closed)say(error.message);}finally{busy=false;if(!closed)refresh();}
}
