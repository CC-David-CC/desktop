'use strict';
let publicAppLoader,publicCommandRegistryPromise;
function publicCommandRegistry(){
 return publicCommandRegistryPromise??=import('./assets/desktop/command-registry.mjs').then(({createCommandRegistry})=>{
  const registry=createCommandRegistry({currentSubject:signedInSubject,currentSession:()=>currentSession});
  // In-page API only. No remote-agent transport is installed by this service.
  window.codiDesktopCommands=Object.freeze({list:registry.list,execute:registry.execute});
  return registry;
 }).catch(error=>{publicCommandRegistryPromise=null;throw error;});
}
// Promises settle false on cancellation or app disposal, so stale actions cannot continue.
function confirmDesktop(message,{title='Confirm',confirmLabel='Continue',cancelLabel='Cancel',danger=false,signal,requireTrustedClick=false}={}){
 if(signal?.aborted)return Promise.resolve(false);
 const dialog=document.createElement('dialog');dialog.className='codi-confirm-dialog';
 const heading=make('h2','',title),body=make('p','',message),actions=make('div','codi-confirm-actions');
 const titleId='codi-confirm-'+crypto.randomUUID();heading.id=titleId;dialog.setAttribute('aria-labelledby',titleId);
 return new Promise(resolve=>{let done=false;const finish=value=>{if(done)return;done=true;signal?.removeEventListener('abort',abort);if(dialog.open)dialog.close();dialog.remove();resolve(value);};const abort=()=>finish(false);actions.append(textButton(cancelLabel,()=>finish(false)),textButton(confirmLabel,event=>{if(!requireTrustedClick||event.isTrusted)finish(true);},danger?'codi-confirm-danger':''));dialog.append(heading,body,actions);document.body.append(dialog);dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){finish(false);return;}try{dialog.showModal();actions.firstElementChild.focus();}catch(error){finish(false);}});
}
function promptDesktop(label,{title='Enter a name',value='',confirmLabel='OK',cancelLabel='Cancel',signal}={}){
 if(signal?.aborted)return Promise.resolve(null);
 const dialog=document.createElement('dialog');dialog.className='codi-confirm-dialog';const heading=make('h2','',title),form=document.createElement('form'),field=document.createElement('label'),input=document.createElement('input'),actions=make('div','codi-confirm-actions');
 const titleId='codi-prompt-'+crypto.randomUUID();heading.id=titleId;dialog.setAttribute('aria-labelledby',titleId);field.textContent=label;input.type='text';input.value=String(value);input.autocomplete='off';field.append(input);form.append(field,actions);dialog.append(heading,form);
 return new Promise(resolve=>{let done=false;const finish=result=>{if(done)return;done=true;signal?.removeEventListener('abort',abort);if(dialog.open)dialog.close();dialog.remove();resolve(result);};const abort=()=>finish(null);const cancel=textButton(cancelLabel,()=>finish(null)),submit=textButton(confirmLabel,()=>finish(input.value));submit.type='submit';actions.append(cancel,submit);form.addEventListener('submit',event=>{event.preventDefault();finish(input.value);});dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});document.body.append(dialog);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){finish(null);return;}try{dialog.showModal();input.focus();input.select();}catch{finish(null);}});
}
function publicAppHost(desktop,w,id){return {version:2,desktop,w,...(id==='microduck'?{microduckRunnerOrigin:identityConfig?.microduck?.runnerOrigin??null}:{}),ui:{make,textButton,appInput,feedback,confirm:confirmDesktop,prompt:promptDesktop,applyInputMode:applyScreenKeyboardPolicy,enableKeyboard:()=>setScreenKeyboardEnabled(true)},session:()=>currentSession,...(id==='browser'?{browserRelay:{available:()=>!!identityConfig?.browserRelay,open:async options=>{const session=currentSession;const module=await import('./assets/desktop/browser-relay-client.mjs');return module.openBrowserRelay(identityConfig,session,{...options,valid:()=>currentSession===session});}}}:{}),guestState:()=>guestState,guestMessage:()=>guestMessage,storage:{accountFileContext:serverFileContext,mirrorFileContext,...(id==='jsketcher'?{readCadSource:async(owner,name,{signal}={})=>{if(typeof name!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name)||signal?.aborted)throw Error('Invalid source request.');const c=await serverFileContext();if(c.owner!==owner||!c.valid()||signal?.aborted)throw Error('Account changed.');const result=await c.files.request('cad-source',{resource:'cad-sources',path:name},null,'blob',{signal});if(c.owner!==owner||!c.valid()||signal?.aborted)throw Error('Account changed.');return result.data;}}:{}),...(id==='files'?{guestFileContext,wordCountOnServer:async(owner,path,sha256)=>{const c=await serverFileContext();if(c.owner!==owner||!c.valid())throw Error('Account changed.');return c.files.wordCount(path,sha256);}}:{}),pickFile:pickMirrorFile,pickFolder:pickMirrorFolder,pickAccountFile,openMirrorEditor,openMirrorDocument,signedInSubject},tools:{loadNarrator:async()=>{const loader=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));const {narrate,renderAudio,voices,sampleRate}=await loader.loadApp('narrator');return {narrate,renderAudio,voices,sampleRate};},loadGLTFTransform:async()=>{const l=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return l.loadApp('gltf-transform');},loadOpenCascade:async()=>{const l=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return l.loadApp('opencascade');},loadYjs:async()=>{const l=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return (await l.loadApp('yjs')).library;},loadWebTorrent:async()=>{const l=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return (await l.loadApp('webtorrent')).library;},loadOnnxRuntime:async()=>{const l=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return (await l.loadApp('onnx-runtime')).library;},loadTanStackVirtual:async()=>{const l=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return (await l.loadApp('tanstack-virtual')).library;},loadTrystero:async()=>{const l=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return (await l.loadApp('trystero')).library;},loadCodeMirror:async()=>{const l=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return l.loadApp('codemirror');},loadMermaid:async()=>{const l=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return (await l.loadApp('mermaid')).library;},loadECharts:async()=>{const l=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return (await l.loadApp('echarts')).library;},loadPlotly:async()=>{const l=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return (await l.loadApp('plotly')).library;},loadPdfme:async()=>{const l=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return (await l.loadApp('pdfme')).library;},loadTransformers:async()=>{const l=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return (await l.loadApp('transformers')).library;},loadMapLibre:async()=>{const l=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return (await l.loadApp('maplibre')).library;},loadZip:async()=>{const loader=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return loader.loadApp('zip');},createFFmpeg:async()=>{const loader=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return (await loader.loadApp('ffmpeg')).createFFmpeg();},createWaveSurfer:async options=>{const loader=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return (await loader.loadApp('wavesurfer')).createWaveSurfer(options);},loadTone:async()=>{const loader=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));return (await loader.loadApp('tone')).Tone;}},terminal:{accountHome:useAccountGuestHome,terminalSession,sendTerminalBytes,sendTerminal:(...args)=>sendTerminal(...args),attachTerminalRenderer,resizeTerminal,enableKeyboard:()=>setScreenKeyboardEnabled(true)}};}
function publicAppContent(id,desktop,w){
  const placeholder=make('div','window-content app-loading','Loading '+w.title+'…');placeholder.dataset.appLoading=id;
  const load=async()=>{
    let instance;
    try{
      const loader=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));
      const module=await loader.loadApp(id);
      if(!placeholder.isConnected||desktop&&!desktop.windows.includes(w))return;
      const host=publicAppHost(desktop,w,id);
      if(id==='files')host.refreshPanelPins=()=>panelPins?.refresh();
      if(desktopAgentOperations)host.registerAgentView=desktopAgentOperations.register;
      try{const registry=await publicCommandRegistry(),owner=w.ownerSub||signedInSubject();if(owner)host.commands=registry.scope({windowId:String(w.id),appId:id,owner,isOpen:()=>desktop.windows.includes(w)});}catch(error){console.error('App command service unavailable',error);}
      if(!placeholder.isConnected||desktop&&!desktop.windows.includes(w))return;
      instance=loader.mountApp(module,host);const body=instance.element;
      if(!placeholder.isConnected||desktop&&!desktop.windows.includes(w)){instance.dispose('View removed during mount');return;}
      if(!(body instanceof HTMLElement)||!body.classList.contains('window-content'))throw Error('Invalid app view');
      placeholder.replaceWith(body);applyScreenKeyboardPolicy(body);
      const win=body.closest('.window');if(win){win.editorState=w.editor;win.appView=instance;}
      if(id==='terminal')void startGuest();
      if(w.focusWhenReady){w.focusWhenReady=false;if(desktop.active===w.id&&desktop.current===w.workspace)instance.focus?.();}
    }catch(error){
      instance?.dispose('Mount failed');
      if(!placeholder.isConnected)return;
      placeholder.replaceChildren(make('p','','Could not load this app. '+error.message),textButton('Retry',()=>{placeholder.textContent='Loading…';load();}));
    }
  };
  load();return placeholder;
}
function disposePublicAppView(win,reason='View removed'){
  const view=win.appView;win.appView=null;return view?.dispose(reason)||[];
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
// The guest CPU is paused while reading this tree. The registered subject owns
// the destination. On retry, an identical server revision is already confirmed.
async function promoteGuestHome(guest, files, session) {
  const internalSession = JSON.stringify({sessionId:session.id,kind:session.kind,displayName:session.displayName});
  const directories = [''];
  while (directories.length) {
    const parent = directories.pop();
    const entries = await guest.list(parent);
    const existing = new Map((await files.list(parent)).entries.map(entry => [entry.name, entry]));
    for (const entry of entries) {
      const name = entry.name;
      if (!name || name === '.' || name === '..' || /[\/\x00]/.test(name)) throw Error('Invalid guest filename.');
      const path = parent ? parent + '/' + name : name;
      const dest = existing.get(name);
      if (entry.dir) {
        if (dest && !dest.directory) throw Error('A file already exists at ' + path);
        if (!dest) await files.mkdir(path);
        directories.push(path);
        continue;
      }
      if ((entry.mode & 0o170000) !== 0o100000) throw Error('Only regular files and folders can be transferred. Check ' + path);
      const data = await guest.read(path);
      if (path === 'session.json' && data.length < 1024 && new TextDecoder().decode(data) === internalSession) continue;
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
      const sha256 = Array.from(digest, byte => byte.toString(16).padStart(2,'0')).join('');
      if (dest?.directory) throw Error('A folder already exists at ' + path);
      if (!dest) await files.write(path, data, null);
      if ((await files.version(path)).sha256 !== sha256) throw Error('Account contents differ at ' + path);
    }
  }
}

function appInput(label,value=''){const n=make('input');n.value=value;n.setAttribute('aria-label',label);return n;}
const serverFilesAvailable=()=>window.CODI_PRIVATE_FILES_UI===1&&identityConfig?.gateway?.version==='codi-user-files/1';
const sessionFileClients=new WeakMap();
async function serverFileContext(){
  const session=currentSession,owner=signedInSubject();
  if(!serverFilesAvailable()||!owner)throw Error('Sign in to use your private server files.');
  const valid=()=>currentSession===session&&signedInSubject()===owner;
  if(!sessionFileClients.has(session))sessionFileClients.set(session,new accountServices.UserFiles(sessionAccounts.get(session).createFileAuthority()));
  return {owner,valid,files:sessionFileClients.get(session)};
}
// Refresh lists after shell operations without replacing editor/terminal DOM.
setInterval(()=>guestFiles.changed(),2500);

// One account-bound mirror for all desktop apps. Recreate it after a session change.
let mirrorContextPromise, mirrorSession, mirrorInstance, mirrorGeneration=0, mirrorSuspended=false;
function closeAccountMirror({suspend=false}={}){
  if(suspend)mirrorSuspended=true;
  ++mirrorGeneration;
  mirrorInstance?.close();mirrorInstance=null;mirrorContextPromise=null;mirrorSession=null;
}
async function mirrorFileContext(){
  const session=currentSession, owner=signedInSubject();
  if(mirrorSuspended||!owner||!serverFilesAvailable())throw Error('Sign in to use your files.');
  if(mirrorSession!==session){closeAccountMirror();mirrorSession=session;}
  if(!mirrorContextPromise){const generation=mirrorGeneration;mirrorContextPromise=(async()=>{
    const [server,module,context]=await Promise.all([serverFileContext(),import('./storage/browser/mirror.mjs'),import('./storage/browser/account-context.mjs')]);
    if(generation!==mirrorGeneration||currentSession!==session||signedInSubject()!==owner)throw Error('Account changed. Reopen your files.');
    const files=await context.openAccountFileMirror({issuer:identityConfig.identity.issuer,owner,server:server.files,valid:server.valid,storage:identityConfig.fileStorage??null});
    if(generation!==mirrorGeneration||currentSession!==session||signedInSubject()!==owner){files.close();throw Error('Account changed. Reopen your files.');}
    mirrorInstance=files;
    // The browser decides whether to grant persistent storage; no guarantee.
    navigator.storage?.persist?.().catch(()=>{});files.sync().catch(()=>{});
    return {owner,files,valid:server.valid,path:module.filePath,name:module.fileName};
  })().catch(error=>{if(generation===mirrorGeneration&&mirrorSession===session)mirrorContextPromise=null;throw error;});}
  return mirrorContextPromise;
}
function startMirror(){mirrorSuspended=false;if(signedInSubject()&&serverFilesAvailable())mirrorFileContext().catch(console.error);else closeAccountMirror();}
// The v86 home is an in-memory 9p filesystem. It is not the account mirror.
async function guestFileContext(){
 const owner=signedInSubject(),session=currentSession,emulator=guestFiles.emulator;
 if(!owner||!guestFiles.ready||!emulator)throw Error('Linux home is still starting.');
 const valid=()=>signedInSubject()===owner&&currentSession===session&&guestFiles.ready&&guestFiles.emulator===emulator;
 const check=()=>{if(!valid())throw Error('Linux guest restarted. Reopen Linux home.');};
 const hash=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');
 const read=async path=>{check();const info=await guestFiles.stat(path);if(info.dir)throw Error('Choose a file.');if(info.size>128*1024*1024)throw Error('Files are limited to 128 MiB.');const data=await guestFiles.read(path);check();return {data,version:await hash(data),status:'synced'};};
 const files={
  async list(path='/'){check();const entries=await guestFiles.list(path),rows=[];if(entries.length>500)throw Error('Linux folder has more than 500 items.');for(const f of entries){check();rows.push({path:f.path,name:f.name,directory:f.dir,bytes:f.dir?null:f.size,version:f.dir?null:f.size>128*1024*1024?'too-large':(await read(f.path)).version,status:'synced'});}return {entries:rows};},
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
async function pickStorageFile(loadContext,{extensions=[],signal,foldersOnly=false}={}){
 if(!Array.isArray(extensions)||extensions.some(x=>typeof x!=='string'||!(x.length<=32&&/^\.[a-z0-9]+(?:[-.][a-z0-9]+)*$/i.test(x))))throw Error('Invalid file filter.');
 if(signal?.aborted)return null;const context=await loadContext();if(signal?.aborted||!context.valid())return null;
 const dialog=document.createElement('dialog');dialog.className='codi-file-picker';dialog.setAttribute('aria-label',foldersOnly?'Choose folder in My files':'Choose from My files');
 const heading=make('h2','',foldersOnly?'Choose a folder':'Choose from My files'),location=make('div','codi-picker-location'),list=make('div','codi-picker-list'),status=make('div','app-status'),bar=make('div','codi-picker-bar');let dir='/',closed=false,revision=0,finish,unsubscribe=()=>{},rendered='';
 const cancel=textButton('Cancel',()=>finish(null)),up=textButton('Up',()=>{if(dir!=='/'){dir=dir.slice(0,dir.lastIndexOf('/'))||'/';rendered='';list.replaceChildren();refresh();}});const chooseFolder=textButton('Use this folder',()=>finish(context.valid()?dir:null));chooseFolder.disabled=true;if(foldersOnly)bar.append(up,chooseFolder,cancel);else bar.append(up,cancel);dialog.append(heading,location,list,status,bar);document.body.append(dialog);
 async function refresh(){
  const n=++revision,requested=dir;location.textContent='My files: '+requested;up.disabled=requested==='/';
  if(!rendered){chooseFolder.disabled=true;status.textContent='Loading…';}
  try{
   const data=await context.files.list(requested);if(closed||n!==revision||!context.valid())return;
   const rows=data.entries.filter(x=>!x.deleted&&(!foldersOnly||x.directory));
   const signature=JSON.stringify([requested,rows.map(x=>[x.name,x.path,x.directory,x.status==='conflict'])]);chooseFolder.disabled=false;
   if(signature!==rendered){
    const focused=list.contains(document.activeElement)?document.activeElement.getAttribute('data-picker-path'):null;
    list.replaceChildren();
    for(const row of rows){
     const matches=row.directory||!extensions.length||extensions.some(ext=>row.name.toLowerCase().endsWith(ext.toLowerCase()));
     const b=textButton((row.directory?'📁 ':'')+row.name,()=>{if(row.directory){dir=row.path;rendered='';list.replaceChildren();refresh();}else finish(row.path);});
     b.disabled=!matches||row.status==='conflict';b.setAttribute('aria-label',(row.directory?'Open folder ':'Choose file ')+row.name);b.setAttribute('data-picker-path',row.path);list.append(b);
    }
    rendered=signature;if(focused){const target=[...list.children].find(x=>x.getAttribute('data-picker-path')===focused&&!x.disabled);target?.focus();}
   }
   status.textContent=rows.length?(foldersOnly?'Open a folder or use this one.':'Select a file.'):(foldersOnly?'No folders here. You can use this folder.':'This folder is empty.');
  }catch(error){if(!closed&&n===revision){list.replaceChildren();rendered='';chooseFolder.disabled=true;status.textContent=error.message;}}
 }
 return new Promise(resolve=>{finish=value=>{if(closed)return;closed=true;revision++;unsubscribe();signal?.removeEventListener('abort',aborted);if(dialog.open)dialog.close();dialog.remove();resolve(value);};const aborted=()=>finish(null);signal?.addEventListener('abort',aborted,{once:true});dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});if(signal?.aborted){finish(null);return;}dialog.showModal();unsubscribe=context.files.subscribe?.(()=>{if(!closed)refresh();})??unsubscribe;refresh();});
}
function pickMirrorFile(options){return pickStorageFile(mirrorFileContext,options);}
async function pickMirrorFolder({signal}={}){return pickMirrorFile({signal,foldersOnly:true});}
function pickAccountFile(options){
  return pickStorageFile(async()=>{
    const context=await serverFileContext();
    return {valid:context.valid,files:{async list(path){
      const data=await context.files.list(path.slice(1));
      return {entries:data.entries.map(entry=>({...entry,path:(path==='/'?'':path)+'/'+entry.name}))};
    }}};
  },options);
}
function openMirrorEditor(desktop,owner,path){if(owner===signedInSubject())desktop.open('text',Object.freeze({version:1,storage:'mirror',path,owner}));}

async function openSavedGameDocument(desktop,owner,path){let app='text';try{const c=await mirrorFileContext();if(owner!==signedInSubject()||!c.valid())return;const info=await c.files.stat(path);if(owner!==signedInSubject()||!c.valid())return;if(info.bytes<=1024*1024){const file=await c.files.read(path);if(owner!==signedInSubject()||!c.valid())return;if(file.data.byteLength<=1024*1024){const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(file.data));if(value?.format==='ksu.game.save'&&['falling-blocks','owl-companion','physics-playground','snake-garden','clockwork-room','chess-study','solitaire','sky-courier','marble-works','stack-balance','crystal-defense','drone-circuit','reactive-control-desk','story-cards','expression-puppet','rhythm-garden','lantern-leap','garden-defense','pocket-rally','sling-targets','gravity-pinball','kinetic-relay','tabletop-bot-arena','pocket-golf','target-garden','orbital-courier','clockwork-quest','memory-garden'].includes(value.appId))app=value.appId;}}}catch{}if(owner===signedInSubject())desktop.open(app,Object.freeze({version:1,storage:'mirror',path,owner}));}
function openMirrorDocument(desktop,owner,path){if(owner!==signedInSubject())return;if(/\.game\.json$/i.test(path)){void openSavedGameDocument(desktop,owner,path);return;}const app=/\.brf$/i.test(path)?'microduck':/\.stitchfoundry$/i.test(path)?'embroidery-studio':/\.stitch\.svg$/i.test(path)||/\.(?:pes|dst|jef|exp|vp3|xxx)$/i.test(path)?'stitch-converter':/\.pico$/i.test(path)?'pico-simulator':/\.hex$/i.test(path)?'arduino-simulator':/\.dez$/i.test(path)?'electronics-design':/\.kiri$/i.test(path)?'kiri-moto':/\.meshproj$/i.test(path)?'mesh-tool':/\.circuit$/i.test(path)?'circuitjs':/\.logic\.json$/i.test(path)?'digital-logic':/\.codi-data\.json$/i.test(path)?'data-explorer':/(?:\.cad|\.jsketcher\.json)$/i.test(path)?'jsketcher':/\.replicad\.json$/i.test(path)?'replicad':/\.(?:ipynb|light\.py|percent\.py)$/i.test(path)?'notebook':/\.drawio$/i.test(path)?'diagrams-net':/\.svg$/i.test(path)?'svg-editor':/\.excalidraw$/i.test(path)?'excalidraw':/\.(?:stl|obj|3mf)$/i.test(path)?'mesh-tool':/\.(?:gcode|gco|nc)$/i.test(path)?'gcode-preview':/\.(?:amss|wav|mp3|m4a|ogg|opus|webm|flac)$/i.test(path)?'audio-editor':/\.(?:csv|tsv)$/i.test(path)?'data-explorer':/\.(?:codisheet|xlsx)$/i.test(path)?'spreadsheet':/\.pdf$/i.test(path)?'pdf-viewer':/\.(?:doc|codidoc)$/i.test(path)?'document-editor':/\.(?:png|jpe?g|webp)$/i.test(path)?'image-editor':'text';desktop.open(app,Object.freeze({version:1,storage:'mirror',path,owner}));}
