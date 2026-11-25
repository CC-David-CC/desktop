export function mount(host) {
  const owner = host.storage.signedInSubject();
  const session = host.session();
  if (!owner || host.w.ownerSub !== owner) {
    throw Error('Sign in to WebOS to use MailCraft.');
  }

  const element = document.createElement('div');
  element.className = 'window-content';
  element.textContent = 'Opening MailCraft…';
  const current = () => !host.signal.aborted &&
    session === host.session() && owner === host.storage.signedInSubject();
  const check = () => {
    if (!current()) throw new DOMException('The WebOS account changed.', 'AbortError');
  };
  const signedOut = 'Your WebOS session ended. Sign out and sign in again to reconnect MailCraft.';
  const mailSession = new URL('/api/mailcraft/jmap/session', location.origin).href;

  async function issue() {
    check();
    const context = await host.storage.accountFileContext();
    check();
    if (!context.valid()) throw Error('Sign in again to use MailCraft.');
    const result = await context.files.request('ticket', {resource: 'mailcraft'});
    check();
    if (!context.valid() || result?.session !== mailSession ||
        !/^[a-z][a-z0-9]{2,27}@ksu\.codes$/.test(result?.address ?? '') ||
        !/^[A-Za-z0-9_-]{43}$/.test(result?.ticket ?? '')) {
      throw Error('The mailbox authorization was invalid.');
    }
    return result;
  }

  const mailbox = document.createElement('div');
  mailbox.style.cssText = 'display:flex;flex-direction:column;height:100%;color:var(--desktop-text)';
  const status = document.createElement('div');
  status.setAttribute('role', 'status');
  status.style.cssText = 'background:var(--desktop-raised);overflow-wrap:anywhere';
  function showStatus(message) {
    status.style.padding = message ? '8px 12px' : '';
    status.textContent = message;
  }

  const frame = document.createElement('iframe');
  frame.title = 'MailCraft mailbox';
  frame.referrerPolicy = 'no-referrer';
  frame.style.cssText = 'display:block;width:100%;flex:1;min-height:0;border:0';
  const ready = (async () => {
    try {
      let initial = await issue();
      const address = initial.address;
      const receive = event => {
        if (event.origin !== location.origin || event.source !== frame.contentWindow ||
            event.data !== 'mailcraft-awaiting-account' || !current()) return;
        frame.contentWindow.mailcraftWebosTicket = async () => {
          check();
          if (initial) {
            const ticket = initial.ticket;
            initial = null;
            return ticket;
          }
          let refreshed;
          try {
            refreshed = await issue();
          } catch (error) {
            if (current() && error.status === 401) showStatus(signedOut);
            if (current() && error.status === 403) showStatus('This WebOS account no longer has MailCraft access.');
            throw error;
          }
          if (refreshed.address !== address) {
            showStatus('The approved mailbox changed. Close and reopen MailCraft.');
            throw Error('The approved mailbox changed.');
          }
          showStatus('');
          return refreshed.ticket;
        };
        event.source.postMessage({mailcraftAccount: address, mailcraftSession: mailSession}, location.origin);
        window.removeEventListener('message', receive);
      };
      window.addEventListener('message', receive, {signal: host.signal});
      frame.src = new URL('./native/index.html?empty&webgl', import.meta.url).href;
      mailbox.append(status, frame);
      element.replaceChildren(mailbox);
    } catch (error) {
      if (current()) {
        let message = 'MailCraft could not open this mailbox. Try opening MailCraft again.';
        if (error.status === 401) message = signedOut;
        if (error.status === 403) message = 'This WebOS account has no approved MailCraft mailbox.';
        showStatus(message);
        mailbox.append(status);
        element.replaceChildren(mailbox);
      }
    }
  })();

  return {
    element, ready,
    dispose() { frame.remove(); },
    focus() { if (current()) frame.focus(); },
  };
}
