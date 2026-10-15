// Only the bundled Windows launcher supplies this per-launch capability token.
const token = new URL(location.href).searchParams.get('desktopSession');
if (location.hostname === '127.0.0.1' && /^[a-f0-9]{32}$/.test(token ?? '')) {
  const id = crypto.randomUUID();
  const endpoint = `/__webroms_session/${token}/${id}/`;
  let active = true;
  const notify = action => fetch(endpoint + action, { method: 'POST', keepalive: true }).catch(() => {});
  notify('open');
  setInterval(() => { if (active) notify('ping'); }, 30000);
  addEventListener('pagehide', () => {
    active = false;
    if (!navigator.sendBeacon(endpoint + 'close', '')) notify('close');
  });
  addEventListener('pageshow', () => { active = true; notify('open'); });
}
