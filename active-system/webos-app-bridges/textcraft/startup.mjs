// SPDX-License-Identifier: MIT
const files = window.frameElement?.textcraftFiles;
if (files) {
  async function call(method, args) {
    try {
      return await files[method](...args);
    } catch (error) {
      files.status(error.message);
      throw error;
    }
  }
  globalThis.textcraftWorkspace = {
    ...files,
    open: (...args) => call('open', args),
    readOpen: (...args) => call('readOpen', args),
    saveAs: (...args) => call('saveAs', args),
    persist: async (...args) => files.persist(...args),
  };
}

try {
  const bindings = await import('./textcraft.js');
  await bindings.default();
} catch (error) {
  const message = 'TextCraft could not start. ' + (error?.message || String(error));
  const loading = document.getElementById('notecraft_loading');
  if (loading) loading.textContent = message;
  files?.failed(message);
}
