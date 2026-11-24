import init, {WebHandle} from './metriccraft.js';

const host = window.frameElement?.metriccraftHost;
let editor;
try {
  await init();
  editor = new WebHandle();
  await editor.start(document.getElementById('metriccraft'));
  host?.connect(editor);
} catch (error) {
  editor?.destroy();
  host?.fail(error instanceof Error ? error.message : String(error));
}
