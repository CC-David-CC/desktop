'use strict';
let publicAppLoader;
function publicAppHost(desktop,w,id){return {version:2,desktop,w,ui:{make,textButton,appInput,feedback,applyInputMode:applyScreenKeyboardPolicy},session:()=>currentSession,guestState:()=>guestState,guestMessage:()=>guestMessage,storage:{mirrorFileContext,...(id==='files'?{guestFileContext}:{}),pickFile:pickMirrorFile,openMirrorEditor,openMirrorDocument,signedInSubject},tools:{loadCodeMirror:async()=>{const l=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return l.loadApp('codemirror');},loadMermaid:async()=>{const l=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return (await l.loadApp('mermaid')).library;},loadECharts:async()=>{const l=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return (await l.loadApp('echarts')).library;},loadPlotly:async()=>{const l=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return (await l.loadApp('plotly')).library;},loadPdfme:async()=>{const l=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return (await l.loadApp('pdfme')).library;},loadTransformers:async()=>{const l=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return (await l.loadApp('transformers')).library;},loadMapLibre:async()=>{const l=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return (await l.loadApp('maplibre')).library;},loadZip:async()=>{const loader=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return loader.loadApp('zip');},createFFmpeg:async()=>{const loader=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return (await loader.loadApp('ffmpeg')).createFFmpeg();},createWaveSurfer:async options=>{const loader=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return (await loader.loadApp('wavesurfer')).createWaveSurfer(options);},loadTone:async()=>{const loader=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return (await loader.loadApp('tone')).Tone;}},terminal:{terminalSession,sendTerminalBytes,sendTerminal:(...args)=>sendTerminal(...args),attachTerminalRenderer,resizeTerminal,enableKeyboard:()=>setScreenKeyboardEnabled(true)}};}
function publicAppContent(id,desktop,w){
  const placeholder=make('div','window-content app-loading','Loading '+w.title+'…');placeholder.dataset.appLoading=id;
  const load=async()=>{
    let instance;
    try{
      const loader=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));
      const module=await loader.loadApp(id);
      if(!placeholder.isConnected||desktop&&!desktop.windows.includes(w))return;
      const host=publicAppHost(desktop,w,id);
      instance=loader.mountApp(module,host);const body=instance.element;
      if(!placeholder.isConnected||desktop&&!desktop.windows.includes(w)){instance.dispose('View removed during mount');return;}
      if(!(body instanceof HTMLElement)||!body.classList.contains('window-content'))throw Error('Invalid app view');
      placeholder.replaceWith(body);applyScreenKeyboardPolicy(body);
      const win=body.closest('.window');if(win){win.editorState=w.editor;win.appView=instance;}
    }catch(error){
      instance?.dispose('Mount failed');
      if(!placeholder.isConnected)return;
      placeholder.replaceChildren(make('p','','Could not load this app. '+error.message),textButton('Retry',()=>{placeholder.textContent='Loading…';load();}));
    }
  };
  load();return placeholder;
}
function disposePublicAppView(win,reason='View removed'){
  const view=win.appView;win.appView=null;view?.dispose(reason);
}
// Adapter for the pinned v86 filesystem. All contents live in browser memory.
const guestFiles = {
  emulator:null, ready:false, trashOrigins:new Map(),
  path(value='/') {
    value=String(value).replace(/^\/home\/guest(?=\/|$)/,'');
    const parts=[];
    for(const part of value.split('/')) {if(!part||part==='.')continue;if(part==='..')parts.pop();else {if(part.includes('\0'))throw Error('Invalid filename.');parts.push(part);}}
    return '/'+parts.join('/');
  },
  name(value) {value=String(value).trim();if(!value||value==='.'||value==='..'||/[\/\0]/.test(value))throw Error('Enter a filename without slashes.');return value;},
  async request(method,...args){if(!this.ready||!this.emulator)throw Error('Guest home is still starting.');return this.emulator.request(method,...args);},
  stat(path){return this.request('stat',this.path(path));},
  list(path){return this.request('list',this.path(path));},
  async mkdir(path){await this.request('mkdir',this.path(path));this.changed();},
  read(path){return this.request('read',this.path(path));},
  async write(path,data){await this.request('write',this.path(path),data);this.changed();},
  async trash(path){await this.request('trash',this.path(path));this.changed();},
  async restore(path){await this.request('restore',this.path(path));this.changed();},
  changed(){document.querySelectorAll('[data-file-list]').forEach(n=>n.reload?.());window.dispatchEvent(new Event('codi-guest-files-changed'));},
  async connect(emulator,{networkRelay=false}={}){this.emulator=emulator;this.ready=true;
    for(const dir of ['Desktop','Documents','Downloads','Pictures','Projects','Trash'])await this.mkdir('/'+dir);
    await this.write('/Documents/README.txt','Welcome to CodiServer.\n\nFiles and Text Editor share /home/guest with the Linux terminal.\nTry: ls; cat Documents/README.txt; echo hello > notes.txt\n\nThe Linux filesystem is temporary and separate from your account files.\nRefresh Files after changing files in the terminal.\n\nThe terminal runs BusyBox Linux as guest (UID 1000). Use help, ls, cat, cp, mv, mkdir, grep, sed, awk and vi.\nLoopback networking works: ping -c 2 127.0.0.1\n'+(networkRelay?'Guest Internet uses the relay host and its Internet connection, not this computer\'s connection.\nTry: ping -c 2 1.1.1.1\nHTTP example: timeout 15 wget -O /tmp/example.html http://example.com\nThis BusyBox wget does not support -T; use timeout instead.\n':'Guest Internet networking is not configured for this page.\n')+'Websites open in your normal browser tabs.\n\nEverything in this Linux guest session is temporary.\n');
    this.changed();
  }
};
function appInput(label,value=''){const n=make('input');n.value=value;n.setAttribute('aria-label',label);return n;}
const serverFilesAvailable=()=>window.CODI_PRIVATE_FILES_UI===1&&identityConfig?.gateway?.version==='codi-user-files/1';
let serverFilesModule;
async function serverFileContext(){
  const session=currentSession,owner=signedInSubject();
  if(!serverFilesAvailable()||!owner)throw Error('Sign in to use your private server files.');
  const module=await (serverFilesModule??=import(identityConfig.gateway.basePath+'/client.mjs').catch(error=>{serverFilesModule=null;throw error;}));
  const valid=()=>currentSession===session&&signedInSubject()===owner;
  if(!valid())throw Error('Account changed. Open your server files again.');
  return {owner,session,valid,files:new module.UserFiles(identityConfig,session,{sessionValid:valid})};
}
// Refresh lists after shell operations without replacing editor/terminal DOM.
setInterval(()=>guestFiles.changed(),2500);

// One account-bound mirror for all desktop apps. Recreate it after a session change.
let mirrorContextPromise, mirrorSession, mirrorInstance;
async function mirrorFileContext(){
  const session=currentSession, owner=signedInSubject();
  if(!owner||!serverFilesAvailable())throw Error('Sign in to use your files.');
  if(mirrorSession!==session){mirrorInstance?.close();mirrorInstance=null;mirrorContextPromise=null;mirrorSession=session;}
  if(!mirrorContextPromise)mirrorContextPromise=(async()=>{
    const [server,module]=await Promise.all([serverFileContext(),import('./storage/browser/mirror.mjs')]);
    if(currentSession!==session||signedInSubject()!==owner)throw Error('Account changed. Reopen your files.');
    const scope=JSON.stringify(['codi-file-mirror/1',identityConfig.identity.issuer,owner]);
    const files=new module.MirroredFiles({scope,server:server.files,valid:server.valid});
    mirrorInstance=files;
    // The browser decides whether to grant persistent storage; no guarantee.
    navigator.storage?.persist?.().catch(()=>{});files.sync().catch(()=>{});
    return {owner,files,valid:server.valid,path:module.filePath,name:module.fileName};
  })().catch(error=>{if(mirrorSession===session)mirrorContextPromise=null;throw error;});
  return mirrorContextPromise;
}
function startMirror(){if(signedInSubject()&&serverFilesAvailable())mirrorFileContext().catch(console.error);else{mirrorInstance?.close();mirrorInstance=null;mirrorContextPromise=null;mirrorSession=null;}}
// The v86 home is an in-memory 9p filesystem. It is not the account mirror.
async function guestFileContext(){
 const owner=signedInSubject(),session=currentSession,emulator=guestFiles.emulator;
 if(!owner||!guestFiles.ready||!emulator)throw Error('Linux home is still starting.');
 const valid=()=>signedInSubject()===owner&&currentSession===session&&guestFiles.ready&&guestFiles.emulator===emulator;
 const check=()=>{if(!valid())throw Error('Linux guest restarted. Reopen Linux home.');};
 const hash=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');
 const read=async path=>{check();const info=await guestFiles.stat(path);if(info.dir)throw Error('Choose a file.');if(info.size>8*1024*1024)throw Error('Files are limited to 8 MiB.');const data=await guestFiles.read(path);check();return {data,version:await hash(data),status:'synced'};};
 const files={
  async list(path='/'){check();const entries=await guestFiles.list(path),rows=[];if(entries.length>500)throw Error('Linux folder has more than 500 items.');for(const f of entries){check();rows.push({path:f.path,name:f.name,directory:f.dir,bytes:f.dir?null:f.size,version:f.dir?null:f.size>8*1024*1024?'too-large':(await read(f.path)).version,status:'synced'});}return {entries:rows};},
  async status(){return {ephemeral:true};},async sync(){check();},
  subscribe(fn){const notify=()=>{if(valid())fn();};window.addEventListener('codi-guest-files-changed',notify);return ()=>{window.removeEventListener('codi-guest-files-changed',notify);};},
  read,
  async write(path,data,expected=null){check();let old=null;try{old=await read(path);}catch(error){if(!String(error.message).startsWith('File or folder not found:'))throw error;}if(expected===null?!!old:!old||old.version!==expected)throw Error('Linux file changed; reload before saving.');await guestFiles.write(path,data);const r=await read(path);guestFiles.changed();return r;},
  async mkdir(path){check();await guestFiles.mkdir(path);},
  async move(source,destination,expected){check();const old=await read(source);if(old.version!==expected)throw Error('Linux file changed; reload before moving.');await guestFiles.request('move',source,destination);guestFiles.changed();},
  async remove(path,expected){check();const info=await guestFiles.stat(path);if(!info.dir&&(await read(path)).version!==expected)throw Error('Linux file changed; reload before deleting.');await guestFiles.request('remove',path);guestFiles.changed();}
 };
 return {owner,files,valid,path:value=>guestFiles.path(value),name:value=>guestFiles.name(value),storage:'guest'};
}
// One account-bound picker for desktop apps; no host-computer picker is used.
async function pickMirrorFile({extensions=[],signal}={}){
 if(!Array.isArray(extensions)||extensions.some(x=>typeof x!=='string'||!/^\.[a-z0-9]{1,16}$/i.test(x)))throw Error('Invalid file filter.');
 if(signal?.aborted)return null;const context=await mirrorFileContext();if(signal?.aborted||!context.valid())return null;
 const dialog=document.createElement('dialog');dialog.className='codi-file-picker';dialog.setAttribute('aria-label','Choose from My files');
 const heading=make('h2','','Choose from My files'),location=make('div','codi-picker-location'),list=make('div','codi-picker-list'),status=make('div','app-status'),bar=make('div','codi-picker-bar');let dir='/',closed=false,revision=0,finish;
 const cancel=textButton('Cancel',()=>finish(null)),up=textButton('Up',()=>{if(dir!=='/'){dir=dir.slice(0,dir.lastIndexOf('/'))||'/';refresh();}});bar.append(up,cancel);dialog.append(heading,location,list,status,bar);document.body.append(dialog);
 async function refresh(){const n=++revision;location.textContent='My files: '+dir;up.disabled=dir==='/';list.replaceChildren();status.textContent='Loading…';try{const data=await context.files.list(dir);if(closed||n!==revision||!context.valid())return;const rows=data.entries.filter(x=>!x.deleted);for(const row of rows){const matches=row.directory||!extensions.length||extensions.some(ext=>row.name.toLowerCase().endsWith(ext.toLowerCase()));const b=textButton((row.directory?'📁 ':'')+row.name,()=>{if(row.directory){dir=row.path;refresh();}else finish(row.path);});b.disabled=!matches||row.status==='conflict';b.setAttribute('aria-label',(row.directory?'Open folder ':'Choose file ')+row.name);list.append(b);}status.textContent=rows.length?'Select a file.':'This folder is empty.';}catch(error){if(!closed&&n===revision)status.textContent=error.message;}}
 return new Promise(resolve=>{finish=value=>{if(closed)return;closed=true;revision++;signal?.removeEventListener('abort',aborted);if(dialog.open)dialog.close();dialog.remove();resolve(value);};const aborted=()=>finish(null);signal?.addEventListener('abort',aborted,{once:true});dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});if(signal?.aborted){finish(null);return;}dialog.showModal();refresh();});
}
function openMirrorEditor(desktop,owner,path){if(owner===signedInSubject())desktop.open('text',Object.freeze({version:1,storage:'mirror',path,owner}));}

function openMirrorDocument(desktop,owner,path){if(owner!==signedInSubject())return;const app=/\.ipynb$/i.test(path)?'notebook':/\.drawio$/i.test(path)?'diagrams-net':/\.svg$/i.test(path)?'svg-editor':/\.excalidraw$/i.test(path)?'excalidraw':/\.(?:stl|obj|3mf)$/i.test(path)?'mesh-tool':/\.(?:gcode|gco|nc)$/i.test(path)?'gcode-preview':/\.(?:wav|mp3|m4a|ogg|opus|webm|flac)$/i.test(path)?'audio-editor':/\.csv$/i.test(path)?'data-explorer':/\.(?:codisheet|xlsx)$/i.test(path)?'spreadsheet':/\.pdf$/i.test(path)?'pdf-viewer':/\.(?:doc|codidoc)$/i.test(path)?'document-editor':/\.(?:png|jpe?g|webp)$/i.test(path)?'image-editor':'text';desktop.open(app,Object.freeze({version:1,storage:'mirror',path,owner}));}
