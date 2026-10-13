let active = false;

export async function withInterpolation(action, { title = '初期条件を補完中…', description = 'データを読み込み、格子・実深度に合わせています。' } = {}) {
  if (active) throw new Error('初期条件の補完中です。完了までお待ちください。');
  active = true;
  const dialog = document.createElement('dialog');
  dialog.id = 'interpolationStatus'; dialog.className = 'interpolation-status';
  dialog.innerHTML = '<div role="status" aria-live="polite"><span class="interpolation-spinner" aria-hidden="true"></span><strong>初期条件を補完中…</strong><span>データを読み込み、格子・実深度に合わせています。</span></div>';
  dialog.querySelector('strong').textContent = title;
  dialog.querySelector('div > span:last-child').textContent = description;
  dialog.addEventListener('cancel', event => event.preventDefault());
  document.body.append(dialog); dialog.showModal();
  document.querySelector('main')?.setAttribute('aria-busy', 'true');
  try {
    // Allow the status to reach the screen before synchronous interpolation starts.
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    return await action();
  } finally {
    dialog.close(); dialog.remove(); document.querySelector('main')?.removeAttribute('aria-busy'); active = false;
  }
}
