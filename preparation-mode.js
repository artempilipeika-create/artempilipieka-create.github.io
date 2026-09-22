// Preserve the chosen preparation path across the existing sign-in redirect.
// Both original submission actions remain available; nothing is sent automatically.
(() => {
  const requested = new URLSearchParams(location.search).get('mode');
  let mode = requested;
  try {
    if (['manager', 'self'].includes(mode)) sessionStorage.setItem('mfPreparationMode', mode);
    else mode = sessionStorage.getItem('mfPreparationMode');
  } catch (_) {}
  if (!['manager', 'self'].includes(mode)) return;
  const workspace = document.getElementById('workspace');
  if (!workspace) return;
  const note = document.createElement('div');
  note.className = 'mf-preparation-note';
  const heading = document.createElement('strong');
  heading.textContent = mode === 'manager' ? 'Отдать менеджеру на обработку' : 'Подготовить самостоятельно';
  const detail = document.createElement('p');
  detail.textContent = mode === 'manager'
    ? 'Загрузите исходный Excel, добавьте комментарий и используйте кнопку «Отдать менеджеру на обработку» внизу страницы.'
    : 'Внесите или импортируйте детали, проверьте материалы и кромку. Когда всё готово, отправьте заказ на проверку.';
  note.append(heading, detail);
  workspace.prepend(note);
  document.getElementById(mode === 'manager' ? 'managerBtn' : 'submitBtn')?.classList.add('mf-selected-action');
})();
