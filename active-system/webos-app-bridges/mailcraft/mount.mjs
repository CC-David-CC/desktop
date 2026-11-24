export function mount(host) {
  const owner = host.storage.signedInSubject();
  const session = host.session();
  const username = session?.public?.name;
  if (!owner || host.w.ownerSub !== owner || !/^[a-z][a-z0-9]{2,27}$/.test(username ?? '')) {
    throw Error('Sign in to WebOS to use MailCraft.');
  }

  const element = document.createElement('div');
  element.className = 'window-content';
  const frame = document.createElement('iframe');
  frame.title = 'MailCraft mailbox';
  frame.referrerPolicy = 'no-referrer';
  frame.style.cssText = 'display:block;width:100%;height:100%;border:0';
  const current = () => !host.signal.aborted &&
    session === host.session() && owner === host.storage.signedInSubject();
  const receive = event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow ||
        event.data !== 'mailcraft-awaiting-account' || !current()) return;
    event.source.postMessage({mailcraftAccount: `${username}@ksu.codes`}, location.origin);
    window.removeEventListener('message', receive);
  };
  window.addEventListener('message', receive, {signal: host.signal});
  frame.src = new URL('./native/index.html?empty&webgl', import.meta.url).href;
  element.append(frame);

  return {
    element,
    dispose() { frame.remove(); },
    focus() { if (current()) frame.focus(); },
  };
}
