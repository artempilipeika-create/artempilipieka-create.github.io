window.MFAuth = (()=>{
  let cache;
  async function api(path, options={}){
    const opts={credentials:'same-origin',...options};
    if(opts.body && typeof opts.body!=='string'){opts.headers={...(opts.headers||{}),'Content-Type':'application/json'};opts.body=JSON.stringify(opts.body)}
    const r=await fetch(path,opts); let j={}; try{j=await r.json()}catch{}
    if(!r.ok)throw new Error(j.detail||j.error||`HTTP ${r.status}`); return j;
  }
  async function me(force=false){if(cache&&!force)return cache;try{cache=(await api('/api/me')).user;return cache}catch{cache=null;return null}}
  async function requireAuth(){const u=await me();if(!u){location.href='login.html?next='+encodeURIComponent(location.pathname.split('/').pop()||'account.html');return null}if(u.isBlocked){document.body.innerHTML='<main class="blocked-page"><div class="panel"><h1>Аккаунт ограничен</h1><p>'+esc(u.blockReason||'Обратитесь в Martin Forest.')+'</p><a class="btn btn-primary" href="account.html">Личный кабинет</a></div></main>';return null}return u}
  async function require3d(){const u=await requireAuth();if(!u)return null;const x=await api('/api/3d/access');if(!x.allowed){location.href='account.html#subscription';return null}return u}
  async function logout(){await api('/api/auth/logout',{method:'POST'});location.href='index.html'}
  function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  return{api,me,requireAuth,require3d,logout,esc};
})();
