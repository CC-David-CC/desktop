import init, {WebHandle} from './projectcraft.js';

const host = window.frameElement?.projectcraftHost;
let editor;
try {
  await init();
  editor = new WebHandle();
  await editor.start(document.getElementById('projectcraft'), Math.floor(Date.now() / 86400000));
  host?.connect(editor);
} catch (error) {
  editor?.destroy();
  host?.fail(error instanceof Error ? error.message : String(error));
}
