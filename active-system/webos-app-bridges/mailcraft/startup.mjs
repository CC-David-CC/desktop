import init from './mailcraft.js';

const loading = document.getElementById('mailcraft_loading');
if (parent === window) {
  loading.textContent = 'Open MailCraft from the WebOS Office menu.';
} else {
  const account = await new Promise(resolve => {
    window.addEventListener('message', function receive(event) {
      if (event.origin !== location.origin || event.source !== parent ||
          !/^[a-z][a-z0-9]{2,27}@ksu\.codes$/.test(event.data?.mailcraftAccount ?? '')) return;
      window.removeEventListener('message', receive);
      resolve(event.data.mailcraftAccount);
    });
    parent.postMessage('mailcraft-awaiting-account', location.origin);
  });
  window.mailcraftJmap = {
    accounts: [{
      email: account,
      session: new URL('/jmap/session', location.origin).href,
      name: account,
    }],
  };
  try {
    await init();
  } catch {
    loading.textContent = 'MailCraft could not open this mailbox.';
  }
}
