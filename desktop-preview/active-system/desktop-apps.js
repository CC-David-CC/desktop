'use strict';
let publicAppLoader,publicDeviceHistoryTask;
function desktopHistoryServices(){
  return publicDeviceHistoryTask??=(import('./assets/desktop/device-history-host.mjs').then(({DeviceHistoryHost})=>new DeviceHistoryHost()).catch(error=>{publicDeviceHistoryTask=null;throw error;}));
}
function publicAppHost(desktop,w){return {version:2,desktop,w,ui:{make,textButton,appInput,feedback},session:()=>currentSession,guestState:()=>guestState,guestMessage:()=>guestMessage,storage:{guestFiles,serverFilesAvailable,serverFileContext,accountLinkContext,browserFileContext,browserFilesScope,browserFilesChanged,openBrowserEditor,fileVolumeBar,serverFilesChanged,openGuestEditor,openServerEditor,downloadGuestFile,signedInSubject},terminal:{terminalSession,sendTerminalBytes,sendTerminal:(...args)=>sendTerminal(...args),attachTerminalRenderer,resizeTerminal,enableKeyboard:()=>setScreenKeyboardEnabled(true)},network:desktopNetwork.appContext()};}
function publicAppContent(id,desktop,w){
  const placeholder=make('div','window-content app-loading','Loading '+w.title+'…');placeholder.dataset.appLoading=id;
  const load=async()=>{
    let instance;
    try{
      const loader=await (publicAppLoader??=import('./assets/desktop/apps.mjs'));
      const module=await loader.loadApp(id);
      if(!placeholder.isConnected||desktop&&!desktop.windows.includes(w))return;
      const host=publicAppHost(desktop,w);let app=module,gated=false;
      if(['chat','rooms','chess'].includes(id)&&!host.network.disabled){
        const history=await desktopHistoryServices();
        if(!placeholder.isConnected||desktop&&!desktop.windows.includes(w))return;
        gated=true;app=history.wrapApp(module,{mountApp:loader.mountApp,decorate:body=>{if(id==='rooms'&&host.network.routedRooms)body.append(host.network.routedContent(w));},issuer:identityConfig?.identity?.issuer||location.origin,feature:id==='rooms'?'Rooms':id==='chess'?'Chess':'Chat',beforeMount:async({session,signal})=>{
          if(await desktopNetwork.initialize(session,identityConfig,{signal})===false)throw Error('Chat networking is unavailable. Your saved device history was not erased.');
        }});
      }
      instance=loader.mountApp(app,host);const body=instance.element;
      if(!placeholder.isConnected||desktop&&!desktop.windows.includes(w)){instance.dispose('View removed during mount');return;}
      if(!gated&&!host.network.disabled&&id==='rooms'&&host.network.routedRooms)body.append(host.network.routedContent(w));
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
  changed(){document.querySelectorAll('[data-file-list]').forEach(n=>n.reload?.());},
  async connect(emulator,{networkRelay=false}={}){this.emulator=emulator;this.ready=true;
    for(const dir of ['Desktop','Documents','Downloads','Pictures','Projects','Trash'])await this.mkdir('/'+dir);
    await this.write('/Documents/README.txt','Welcome to CodiServer.\n\nFiles and Text Editor share /home/guest with the Linux terminal.\nTry: ls; cat Documents/README.txt; echo hello > notes.txt\n\nUse Files to create folders, import files, edit text, download files, or move items to Trash.\nRefresh Files after changing files in the terminal.\n\nThe terminal runs BusyBox Linux as guest (UID 1000). Use help, ls, cat, cp, mv, mkdir, grep, sed, awk and vi.\nLoopback networking works: ping -c 2 127.0.0.1\n'+(networkRelay?'Guest Internet uses the relay host and its Internet connection, not this computer\'s connection.\nTry: ping -c 2 1.1.1.1\nHTTP example: timeout 15 wget -O /tmp/example.html http://example.com\nThis BusyBox wget does not support -T; use timeout instead.\n':'Guest Internet networking is not configured for this page.\n')+'Websites open in your normal browser tabs.\n\nEverything in this guest session is temporary. Download important files before End session.\n');
    this.changed();
  }
};
function downloadGuestFile(name,bytes){const url=URL.createObjectURL(new Blob([bytes]));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function appInput(label,value=''){const n=make('input');n.value=value;n.setAttribute('aria-label',label);return n;}
function openGuestEditor(desktop,path){return desktop.open('text',Object.freeze({version:1,storage:'guest',path:guestFiles.path(path),owner:''}));}
// Account storage is an explicit second volume. Never replace or automatically
// upload the RAM filesystem when a user signs in or switches accounts.
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
// Session-owned metadata client. Views borrow it; closing a window does not
// erase the account's saved links or disconnect unrelated transport peers.
let accountLinksRecord;
function retireAccountLinks(){const record=accountLinksRecord;accountLinksRecord=null;if(record){clearTimeout(record.refreshTimer);clearTimeout(record.versionTimer);record.task.then(links=>links.close(),()=>{});}}
// Only transient probe failures retry; a definite unsupported result remains
// off for this session. Reuse the version timer/task so checks never overlap.
function probeAccountVersion(record,context,delay=0){
  if(accountLinksRecord!==record||!context.valid()||record.versionTimer||record.versionTask)return;
  if(delay||document.hidden){record.versionTimer=setTimeout(()=>{record.versionTimer=null;probeAccountVersion(record,context);},delay||300000);return;}
  let outcome='retry';
  const task=Promise.resolve().then(()=>context.files.supportsVersion()).then(supported=>{outcome=supported?'supported':'unsupported';}).catch(()=>{}).finally(()=>{
    if(record.versionTask===task)record.versionTask=null;
    if(accountLinksRecord!==record||!context.valid())return;
    if(outcome==='supported')scheduleAccountVersion(record,context);
    else if(outcome==='retry')probeAccountVersion(record,context,300000);
  });
  record.versionTask=task;
}
// Version checks are explicitly advertised by the upgraded gateway. They are
// session-owned, run only for visible pages with discovery active, and never
// overlap. Five minutes bounds idle mobile data and server work per session.
function scheduleAccountVersion(record,context,delay=300000){
  if(accountLinksRecord!==record||!context.valid()||record.versionTimer||record.versionTask)return;
  record.versionTimer=setTimeout(()=>{
    record.versionTimer=null;
    if(accountLinksRecord!==record||!context.valid())return;
    if(document.hidden||desktopNetwork.appContext().accountDiscoveryStatus().status!=='ready'||!desktopNetwork.accountLinksRefreshAllowed(context.session)){scheduleAccountVersion(record,context);return;}
    const task=Promise.resolve().then(async()=>{
      const links=await record.task,changed=await links.checkVersion();
      if(accountLinksRecord!==record||!context.valid())return;
      if(changed||record.versionUncertain){record.versionUncertain=false;refreshExternalAccountLinks(record,context);}
    }).catch(error=>{
      if(accountLinksRecord!==record||!context.valid())return;
      record.versionUncertain=true;desktopNetwork.accountLinksRefreshFailed(context.session,'Could not verify saved accounts; automatic introductions are paused.');
    }).finally(()=>{if(record.versionTask===task)record.versionTask=null;if(accountLinksRecord===record&&context.valid())scheduleAccountVersion(record,context);});
    record.versionTask=task;
  },delay);
}
function refreshExternalAccountLinks(record,context){
  if(accountLinksRecord!==record||!context.valid())return;
  record.changes++;if(desktopNetwork.accountLinksStale(context.session))scheduleAccountLinksRefresh(record,context);
}
function scheduleAccountLinksRefresh(record,context){
  if(accountLinksRecord!==record||!context.valid()||!desktopNetwork.accountLinksRefreshAllowed(context.session)||record.refreshTask||record.refreshTimer)return;
  const delay=Math.max(0,record.nextRefreshAt-performance.now());
  if(delay){record.refreshTimer=setTimeout(()=>{record.refreshTimer=null;scheduleAccountLinksRefresh(record,context);},delay);return;}
  let retry=false,generation=record.changes;
  const task=Promise.resolve().then(async()=>{
    const links=await record.task;await links.waitIdle();if(accountLinksRecord!==record||!context.valid()||!desktopNetwork.accountLinksRefreshAllowed(context.session))return;
    generation=record.changes;record.nextRefreshAt=performance.now()+5000;
    let book;try{book=await links.load();}catch(error){
      if(accountLinksRecord!==record||!context.valid())return;if(generation!==record.changes||/already in progress/.test(error.message)){retry=true;return;}
      if(error?.name==='AccountLinkFloorError')desktopNetwork.accountLinksUnavailable(context.session,error.message);else desktopNetwork.accountLinksRefreshFailed(context.session,error.message);return;
    }
    if(accountLinksRecord!==record||!context.valid())return;if(generation!==record.changes){retry=true;return;}
    desktopNetwork.accountLinksChanged(book,context.session);
  }).catch(error=>{if(accountLinksRecord===record&&context.valid()){if(error?.name==='AccountLinkFloorError')desktopNetwork.accountLinksUnavailable(context.session,error.message);else desktopNetwork.accountLinksRefreshFailed(context.session,error.message);}}).finally(()=>{
    if(record.refreshTask===task)record.refreshTask=null;if(retry&&accountLinksRecord===record&&context.valid())scheduleAccountLinksRefresh(record,context);
  });
  record.refreshTask=task;
}
async function accountLinkContext({signal}={}){
  signal?.throwIfAborted();const context=await serverFileContext();signal?.throwIfAborted();
  if(accountLinksRecord?.session!==context.session){
    retireAccountLinks();
    const record={session:context.session,task:null,refreshTask:null,refreshTimer:null,versionTimer:null,versionTask:null,versionUncertain:false,nextRefreshAt:0,changes:0};accountLinksRecord=record;
    record.task=import('./assets/desktop/account-links.mjs').then(({AccountLinks})=>{
      if(accountLinksRecord!==record||!context.valid())throw Error('Account changed. Reopen saved links.');
      return new AccountLinks({files:context.files,session:context.session,policy:identityConfig.identity,valid:context.valid,onExternal:()=>refreshExternalAccountLinks(record,context)});
    });
    record.task.catch(()=>{if(accountLinksRecord===record){clearTimeout(record.versionTimer);accountLinksRecord=null;}});
    if(identityConfig.gateway?.fileVersionChecks===true&&typeof context.files.supportsVersion==='function'){
      // The managed opt-in is not sufficient: code upgrades/rollback can
      // leave an older worker behind. Ask that exact worker before polling.
      probeAccountVersion(record,context);
    }
  }
  const links=await accountLinksRecord.task;
  const check=()=>{signal?.throwIfAborted();if(!context.valid())throw Error('Account changed. Reopen saved links.');};check();
  const run=async action=>{
    check();let value;
    try{value=await action();}catch(error){if(context.valid()&&error?.name==='AccountLinkFloorError')desktopNetwork.accountLinksUnavailable(context.session,error.message);throw error;}
    // An admitted write may finish after its originating window closes. Apply
    // the committed consent change to the still-current session before the
    // view's abort signal suppresses delivery of its stale result.
    if(context.valid()){
      if(accountLinksRecord?.session===context.session&&accountLinksRecord.refreshTimer){clearTimeout(accountLinksRecord.refreshTimer);accountLinksRecord.refreshTimer=null;}
      desktopNetwork.accountLinksChanged(value,context.session);
    }
    check();return value;
  };
  return Object.freeze({owner:context.owner,load:()=>run(()=>links.load()),remember:(peer,options)=>run(()=>links.remember(peer,options)),remove:(peer,options)=>run(()=>links.remove(peer,options))});
}
function fileVolumeBar(desktop,w){
  const bar=make('div','app-toolbar');bar.setAttribute('aria-label','File storage');
  const volumes=[['guest','Temporary files'],['browser','This browser']];if(serverFilesAvailable())volumes.push(['server','My server files']);
  for(const [storage,label] of volumes){
    const b=textButton(label,()=>{w.storage=storage;desktop.render();});b.setAttribute('aria-pressed',String((w.storage||'guest')===storage));bar.append(b);
  }
  return bar;
}
// One shared on-device store; app views borrow scope-bound clients. Files are
// not uploaded, mounted into Linux or silently moved when identity changes.
let browserFilesModule;
const browserFileStore=()=>browserFilesModule??=(import('./assets/desktop/browser-files.mjs').then(m=>({module:m,store:new m.BrowserFileStore()})).catch(error=>{browserFilesModule=null;throw error;}));
function browserFilesScope(){return JSON.stringify(['codi-browser-files/1',identityConfig?.identity?.issuer||location.origin,signedInSubject()||'anonymous-device']);}
async function browserFileContext({signal}={}){
  const session=currentSession,owner=browserFilesScope(),valid=()=>!signal?.aborted&&currentSession===session&&browserFilesScope()===owner;
  if(!valid())throw Error('Account changed. Reopen browser files.');const {module,store}=await browserFileStore();if(!valid())throw Error('Account changed. Reopen browser files.');
  const context={signal,valid},changed=async work=>{const result=await work;if(valid())browserFilesChanged();return result;};
  return {owner,session,valid,files:Object.freeze({path:module.browserFilePath,name:module.browserFileName,list:path=>store.list(owner,path,context),read:path=>store.read(owner,path,context),write:(path,data,expected=null)=>changed(store.write(owner,path,data,expected,context)),mkdir:path=>changed(store.mkdir(owner,path,context)),remove:(path,expected)=>changed(store.remove(owner,path,expected,context)),persistence:()=>store.persistence(),requestPersistence:()=>store.requestPersistence()})};
}
function browserFilesChanged(){document.querySelectorAll('[data-browser-file-list]').forEach(n=>n.reload?.());}
function openBrowserEditor(desktop,owner,path){if(owner!==browserFilesScope())return;return desktop.open('text',Object.freeze({version:1,storage:'browser',path,owner}));}
function serverFilesChanged(){document.querySelectorAll('[data-server-file-list]').forEach(n=>n.reload?.());}
function openServerEditor(desktop,owner,path){
  if(owner!==signedInSubject())return;
  return desktop.open('text',Object.freeze({version:1,storage:'server',path,owner}));
}
// Refresh lists after shell operations without replacing editor/terminal DOM.
setInterval(()=>guestFiles.changed(),2500);
