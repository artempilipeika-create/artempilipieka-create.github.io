(() => {
  const base = new URL('.', document.currentScript.src);
  const menu = document.querySelector('.mf-menu');
  if (menu) {
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { menu.open = false; menu.querySelector('summary').focus(); } });
    document.addEventListener('click', e => { if (!menu.contains(e.target)) menu.open = false; });
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { menu.open = false; }));
  }
  document.querySelectorAll('[data-mobile-logout]').forEach(button => button.addEventListener('click', () => document.getElementById('logout')?.click()));
  fetch(new URL('api/me', base), { credentials: 'same-origin' })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      const user = data?.user;
      if (!user) return;
      document.querySelectorAll('[data-account-link]').forEach(a => {
        a.textContent = 'Личный кабинет';
        a.href = new URL('account.html', base).href;
      });
      const staff = ['admin', 'manager', 'production', 'accounting', 'viewer'].includes(user.role);
      if (staff) document.querySelectorAll('[data-staff-link]').forEach(a => { a.hidden = false; });
    }).catch(() => {});
})();
