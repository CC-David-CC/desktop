'use strict';
window.CODI_PRIVATE_FILES_UI=1;
const reference = window.CODI_REFERENCE;
const $ = (s, root = document) => root.querySelector(s);
const make = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const shipped = {
  panelHeight: reference.panelHeight, iconSize: reference.iconSize, panelFontSize: 13.3333,
  workspaceWidth: reference.workspaceWidth, workspaceCount: reference.workspaceCount,
  menuRowHeight: reference.menuRowHeight, menuFontSize: reference.menuFontSize,
  titleHeight: 44, controlWidth: 44,
  titleFontSize: 14, titleIconSize:24, controlGlyphSize:20,
  workspaceLabels: false, volumeButton: false, panelLabelsBold:false
};
let settings = {...shipped};
// Local browser sessions do not restore or persist identity, key, or sizing state.
let resolution = [innerWidth,innerHeight], hitboxes = false;
const surfaces = new Map();
const models = new Map();
let currentSession = null;
let identityConfig = null;
let identityModule = null;
let identityTimer = null;
let renewingIdentity = false;
let accountTransition = false;
let guestState = 'loading';
let guestMessage = 'Starting the local Linux guest…';
const serialOutput = [];
let serialPending = '';
let serialFrame = 0;
let v86Instance = null;
let guestNetworkAdapter = null;
let desktopLifecycle = null;
let deviceCacheModule = import('./assets/desktop/device-cache.mjs');
deviceCacheModule.then(module=>module.registerDeviceCache()).catch(error=>console.warn('Device app cache unavailable:',error.message));
let feedbackTimer = null;
let onScreenKeyboardEnabled = false;
let voiceControl = null;
const originalInputModes = new WeakMap();
function applyScreenKeyboardPolicy(root=document){
  const fields=[...(root.matches?.('input,textarea,[contenteditable]')?[root]:[]),...root.querySelectorAll('input,textarea,[contenteditable]')];
  for(const field of fields){
    if(field.closest?.('.login-gate'))continue;
    if(field.matches('input')&&!['text','search','url','tel','email','number','password'].includes(field.type))continue;
    if(field.hasAttribute('contenteditable')&&!field.isContentEditable)continue;
    if(!originalInputModes.has(field))originalInputModes.set(field,field.getAttribute('inputmode'));
    const mode=onScreenKeyboardEnabled?originalInputModes.get(field):'none';
    if(mode===null)field.removeAttribute('inputmode');else field.setAttribute('inputmode',mode);
  }
}
function setScreenKeyboardEnabled(enabled){
  onScreenKeyboardEnabled=!!enabled;applyScreenKeyboardPolicy();
  document.documentElement.dataset.keyboardMode=enabled?'typing':'voice';
  if(!enabled&&document.activeElement?.matches('input,textarea,[contenteditable]'))document.activeElement.blur();
  document.dispatchEvent(new Event('codi-keyboard-mode'));
}


function sessionName() { return currentSession?.public.kind==='registered'?currentSession.displayName:'Anon'; }
function refreshDesktopClocks(){
  const now=new Date(),date=now.toLocaleDateString('en-CA'),time=now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  for(const clock of document.querySelectorAll('.panel .clock')){clock.firstChild.nodeValue=date;clock.lastChild.nodeValue=time;}
  for(const line of document.querySelectorAll('.status-popup[data-status-type="clock"] .status-line'))line.textContent=now.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'});
}
let desktopClockTimer;
function scheduleDesktopClock(){clearTimeout(desktopClockTimer);refreshDesktopClocks();desktopClockTimer=setTimeout(scheduleDesktopClock,1000-Date.now()%1000+25);}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleDesktopClock();});
window.addEventListener('focus',scheduleDesktopClock);
scheduleDesktopClock();
const accountAppCatalogs=new Map();
const accountAppTemplates=[
  {slot:'canvas',name:'Blank canvas',icon:'prototype-canvas',heading:'YOUR APP HERE',description:'A blank space for your next idea.'},
  {slot:'notes',name:'My notes',icon:'prototype-notes',heading:'My notes',description:'A simple starting point for a writing app.'},
  {slot:'dashboard',name:'My dashboard',icon:'prototype-dashboard',heading:'My dashboard',description:'A few empty cards, ready for your own tools.'}
];
function signedInSubject(){
  const s=currentSession;
  return s?.public.kind==='registered'&&['official','test-server'].includes(s.trust?.level)&&s.trust.claims?.sub===s.public.sub&&s.trust.claims.exp>Date.now()/1000?s.public.sub:null;
}
function accountApplications(){
  const subject=signedInSubject();if(!subject)return [];
  if(!accountAppCatalogs.has(subject))accountAppCatalogs.set(subject,new Map(accountAppTemplates.map(template=>{
    const id='user-app:'+subject.slice(5)+':'+template.slot;
    return [id,{...template,id,ownerSub:subject,ownerName:currentSession.public.name}];
  })));
  return [...accountAppCatalogs.get(subject).values()];
}
const isAccountApp=app=>typeof app==='string'&&app.startsWith('user-app:');
const accountApp=app=>accountApplications().find(entry=>entry.id===app);
const availableApplication=app=>!isAccountApp(app)||!!accountApp(app);
const accountWindow=w=>(!w.ownerSub||w.ownerSub===signedInSubject())&&(!isAccountApp(w.app)||!!accountApp(w.app));
function feedback(text) {
  clearTimeout(feedbackTimer);const status=$('#feedback');status.textContent=text;
  if(text)feedbackTimer=setTimeout(()=>{status.textContent='';feedbackTimer=null;},4000);
}
function icon(key, direct = false) {
  if(isAccountApp(key))key='prototype-'+key.split(':').at(-1);
  const drawings={
    microphone:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
    keyboard:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M5 9h2m2 0h2m2 0h2m2 0h2M5 12h2m2 0h2m2 0h2m2 0h2M7 15h10"/>',
    browser:'<circle cx="12" cy="12" r="9" fill="#d9edf8"/><path d="M3 12h18M12 3c-5 5-5 13 0 18M12 3c5 5 5 13 0 18"/>',
    'prototype-canvas':'<rect x="3" y="3" width="18" height="18" rx="3" fill="#d5eeec"/><path d="M7 12h10M12 7v10"/>',
    'prototype-notes':'<path fill="#fff0ce" d="M5 2h13l3 4v16H5z"/><path d="M9 7h7M9 11h8M9 15h6M9 19h5"/>',
    'prototype-dashboard':'<rect x="2" y="3" width="20" height="18" rx="2" fill="#e8ddf5"/><path d="M2 8h20M10 8v13M10 14h12"/>',
    'kiri-moto':'<path d="M5 6h14v12H5zM7 3h10M8 18v3m8-3v3"/><path d="M9 11h6M12 8v6"/>',
    'mesh-tool':'<path d="M12 2 21 7v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10"/>',
    'notebook':'<path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5"/>',
    'diagrams-net':'<path d="M3 4h6v5H3zM15 15h6v5h-6zM6 9v4h12v2"/>',
    'replicad':'<path d="M12 2 21 7v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10"/>',
    'excalidraw':'<path d="M4 17 16 5l3 3L7 20H4z"/>',
    'svg-editor':'<path d="M4 4h16v16H4zM7 16l5-9 5 9z"/>',
    'gcode-preview':'<path d="M4 4h16v16H4zM7 15l3-5 3 3 3-6"/>',
    spreadsheet:'<rect x="3" y="3" width="18" height="18" rx="2" fill="#dcf1e5"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    'pdf-viewer':'<path fill="#fce2e2" d="M5 2h10l5 5v15H5z"/><path d="M15 2v6h5M8 12h8M8 16h8M8 20h5"/>',
    'document-editor':'<path fill="#e3f0fc" d="M5 2h10l5 5v15H5z"/><path d="M15 2v6h5M8 11h9M8 15h9M8 19h6"/>',
    'image-editor':'<rect x="3" y="4" width="18" height="16" rx="2" fill="#e3f0fc"/><circle cx="8" cy="9" r="2"/><path d="M5 18l5-5 3 3 2-2 4 4"/>',
    text:'<path fill="#fff" d="M5 2h10l5 5v15H5z"/><path d="M15 2v6h5M8 11h9M8 15h9M8 19h6"/>',
    'falling-blocks':'<rect x="3" y="3" width="8" height="8" rx="1" fill="#69c9d0"/><rect x="12" y="3" width="8" height="8" rx="1" fill="#edc76a"/><rect x="12" y="12" width="8" height="8" rx="1" fill="#a693e8"/>',
    calculator:'<rect x="4" y="2" width="16" height="20" rx="2" fill="#d8dee2"/><path fill="#b8dcdf" d="M7 5h10v5H7z"/><path d="M7 13h2m2 0h2m2 0h2M7 16h2m2 0h2m2 0h2M7 19h2m2 0h2m2 0h2"/>',
    help:'<circle cx="12" cy="12" r="10" fill="#d4e8fb"/><path d="M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4m0 3v1"/>'
  };
  if(drawings[key]){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('icon');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('fill','none');svg.setAttribute('stroke','#45545b');svg.setAttribute('stroke-width','1.5');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.innerHTML=drawings[key];return svg;
  }
  const path = direct ? key : reference.icons[key];
  if (!path) return make('span','icon');
  const img = make('img','icon'); img.src = path; img.alt = ''; img.draggable = false; return img;
}
function button(label, handler, cls = '') {
  const n = make('button', cls); n.type='button'; n.setAttribute('aria-label',label);
  if (handler) n.addEventListener('click',handler); return n;
}
function textButton(label, handler, cls = '') { const n=button(label,handler,cls);n.textContent=label;return n; }
const desktopMenu=[
  {name:'Browser',icon:'browser'},
  {name:'Office',icon:'document-editor',children:[{name:'Text Editor',icon:'text'},{name:'Document Editor',icon:'document-editor'},{name:'Spreadsheet',icon:'spreadsheet'},{name:'Data Explorer (Perspective)',icon:'spreadsheet'},{name:'PDF Viewer',icon:'pdf-viewer'}]},
  {name:'Programming',icon:'notebook',children:[{name:'Python Notebook — Browser',icon:'notebook'},{name:'Python Notebook — Linux (in development)',icon:'notebook',disabled:true}]},
  {name:'Electronics',icon:'help',children:[{name:'Arduino Simulator',icon:'help'},{name:'Pico Simulator',icon:'help'},{name:'Circuit Simulator',icon:'help'},{name:'Electronics Design',icon:'help'},{name:'Digital Logic',icon:'help'}]},
  {name:'Crafts',icon:'image-editor',children:[{name:'Embroidery Studio',icon:'image-editor'},{name:'Stitch Converter',icon:'image-editor'}]},
  {name:'Diagramming',icon:'image-editor',children:[{name:'Image Editor',icon:'image-editor'},{name:'diagrams.net',icon:'diagrams-net'},{name:'Excalidraw',icon:'image-editor'},{name:'SVG-edit',icon:'image-editor'}]},
  {name:'3D Printing',icon:'help',children:[{name:'Kiri:Moto',icon:'kiri-moto'},{name:'Mesh:Tool',icon:'mesh-tool'},{name:'G-code Preview',icon:'gcode-preview'},{name:'Replicad',icon:'replicad'}]},
  {name:'Games',icon:'falling-blocks',children:[{name:'Falling Blocks (preview)',icon:'falling-blocks'}]},
  {name:'Audio Tools',icon:'help',children:[{name:'Audio Editor',icon:'help'}]},
  {name:'System Tools',icon:'help',children:[{name:'Terminal',icon:reference.icons.terminal},{name:'Files',icon:reference.icons.files},{name:'Calculator',icon:'calculator'},{name:'Voice input',icon:'microphone',action:()=>voiceControl?.toggle()},{name:'Keyboard lock',icon:'keyboard',action:()=>{setScreenKeyboardEnabled(!onScreenKeyboardEnabled);feedback(onScreenKeyboardEnabled?'On-screen keyboard enabled':'On-screen keyboard locked');}},{separator:true},{name:'CodeMirror 6',icon:'help',disabled:true},{name:'FFmpeg',icon:'help',disabled:true},{name:'WaveSurfer.js',icon:'help',disabled:true},{name:'Tone.js',icon:'help',disabled:true},{name:'zip.js',icon:'help',disabled:true},{name:'Mermaid.js',icon:'help',disabled:true},{name:'Apache ECharts',icon:'help',disabled:true},{name:'Plotly.js',icon:'help',disabled:true},{name:'pdfme',icon:'help',disabled:true},{name:'MapLibre GL JS',icon:'help',disabled:true},{name:'Transformers.js',icon:'help',disabled:true},{name:'Trystero (WebRTC)',icon:'help',disabled:true},{name:'TanStack Virtual',icon:'help',disabled:true},{name:'ONNX Runtime Web',icon:'help',disabled:true},{name:'WebTorrent',icon:'help',disabled:true},{name:'Yjs',icon:'help',disabled:true}]},
  {separator:true},{name:'Help',icon:'help'},{name:'End session',icon:reference.icons.applications}
];
function initialWindows(){return [];}
const windowRect=w=>({x:w.x,y:w.y,w:w.w,h:w.h});
const compactDesktop=width=>width<=720||(matchMedia('(pointer:coarse)').matches&&width<1024);
class Desktop {
  constructor(parent, config, label, state) {
    this.baseConfig = {...config};this.config={...config}; this.windows = state?.windows || initialWindows(); this.current=state?.current || 0;this.active=state?.active ?? null;
    this.workspacePins=new Map();this.pins=state?.pins ?? ['files','terminal']; this.menuPath=[]; this.menu=state?.menu || null; this.nextId=Math.max(10,...this.windows.map(w=>w.id))+1;
    this.root=make('div','desktop');this.root.dataset.screen=label;
    this.spacer=make('div','screen-spacer');this.spacer.append(this.root);
    this.viewport=make('div','viewport');this.viewport.append(this.spacer);parent.append(this.viewport);
    this.root.addEventListener('click',e=>{if(e.target===this.root){this.closePopups();this.active=null;this.render();}});
    this.root.addEventListener('pointerdown',e=>{if(!e.target.closest('.popup,.popup-backdrop')&&!e.target.closest('.panel'))this.closePopups();});
    this.root.addEventListener('keydown',e=>{if(e.key==='Escape'){this.closePopups();this.render();}});
    this.observer=new ResizeObserver(()=>this.scale());this.observer.observe(this.viewport);
    this.render();
  }
  dispose(){this.observer.disconnect();}
  layoutKey(owner){return JSON.stringify(['codi-window-layout/1',identityConfig?.identity?.issuer||location.origin,owner]);}
  saveLayout(){const owner=signedInSubject();if(!owner||this.layoutOwner!==owner)return;try{const windows=this.windows.filter(w=>accountWindow(w)&&!w.previewBytes&&!isAccountApp(w.app)&&w.launchContext?.storage!=='guest').slice(0,64).map(w=>{const saved=w.documentEditor||w.spreadsheet||w.editor||w.imageEditor||w.excalidraw||w.svgEditor||w.diagramsNet||w.notebook;const path=saved?.version&&typeof saved.path==='string'?saved.path:w.launchContext?.path,rect=w.desktopRect||windowRect(w),restore=w.desktopRect?w.desktopRestore:w.restore;return {id:w.id,app:w.app,title:w.title,workspace:w.workspace,x:rect.x,y:rect.y,w:rect.w,h:rect.h,minimized:!!w.minimized,rolled:!!w.rolled,restore:restore||undefined,tileSide:w.tileSide||undefined,path};});localStorage.setItem(this.layoutKey(owner),JSON.stringify({version:1,current:this.current,active:this.active,windows}));}catch(error){console.warn('Could not save window layout:',error.message);}}
  restoreLayout(){const owner=signedInSubject();if(!owner||this.layoutOwner===owner)return;this.layoutOwner=owner;this.windows=[];this.current=0;this.active=null;try{const raw=localStorage.getItem(this.layoutKey(owner));if(!raw||raw.length>65536)return;const data=JSON.parse(raw),allowed=new Set(['terminal','files','browser','text','document-editor','spreadsheet','data-explorer','pdf-viewer','image-editor','calculator','help','audio-editor','gcode-preview','kiri-moto','mesh-tool','excalidraw','svg-editor','replicad','diagrams-net','notebook','arduino-simulator','pico-simulator','circuitjs','electronics-design','digital-logic','embroidery-studio','stitch-converter','falling-blocks']);if(data?.version!==1||!Array.isArray(data.windows)||data.windows.length>64)return;const seen=new Set();for(const v of data.windows){if(!v||!allowed.has(v.app)||!Number.isSafeInteger(v.id)||v.id<1||seen.has(v.id)||![v.x,v.y,v.w,v.h,v.workspace].every(Number.isFinite))continue;seen.add(v.id);const win={id:v.id,app:v.app,title:typeof v.title==='string'?v.title.slice(0,256):v.app,workspace:Math.max(0,Math.min(2,Math.floor(v.workspace))),x:v.x,y:v.y,w:Math.max(300,Math.min(4000,v.w)),h:Math.max(150,Math.min(4000,v.h)),minimized:!!v.minimized,rolled:!!v.rolled};if(v.tileSide==='left'||v.tileSide==='right')win.tileSide=v.tileSide;if(v.restore&&[v.restore.x,v.restore.y,v.restore.w,v.restore.h].every(Number.isFinite)&&v.restore.w>0&&v.restore.h>0)win.restore={x:v.restore.x,y:v.restore.y,w:Math.min(4000,v.restore.w),h:Math.min(4000,v.restore.h)};if(typeof v.path==='string'&&v.path.startsWith('/')&&v.path.length<=2048){win.launchContext=Object.freeze({version:1,storage:'mirror',path:v.path,owner});win.ownerSub=owner;}this.windows.push(win);}this.current=Math.max(0,Math.min(2,Math.floor(data.current)||0));this.active=seen.has(data.active)?data.active:null;this.nextId=Math.max(10,...seen)+1;}catch(error){console.warn('Could not restore window layout:',error.message);}}
  get pins(){return (this.workspacePins.get(this.current)??['files','terminal']).filter(availableApplication);}
  set pins(value){const other=(this.workspacePins.get(this.current)||[]).filter(app=>!availableApplication(app));this.workspacePins.set(this.current,[...new Set([...other,...value])]);}
  scale() {
    const width=this.viewport.clientWidth,height=this.viewport.clientHeight;
    if(compactDesktop(width)!==this.mobile){this.render();return;}
    resolution=[width,height];this.scaleFactor=1;
    this.root.style.width=width+'px';this.root.style.height=height+'px';this.root.style.transform='none';
    this.spacer.style.width=width+'px';this.spacer.style.height=height+'px';
    for(const w of this.windows){this.fitWindow(w);const el=this.root.querySelector('[data-window="'+w.id+'"]');if(el)Object.assign(el.style,{left:w.x+'px',top:w.y+'px',width:w.w+'px',height:(w.rolled?this.config.titleHeight:w.h)+'px'});}
    this.root.querySelectorAll('.mini-window').forEach(el=>{const w=this.windows.find(w=>w.id===Number(el.dataset.windowId));if(w)Object.assign(el.style,{left:100*w.x/width+'%',top:100*w.y/height+'%',width:100*w.w/width+'%',height:100*w.h/height+'%'});});
    this.root.querySelectorAll('.popup').forEach(p=>this.positionPopup(p,parseFloat(p.style.left)||0,parseFloat(p.style.top)||this.config.panelHeight));
  }
  updateLayout(){
    const mobile=compactDesktop(this.viewport.clientWidth);
    if(mobile!==this.mobile){
      for(const w of this.windows){
        if(mobile){w.desktopRect=windowRect(w);w.desktopRestore=w.restore;delete w.restore;}
        else if(w.desktopRect){Object.assign(w,w.desktopRect);delete w.desktopRect;delete w.mobileRect;delete w.restore;if(w.desktopRestore)w.restore=w.desktopRestore;delete w.desktopRestore;}
      }
      this.mobile=mobile;
    }
    this.config={...this.baseConfig,...(mobile?{panelHeight:48,iconSize:24,panelFontSize:16,menuRowHeight:44,menuFontSize:16,titleHeight:48,controlWidth:44,titleFontSize:14,titleIconSize:24,controlGlyphSize:20}:{})};
    this.root.classList.toggle('compact-desktop',mobile);
  }
  fitWindow(w){
    const width=this.viewport.clientWidth,height=this.viewport.clientHeight,top=this.config.panelHeight;
    if(this.mobile){
      if(!w.mobileRect){if(!w.desktopRect){w.desktopRect=windowRect(w);w.desktopRestore=w.restore;}const stagger=(this.windows.filter(n=>n.workspace===w.workspace).indexOf(w)%4)*24;w.mobileRect={x:8,y:top+8+stagger,w:Math.max(1,width-16),h:Math.min(w.h,Math.max(150,height-top-24-stagger))};if(!w.restore)w.restore={...w.mobileRect};}
      const rect=w.restore?{x:0,y:top,w:width,h:height-top}:w.mobileRect;
      Object.assign(w,rect);w.w=Math.min(w.w,width);w.h=Math.min(w.h,Math.max(this.config.titleHeight,height-top));
    }
    else if(w.restore){Object.assign(w,{x:0,y:top,w:width,h:Math.max(1,height-top)});}
    else if(w.tileSide){const split=Math.floor(width/2);Object.assign(w,{x:w.tileSide==='left'?0:split,y:top,w:w.tileSide==='left'?split:width-split,h:Math.max(1,height-top)});}
    w.w=Math.min(w.w,Math.max(1,width));w.h=Math.min(w.h,Math.max(this.config.titleHeight,height-top));
    w.x=Math.max(0,Math.min(w.x,width-w.w));w.y=Math.max(top,Math.min(w.y,height-w.h));
  }
  closePopups(){this.menu=null;this.menuPath=[];this.root.querySelectorAll('.popup,.popup-backdrop').forEach(n=>n.remove());}
  popupBackdrop(){if(this.mobile&&!this.root.querySelector('.popup-backdrop'))this.root.append(button('Close menu',()=>this.closePopups(),'popup-backdrop'));}
  render() {
    const wasMobile=this.mobile;this.updateLayout();const c=this.config;
    const keepMenu=!!this.menu&&wasMobile===this.mobile&&!!this.root.querySelector('.menu-pane');
    const fileGateway=typeof serverFilesAvailable==='function'&&serverFilesAvailable();
    // Keep app DOM, drafts and cursor positions while rebuilding desktop chrome.
    for(const child of [...this.root.children])if(!child.matches('.window')&&!(keepMenu&&child.matches('.menu-pane,.popup-backdrop')))child.remove();
    for(const win of this.root.querySelectorAll('.window'))if(!this.windows.some(w=>w.id===Number(win.dataset.window)&&accountWindow(w))){disposePublicAppView(win);win.remove();}
    this.root.classList.toggle('hitboxes',hitboxes);
    this.root.classList.toggle('panel-labels-bold',c.panelLabelsBold);
    const vars={'panel-height':c.panelHeight,'icon-size':c.iconSize,'panel-font':c.panelFontSize,
      'workspace-width':c.workspaceWidth,'menu-row':c.menuRowHeight,'menu-font':c.menuFontSize,
      'title-height':c.titleHeight,'control-width':c.controlWidth,'title-font':c.titleFontSize,
      'title-icon-size':c.titleIconSize,'control-glyph-size':c.controlGlyphSize};
    for(const [key,value] of Object.entries(vars))this.root.style.setProperty('--'+key,value+'px');
    this.current=Math.min(this.current,c.workspaceCount-1);
    this.windows.forEach(w=>{w.workspace=Math.min(w.workspace,c.workspaceCount-1);});
    this.appIdentity=signedInSubject();
    const visible=this.windows.filter(w=>w.workspace===this.current&&!w.minimized&&accountWindow(w));
    if(this.windows.some(w=>w.id===this.active&&!accountWindow(w)))this.active=visible.at(-1)?.id??null;
    if(this.mobile&&!visible.some(w=>w.id===this.active))this.active=visible.at(-1)?.id??null;
    this.renderPanel();
    for(const w of this.windows){
      if(!accountWindow(w))continue;
      let win=this.root.querySelector('[data-window="'+w.id+'"]');
      const changed=win&&(win.editorState!==w.editor||(w.app==='files'&&(win.fileGateway!==fileGateway||win.fileOwner!==signedInSubject())));
      if(changed){disposePublicAppView(win,'View replaced');win.remove();win=null;}
      if(!win){this.renderWindow(w);win=this.root.querySelector('[data-window="'+w.id+'"]');win.editorState=w.editor;win.fileGateway=fileGateway;win.fileStorage=w.storage||'guest';win.fileOwner=signedInSubject();}
      win.hidden=w.workspace!==this.current||!!w.minimized;
      win.classList.toggle('focused',this.active===w.id);win.classList.toggle('rolled',!!w.rolled);
      win.querySelector('.caption-text').textContent=w.title;
      const roll=win.querySelector('.window-controls button');roll.setAttribute('aria-label',w.rolled?'Unroll':'Roll up');roll.title=w.rolled?'Unroll':'Roll up';
      roll.querySelector('path').setAttribute('d',w.rolled?'M5 9 L12 16 L19 9':'M5 16 L12 9 L19 16');
    }
    this.scale();
    if(this.menu&&!keepMenu)this.showMenu(this.applicationItems(),0,0,c.panelHeight);
    this.saveLayout();
  }
  applicationItems(){
    const apps=accountApplications();
    return apps.length?[{name:'YOUR APP HERE',icon:'prototype-canvas',children:apps.map(entry=>({name:entry.name,icon:entry.icon,action:()=>this.launch(entry.id)}))},...desktopMenu]:desktopMenu;
  }
  switchWorkspace(index){
    this.closePopups();this.workspaceFocus??=new Map();
    if(this.active!==null)this.workspaceFocus.set(this.current,this.active);
    this.current=index;
    const windows=this.windows.filter(w=>w.workspace===index&&!w.minimized&&accountWindow(w));
    this.active=windows.find(w=>w.id===this.workspaceFocus.get(index))?.id??windows[0]?.id??null;
    this.render();
  }
  renderPanel() {
    const c=this.config,p=make('div','panel');
    const apps=button('Applications',()=>{const open=this.menu;this.closePopups();if(!open){this.menu=true;this.showMenu(this.applicationItems(),0,0,c.panelHeight);} },'app-menu-button');
    apps.append(icon('applications'),make('span','applications-label','Applications'));p.append(apps);
    const tasks=make('div','tasks');
    const appIds=[...new Set([...this.pins,...this.windows.filter(w=>w.workspace===this.current&&accountWindow(w)).map(w=>w.app)])];
    for(const app of appIds) {
      const windows=this.windows.filter(w=>w.app===app&&w.workspace===this.current&&accountWindow(w));
      const active=windows.some(w=>w.id===this.active&&w.workspace===this.current&&!w.minimized);
      const label=accountApp(app)?.name||app;
      const b=button(label+' windows',e=> {
        this.closePopups();
        if(e.shiftKey||e.ctrlKey||e.metaKey||!windows.length){this.launch(app);return;}
        this.showTasks(app,windows,b);
      },'task'+(windows.length?' running':'')+(active?' active':''));
      b.dataset.app=app;b.append(icon(app));
      b.setAttribute('aria-pressed',String(active));b.title=label+': '+windows.length+' open'+(windows.some(w=>w.minimized)?' (including minimized)':'');
      if(windows.length)b.append(make('span','count',windows.length));
      b.addEventListener('contextmenu',e=>{e.preventDefault();this.closePopups();this.showTasks(app,windows,b);});
      tasks.append(b);
    }
    p.append(tasks,make('div','expand'));
    const tray=(key,label,type)=>{const b=button(label,()=>{this.closePopups();this.showStatus(type,b);},'tray-button');b.append(icon(key));p.append(b);};
    const workspaces=button('Workspaces',()=>{const open=this.root.querySelector('.status-popup[data-status-type="workspaces"]');this.closePopups();if(!open)this.showStatus('workspaces',workspaces);},'tray-button workspace-toggle');
    workspaces.title='Workspaces';workspaces.append(icon('network'),make('span','workspace-current',String(this.current+1)));p.append(workspaces);
    if(c.volumeButton)tray('volume','Volume','volume');
    const clock=button('Date and time',()=>{this.closePopups();this.showStatus('clock',clock);},'clock');
    const now=new Date();clock.append(document.createTextNode(now.toLocaleDateString('en-CA')),make('br'),document.createTextNode(now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'})));p.append(clock);
    const account=button('Session: '+sessionName(),()=>{this.closePopups();this.showStatus('account',account);},'account');
    const symbol=make('span','account-symbol','●');symbol.setAttribute('aria-hidden','true');account.append(symbol,make('span','account-label',sessionName()));p.append(account);this.root.append(p);
  }
  showMenu(items,depth,x,y) {
    this.menuLevels??=[];this.menuLevels[depth]=items;this.menuLevels.length=depth+1;
    this.root.querySelectorAll('.menu-pane').forEach(p=>{if(this.mobile||Number(p.dataset.depth)>=depth)p.remove();});
    const pane=make('div','menu-pane popup');pane.dataset.depth=depth;pane.setAttribute('role','menu');
    pane.style.left=x+'px';pane.style.top=y+'px';pane.style.maxHeight=(resolution[1]-y-10)+'px';
    if(this.mobile&&depth>0){const back=textButton('‹ Back',()=>this.showMenu(this.menuLevels[depth-1],depth-1,8,this.config.panelHeight),'menu-row');pane.append(back);}
    for(const entry of items) {
      if(entry.separator){pane.append(make('div','menu-separator'));continue;}
      const row=button(entry.name,null,'menu-row');row.setAttribute('role','menuitem');if(entry.disabled){row.disabled=true;row.title='Background tool available to applications';}
      row.append(icon(entry.icon,!!reference.icons[entry.icon]||String(entry.icon||'').includes('/')),make('span','row-text',entry.name));
      const open=()=>{
        pane.querySelectorAll('.selected').forEach(n=>n.classList.remove('selected'));row.classList.add('selected');
        if(entry.children){
          const r=row.getBoundingClientRect(),base=this.root.getBoundingClientRect();
          let nx=(r.right-base.left)/this.scaleFactor,ny=(r.top-base.top)/this.scaleFactor;
          if(nx+280>resolution[0])nx=Math.max(0,x-280);
          ny=Math.min(ny,Math.max(this.config.panelHeight,resolution[1]-Math.min(entry.children.length*this.config.menuRowHeight+8,resolution[1]-this.config.panelHeight-10)-10));
          this.showMenu(entry.children,depth+1,nx,ny);
        } else this.root.querySelectorAll('.menu-pane').forEach(n=>{if(Number(n.dataset.depth)>depth)n.remove();});
      };
      if(entry.children){row.append(make('span','arrow','›'));row.setAttribute('aria-haspopup','menu');row.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch')open();});}
      row.addEventListener('click',()=>{if(entry.children){open();return;}this.closePopups();this.launchEntry(entry);});
      row.addEventListener('keydown',e=>{if(e.key==='ArrowRight'&&entry.children){open();$('.menu-pane[data-depth="'+(depth+1)+'"] button',this.root)?.focus();}});
      pane.append(row);
    }
    pane.addEventListener('keydown',e=>{
      const rows=[...pane.querySelectorAll('button')],index=rows.indexOf(document.activeElement);
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();rows[(index+(e.key==='ArrowDown'?1:-1)+rows.length)%rows.length]?.focus();}
    });
    this.root.append(pane);this.popupBackdrop();this.positionPopup(pane,x,y);
  }
  launchEntry(entry) {
    if(typeof entry.action==='function'){entry.action();return;}
    const name=entry.name;
    if(name==='End session'){endSession();return;}
    const app={'Falling Blocks (preview)':'falling-blocks','Browser':'browser','Terminal':'terminal','Files':'files','Text Editor':'text','Document Editor':'document-editor','Spreadsheet':'spreadsheet','Data Explorer (Perspective)':'data-explorer','Audio Editor':'audio-editor','G-code Preview':'gcode-preview','Excalidraw':'excalidraw','SVG-edit':'svg-editor','diagrams.net':'diagrams-net','Python Notebook — Browser':'notebook','Arduino Simulator':'arduino-simulator','Pico Simulator':'pico-simulator','Circuit Simulator':'circuitjs','Electronics Design':'electronics-design','Digital Logic':'digital-logic','Embroidery Studio':'embroidery-studio','Stitch Converter':'stitch-converter','Replicad':'replicad','Kiri:Moto':'kiri-moto','Mesh:Tool':'mesh-tool','PDF Viewer':'pdf-viewer','Image Editor':'image-editor','Calculator':'calculator','Help':'help'}[name];
    if(!app)return;
    this.launch(app);
  }
  activateWindow(w){
    if(!accountWindow(w)){feedback('Sign in to the app owner’s account.');return;}
    this.workspaceFocus??=new Map();if(this.active!==null)this.workspaceFocus.set(this.current,this.active);
    w.minimized=false;this.current=w.workspace;this.active=w.id;this.workspaceFocus.set(w.workspace,w.id);this.closePopups();this.render();
  }
  open(app,context){
    if(!['text','image-editor','document-editor','pdf-viewer','spreadsheet','data-explorer','audio-editor','gcode-preview','mesh-tool','excalidraw','svg-editor','replicad','diagrams-net','notebook'].includes(app)||!context||Object.keys(context).sort().join(',')!=='owner,path,storage,version'||context.version!==1||(context.storage!=='mirror'&&!(context.storage==='guest'&&app==='text'))||typeof context.path!=='string'||context.path.length>2048||typeof context.owner!=='string')throw Error('Unsupported document launch context');
    if(!signedInSubject()||context.owner!==signedInSubject())throw Error('Sign in to open this private document');
    const launchContext=Object.freeze({version:1,storage:context.storage,path:context.path,owner:context.owner});
    const found=this.windows.find(w=>w.app===app&&w.ownerSub===context.owner&&(w.spreadsheet?.path||w.documentEditor?.path||w.editor?.path||w.launchContext?.path)===context.path);
    if(found){this.activateWindow(found);return found;}
    const title=app==='text'?'Text Editor':app==='document-editor'?'Document Editor':app==='pdf-viewer'?'PDF Viewer':app==='spreadsheet'?'Spreadsheet':app==='data-explorer'?'Data Explorer':app==='audio-editor'?'Audio Editor':app==='gcode-preview'?'G-code Preview':app==='mesh-tool'?'Mesh:Tool':app==='excalidraw'?'Excalidraw':app==='svg-editor'?'SVG-edit':app==='diagrams-net'?'diagrams.net':app==='notebook'?'Python Notebook':'Image Editor';
    const w=this.launch(app,context.path.split('/').pop()+' — '+title);
    w.launchContext=launchContext;w.ownerSub=context.owner;this.render();return w;
  }
  openPdfPreview(owner,bytes,name){
    if(!signedInSubject()||owner!==signedInSubject()||!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>128*1024*1024)throw Error('Cannot open this PDF preview.');
    const w=this.launch('pdf-viewer',(name.split('/').pop()||'Document')+' — Print preview');
    w.ownerSub=owner;w.previewBytes=Uint8Array.from(bytes);this.render();return w;
  }
  launch(app,title) {
    const personal=accountApp(app);
    if(isAccountApp(app)&&!personal){feedback('Sign in to open your apps.');return null;}
    const names={'falling-blocks':'Falling Blocks (preview)',browser:'Browser',terminal:'Terminal — guest',files:'Home — Files',text:'Untitled — Text Editor','document-editor':'Untitled — Document Editor','pdf-viewer':'PDF Viewer',spreadsheet:'Untitled — Spreadsheet','data-explorer':'Data Explorer','audio-editor':'Audio Editor','gcode-preview':'G-code Preview','excalidraw':'Excalidraw','svg-editor':'SVG-edit','diagrams-net':'diagrams.net',notebook:'Python Notebook','arduino-simulator':'Arduino Simulator','pico-simulator':'Pico Simulator','circuitjs':'Circuit Simulator','electronics-design':'Electronics Design','digital-logic':'Digital Logic','embroidery-studio':'Embroidery Studio','stitch-converter':'Stitch Converter',replicad:'Replicad','kiri-moto':'Kiri:Moto','mesh-tool':'Mesh:Tool','image-editor':'Image Editor',calculator:'Calculator',help:'Desktop help'};
    const offset=(this.nextId%5)*35;
    const side=this.windows.filter(n=>n.workspace===this.current&&!n.minimized&&n.tileSide).length%2?'right':'left';
    const w={id:this.nextId++,app,title:title||personal?.name||names[app]||app,workspace:this.current,x:170+offset,y:this.config.panelHeight+80+offset,w:820,h:540,tileSide:side};
    if(personal)w.ownerSub=personal.ownerSub;
    this.windows.push(w);this.active=w.id;this.closePopups();this.render();feedback('Opened '+w.title+'.');return w;
  }
  showTasks(app,windows,anchor) {
    const popup=make('div','task-popup popup');
    popup.style.top=this.config.panelHeight+'px';popup.style.left=this.localLeft(anchor)+'px';
    const name=accountApp(app)?.name||desktopMenu.find(entry=>({'Falling Blocks (preview)':'falling-blocks','Browser':'browser','Terminal':'terminal','Files':'files','Text Editor':'text','Document Editor':'document-editor','Spreadsheet':'spreadsheet','Data Explorer (Perspective)':'data-explorer','Audio Editor':'audio-editor','G-code Preview':'gcode-preview','Excalidraw':'excalidraw','SVG-edit':'svg-editor','diagrams.net':'diagrams-net','Python Notebook — Browser':'notebook','Arduino Simulator':'arduino-simulator','Pico Simulator':'pico-simulator','Circuit Simulator':'circuitjs','Electronics Design':'electronics-design','Digital Logic':'digital-logic','Embroidery Studio':'embroidery-studio','Stitch Converter':'stitch-converter','Replicad':'replicad','Kiri:Moto':'kiri-moto','Mesh:Tool':'mesh-tool','PDF Viewer':'pdf-viewer','Image Editor':'image-editor','Calculator':'calculator','Help':'help'}[entry.name])===app)?.name||app;
    popup.append(textButton('New '+name+' window',()=>this.launch(app),'new-window'));
    for(const [index,w] of windows.entries()) {
      const label=w.title+' · '+(index+1)+' · Workspace '+(w.workspace+1)+(w.minimized?' · minimized':w.id===this.active?' · active':'');
      const b=button('Switch to '+label,()=>this.activateWindow(w));b.dataset.windowId=String(w.id);
      const preview=make('div','task-preview');preview.append(make('div'),document.createTextNode(label));b.append(preview,document.createTextNode(label));popup.append(b);
    }
    popup.append(textButton(this.pins.includes(app)?'Unpin from panel':'Pin to panel',()=>{
      this.pins=this.pins.includes(app)?this.pins.filter(x=>x!==app):[...this.pins,app];this.closePopups();this.render();
    },'pin'));this.root.append(popup);this.popupBackdrop();this.positionPopup(popup,this.localLeft(anchor),this.config.panelHeight);
  }
  positionPopup(popup,x,y){
    const width=this.viewport.clientWidth,height=this.viewport.clientHeight,gap=this.mobile?8:0;
    popup.style.maxWidth=Math.max(1,width-gap*2)+'px';
    if(this.mobile)popup.style.width=Math.max(1,width-gap*2)+'px';
    const left=Math.max(gap,Math.min(x,width-popup.offsetWidth-gap));
    const top=Math.min(Math.max(this.config.panelHeight+gap,y),Math.max(this.config.panelHeight,height-44));
    popup.style.left=left+'px';popup.style.top=top+'px';popup.style.maxHeight=Math.max(1,height-top-8)+'px';
  }
  localLeft(anchor) { if(!anchor)return 20;return Math.max(0,Math.min(resolution[0]-305,(anchor.getBoundingClientRect().left-this.root.getBoundingClientRect().left)/this.scaleFactor)); }
  appendNetworkInfo(popup){
    popup.append(make('h4','','Network'),make('div','status-line','Browser: '+(navigator.onLine?'online':'offline')),make('p','',identityConfig?.guestNetwork?'Guest Internet is configured through box-webhost’s connection. Try ping -c 2 1.1.1.1.':'Guest networking: loopback only. Try ping -c 2 127.0.0.1. External websites open in normal browser tabs.'));
    if(guestNetworkAdapter?.controlled!==false&&identityConfig?.guestNetwork?.durableAccountLimits)popup.append(make('p','','Preview network: public ping, DNS, and web connections on ports 80/443. Private networks are blocked. Access to the host’s public address requires sign-in. Account and shared traffic limits persist across reconnects and service restarts.'));
    else if(identityConfig?.guestNetwork?.previewPolicy)popup.append(make('p','','Preview network: public ping, DNS, and web connections on ports 80/443. Each connection lasts up to 30 minutes or 64 MiB. The preview shares a 256 MiB allowance until the operator restarts it.'));
  }
  showStatus(type,anchor) {
    const popup=make('div','status-popup popup');popup.dataset.statusType=type;popup.style.top=this.config.panelHeight+'px';
    popup.style.left=this.localLeft(anchor)+'px';
    const title={workspaces:'Workspaces',volume:'Volume',clock:'Date & time',account:sessionName()};
    popup.append(make('h3','',title[type]));
    if(type==='workspaces') {
      const grid=make('div','workspace-switcher');grid.setAttribute('aria-label','Choose workspace');
      for(let i=0;i<this.config.workspaceCount;i++){
        const b=button('Workspace '+(i+1),()=>this.switchWorkspace(i),'workspace-choice'+(this.current===i?' selected':''));b.setAttribute('aria-pressed',String(this.current===i));
        this.windows.filter(w=>w.workspace===i&&!w.minimized&&accountWindow(w)).forEach(w=>{const m=make('span','mini-window');m.dataset.windowId=w.id;m.style.cssText='left:'+100*w.x/resolution[0]+'%;top:'+100*w.y/resolution[1]+'%;width:'+100*w.w/resolution[0]+'%;height:'+100*w.h/resolution[1]+'%;';b.append(m);});
        b.append(make('span','workspace-number',String(i+1)));grid.append(b);
      }
      popup.append(grid);
    }
    else if(type==='volume'){popup.append(make('p','','No desktop audio apps are running. Browser audio is managed by your device.'));}
    else if(type==='clock'){popup.append(make('div','status-line',new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'})));}
    else {
      popup.append(make('div','status-line',currentSession?`${currentSession.trust.label} · ${currentSession.id}`:'Starting anonymous session…'));
      if(currentSession?.public.kind==='registered')popup.append(textButton('Sign out',async()=>{if(accountTransition)return;try{await endSession();}catch(error){feedback(error.message);}}));
      else if(identityConfig?.identity.mode==='server'&&identityConfig.accounts?.actions?.includes('signin')){
        const actions=make('div','account-actions');
        for(const [mode,label] of [['register','Register'],['signin','Sign in']]){const b=textButton(label,()=>this.showAccountForm(mode,anchor));b.dataset.accountAction=mode;b.disabled=accountTransition;actions.append(b);}popup.append(actions);
      }else popup.append(make('p','','Accounts are unavailable in this preview.'));
      if(currentSession)popup.append(make('div','status-line','Key: '+(currentSession.localKeyFingerprint?.slice(0,24)||'creating…')));
      this.appendNetworkInfo(popup);popup.append(textButton('Device storage',()=>this.showDeviceStorage(anchor)));if(currentSession)popup.append(textButton('End session',()=>endSession()));
    }
    if(type!=='workspaces')popup.append(textButton('Close',()=>this.closePopups()));this.root.append(popup);this.popupBackdrop();this.positionPopup(popup,this.localLeft(anchor),this.config.panelHeight);
  }
  showAccountForm(mode,anchor){
    this.closePopups();
    const popup=make('div','status-popup account-popup popup'),form=make('form','account-form');
    popup.dataset.statusType='account';popup.setAttribute('aria-label',mode==='register'?'Register account':'Sign in');
    popup.append(make('h3','',mode==='register'?'Register':'Sign in'),make('p','','Linux and your open files stay open when you switch identity.'));
    const field=(name,label,type,autocomplete)=>{const wrapper=make('label','',label),input=make('input');input.name=name;input.type=type;input.required=true;input.autocomplete=autocomplete;input.setAttribute('aria-label',label);input.maxLength=type==='password'?(mode==='register'?64:256):28;input.minLength=type==='password'?1:3;if(type!=='password'){input.pattern='[a-zA-Z][a-zA-Z0-9]{2,27}';input.autocapitalize='none';input.spellcheck=false;}wrapper.append(input);form.append(wrapper);return input;};
    const username=field('username','Username','text','username'),password=field('password','Password','password',mode==='register'?'new-password':'current-password');
    const confirmation=mode==='register'?field('confirmation','Confirm password','password','new-password'):null;
    form.append(make('p','account-hint',mode==='register'?'Username: 3–28 letters or numbers, starting with a letter. Password: 4–32 characters.':'Enter your username and password.'));
    const error=make('p','account-error');error.setAttribute('role','alert');form.append(error);
    const actions=make('div','account-actions'),submit=make('button','',mode==='register'?'Register':'Sign in');submit.type='submit';
    const keyboard=textButton('Keyboard',()=>{setScreenKeyboardEnabled(true);username.focus({preventScroll:true});});keyboard.type='button';
    const cancel=textButton('Cancel',()=>this.closePopups());cancel.type='button';actions.append(submit,keyboard,cancel);form.append(actions);
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(accountTransition)return;error.textContent='';
      const length=Array.from(password.value).length,maximum=mode==='register'?32:128;if(length<4||length>maximum||/[\u0000-\u001f\u007f-\u009f\p{Cs}]/u.test(password.value)){error.textContent='Password must be 4–'+maximum+' characters without control characters.';return;}
      if(confirmation&&password.value!==confirmation.value){error.textContent='Passwords do not match.';return;}
      const name=username.value,secret=password.value;password.value='';if(confirmation)confirmation.value='';
      submit.disabled=true;cancel.disabled=true;submit.textContent=mode==='register'?'Registering…':'Signing in…';
      try{await changeAccount(mode,name,secret,()=>form.isConnected);}
      catch(failure){if(form.isConnected)error.textContent=failure.message;}
      finally{submit.disabled=false;cancel.disabled=false;submit.textContent=mode==='register'?'Register':'Sign in';}
    });
    popup.append(form);this.root.append(popup);applyScreenKeyboardPolicy(form);this.popupBackdrop();this.positionPopup(popup,this.localLeft(anchor),this.config.panelHeight);
  }
  async showDeviceStorage(anchor){
    this.closePopups();const popup=make('div','status-popup popup'),status=make('p','','Checking browser storage…');popup.setAttribute('aria-label','Device storage');
    popup.append(make('h3','','Device storage'),make('p','','Keep downloaded app code, Linux boot files and voice models on this device. This does not save your running Linux session, unsaved documents, passwords or private server files.'),status);
    const keep=textButton('Keep loaded app files on this device',async()=>{
      keep.disabled=true;status.textContent='Requesting storage and caching files already loaded by this tab…';
      try{const module=await deviceCacheModule,result=await module.keepLoadedAppFiles();if(popup.isConnected)status.textContent=result.items+' app files cached ('+Math.round(result.bytes/1048576)+' MiB). '+(result.persistent?'The browser granted persistent storage.':'The browser did not grant persistent storage; cached files may be evicted.')+' Clearing site data removes them. Server files are unaffected.';}
      catch(error){if(popup.isConnected)status.textContent='Could not finish caching: '+error.message+'. The server remains available as the normal source.';}finally{keep.disabled=false;}
    });popup.append(keep,textButton('Close',()=>this.closePopups()));this.root.append(popup);this.popupBackdrop();this.positionPopup(popup,this.localLeft(anchor),this.config.panelHeight);
    try{const info=await (await deviceCacheModule).deviceStorageInfo();if(popup.isConnected)status.textContent='This domain uses approximately '+Math.round((info.usage||0)/1048576)+' MiB of the browser’s estimated '+Math.round((info.quota||0)/1048576)+' MiB allowance. '+(info.persistent?'Storage is persistent.':'Storage is currently best effort.')+(info.updateWaiting?' An app update will activate after existing tabs close.':'');}catch(error){if(popup.isConnected)status.textContent=error.message;}
  }
  renderWindow(w) {
    this.fitWindow(w);
    const win=make('section','window'+(this.active===w.id?' focused':'')+(w.rolled?' rolled':''));
    win.dataset.window=w.id;win.setAttribute('aria-label',w.title);win.style.left=w.x+'px';win.style.top=w.y+'px';
    win.style.width=w.w+'px';win.style.height=(w.rolled?this.config.titleHeight+reference.frameBorderBottom:w.h)+'px';
    win.addEventListener('pointerdown',()=>{if(this.active!==w.id){this.active=w.id;this.root.querySelectorAll('.window.focused').forEach(n=>n.classList.remove('focused'));win.classList.add('focused');this.root.querySelectorAll('.task').forEach(n=>{const active=n.dataset.app===w.app;n.classList.toggle('active',active);n.setAttribute('aria-pressed',String(active));});}});
    const caption=make('div','window-caption');caption.append(icon(w.app),make('span','caption-text',w.title));
    const controls=make('div','window-controls');
    const actions=[
      [w.rolled?'Unroll':'Roll up',w.rolled?'M5 9 L12 16 L19 9':'M5 16 L12 9 L19 16',()=>{w.rolled=!w.rolled;}],
      ['Minimize','M4 19 H20',()=>{w.minimized=true;this.active=null;}],
      ['Maximize','M5 5 H19 V19 H5 Z',()=>{if(w.restore){Object.assign(w,w.restore);delete w.restore;}else{w.restore={x:w.x,y:w.y,w:w.w,h:w.h};Object.assign(w,{x:0,y:this.config.panelHeight,w:resolution[0],h:resolution[1]-this.config.panelHeight});}}],
      ['Close','M5 5 L19 19 M19 5 L5 19',()=>{if((w.editor?.dirty||w.imageEditor?.dirty||w.documentEditor?.dirty||w.spreadsheet?.dirty||w.audioEditor?.dirty||w.fallingBlocks?.dirty||w.excalidraw?.dirty||w.svgEditor?.dirty||w.diagramsNet?.dirty||w.notebook?.dirty||w.browserDownloadState?.dirty)&&!confirm('Discard unsaved changes to '+w.title+'?'))return;if(w.app==='terminal')closeTerminal(w.id);if(w.previewBytes)w.previewBytes.fill(0);this.windows=this.windows.filter(n=>n.id!==w.id);this.active=null;}]
    ];
    actions.forEach(([name,path,action])=>{
      const b=button(name,()=>{action();if(this.mobile)w.mobileRect=windowRect(w);this.closePopups();this.render();});b.title=name;
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');
      const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',path);svg.append(p);b.append(svg);controls.append(b);
    });
    caption.append(controls);caption.addEventListener('dblclick',e=>{if(!e.target.closest('button')){actions[2][2]();this.render();}});
    this.drag(caption,w,win,false);win.append(caption,this.windowContent(w));applyScreenKeyboardPolicy(win);
    const resize=make('div','resize-handle');resize.setAttribute('aria-label','Resize window');this.drag(resize,w,win,true);win.append(resize);this.root.append(win);
  }
  drag(handle,w,win,resize) {
    handle.addEventListener('pointerdown',e=>{
      if(e.target.closest('button')||e.button!==0)return;if(e.pointerType==='mouse')e.preventDefault();this.closePopups();
      const start={x:e.clientX,y:e.clientY,wx:w.x,wy:w.y,ww:w.w,wh:w.h};handle.setPointerCapture(e.pointerId);
      const move=event=>{
        const dx=(event.clientX-start.x)/this.scaleFactor,dy=(event.clientY-start.y)/this.scaleFactor;
        if(!this.mobile&&(Math.abs(dx)>1||Math.abs(dy)>1))delete w.tileSide;
        if(resize){w.w=Math.min(resolution[0]-w.x,Math.max(340,start.ww+dx));w.h=Math.min(resolution[1]-w.y,Math.max(this.config.titleHeight+90,start.wh+dy));win.style.width=w.w+'px';win.style.height=w.h+'px';}
        else{w.x=Math.max(0,Math.min(resolution[0]-100,start.wx+dx));w.y=Math.max(this.config.panelHeight,Math.min(resolution[1]-this.config.titleHeight,start.wy+dy));win.style.left=w.x+'px';win.style.top=w.y+'px';}
      };
      const up=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',up);handle.removeEventListener('lostpointercapture',up);if(this.mobile)w.mobileRect=windowRect(w);this.scale();this.saveLayout();};
      handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',up);handle.addEventListener('lostpointercapture',up);
    });
  }
  windowContent(w) {
    const body=make('div','window-content');
    if(isAccountApp(w.app))return publicAppContent('personal-template',this,w);
    return publicAppContent(['kiri-moto','mesh-tool'].includes(w.app)?'grid-tools':w.app,this,w);
  }
}
function updateScaleNote() {}
function renderPreviews(){
  if(surfaces.size)return;
  const desktop=new Desktop(document.querySelector('#previews'),settings,'Desktop');
  surfaces.set('Desktop',desktop);
}
renderPreviews();
initializeVoiceControl();
window.addEventListener('pagehide',()=>{for(const surface of surfaces.values())surface.saveLayout();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)for(const surface of surfaces.values())surface.saveLayout();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')for(const desktop of surfaces.values())desktop.closePopups();});
function initializeVoiceControl(){
  const dock=make('div','voice-control');dock.id='voice-control';
  const note=make('span','voice-note','Loading voice…');note.setAttribute('role','status');note.setAttribute('aria-live','polite');
  const microphone='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>';
  const stopIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor"/></svg>';
  const mic=button('Start voice input',null,'voice-button');mic.title='Tap to start voice input';mic.innerHTML=microphone;
  dock.hidden=!compactDesktop(innerWidth);
  dock.append(note,mic);document.body.append(dock);
  let lastInput=null,activeJob=null,phase='',speech,busy=false,noticeTimer;
  const editable=el=>el instanceof HTMLElement&&!el.disabled&&!el.readOnly&&(el.matches('textarea,input:not([type]),input[type=text],input[type=search],input[type=url],input[type=email],input[type=tel]')||el.isContentEditable);
  document.addEventListener('focusin',e=>{if(editable(e.target)||e.target.matches?.('[data-serial-view]')){lastInput=e.target;applyScreenKeyboardPolicy(e.target);}});
  document.addEventListener('pointerdown',e=>{const field=e.target.closest?.('input,textarea,[contenteditable]');if(field)applyScreenKeyboardPolicy(field);},true);
  const inputObserver=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof HTMLElement)applyScreenKeyboardPolicy(node);});
  inputObserver.observe(document.querySelector('#previews'),{childList:true,subtree:true});
  setScreenKeyboardEnabled(!compactDesktop(innerWidth));
  const message=text=>{clearTimeout(noticeTimer);note.textContent=text;note.hidden=!text;position();if(text&&!busy)noticeTimer=setTimeout(()=>{note.hidden=true;},4000);};
  const status=text=>{
    phase=text;busy=/Loading|Opening|Listening|Transcribing/.test(text);
    dock.dataset.state=/Listening/.test(text)?'listening':busy?'busy':'ready';
    mic.setAttribute('aria-pressed',String(/Listening/.test(text)));
    const listening=/Listening/.test(text);mic.innerHTML=listening?stopIcon:microphone;
    mic.setAttribute('aria-label',listening?'Stop recording':busy?'Cancel voice input':'Start voice input');
    mic.title=listening?'Tap to stop recording':busy?'Tap to cancel':'Tap to start voice input';
    message(text||'Tap microphone to talk');
  };
  const moduleReady=import(new URL('assets/speech/client.mjs',document.baseURI)).then(module=>{
    speech=module;
    module.preloadVoice(text=>{if(!activeJob&&!busy){dock.dataset.state='loading';message(text);}}).then(()=>{if(!busy){dock.dataset.state='ready';message('Voice ready · tap microphone');}}).catch(()=>{if(!busy){dock.dataset.state='ready';message('Tap microphone to retry loading');}});
    return module;
  }).catch(error=>{mic.dataset.error=error.message;message('Voice could not load. Refresh to retry.');throw error;});
  // The promise is also awaited on a gesture; avoid an unhandled preload error.
  moduleReady.catch(()=>{});
  function destination(){
    const win=document.querySelector('.window.focused:not([hidden])');
    if(!win)return null;
    const input=lastInput?.isConnected&&win.contains(lastInput)?lastInput:win.querySelector('.guest-editor,.terminal-input')||win.querySelector('textarea:not([readonly]),input:not([type]),input[type=text]');
    if(!input)return null;
    if(input.matches('.terminal-input,[data-serial-view]')){
      const vm=v86Instance;if(guestState!=='ready'||!vm)return null;
      const id=Number(win.dataset.window),session=terminalSessions.get(id);
      return {element:input,valid:()=>v86Instance===vm&&guestState==='ready'&&terminalSessions.get(id)===session&&!session?.exited,insert:text=>{win.querySelector('[data-serial-view]')?.followOutput?.();insertTerminalText(id,text);}};
    }
    if(!editable(input))return null;
    if(typeof input.codiVoiceCapture==='function')return input.codiVoiceCapture();
    if(input.isContentEditable){
      const selection=getSelection();if(!selection?.rangeCount||!input.contains(selection.anchorNode))return null;
      const range=selection.getRangeAt(0).cloneRange(),before=input.textContent;
      return {element:input,valid:()=>input.textContent===before,insert:text=>{range.deleteContents();const node=document.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);if(document.activeElement===input){selection.removeAllRanges();selection.addRange(range);}input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));}};
    }
    const before=input.value,start=input.selectionStart??before.length,end=input.selectionEnd??start;
    return {element:input,valid:()=>input.value===before,insert:text=>{if(input.selectionStart===null)input.value=before.slice(0,start)+text+before.slice(end);else input.setRangeText(text,start,end,'end');input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));}};
  }
  async function begin(){
    if(activeJob)return;
    const target=destination();if(!target){message('Click a text field or terminal, then tap the microphone.');return;}
    if(onScreenKeyboardEnabled)setScreenKeyboardEnabled(false);
    const token={target,session:currentSession?.id};activeJob=token;delete mic.dataset.error;
    try{
      const module=await moduleReady;if(activeJob!==token)return;
      await module.toggleVoice({terminal:target.element,status,insert:text=>{if(target.valid())target.insert(text);else message('Text changed while listening. Voice text was discarded.');},sessionValid:()=>currentSession?.id===token.session&&target.valid()});
    }catch(error){mic.dataset.error=error.message;status(error.name==='NotAllowedError'?'Allow microphone access, then tap the microphone again.':error.message||'Voice input failed.');}
    finally{if(activeJob===token)activeJob=null;}
  }
  let placement={x:1,y:1},drag=null,ignoreMicClick=false;
  function bounds(){const view=visualViewport;return {left:(view?.offsetLeft||0)+8,top:(view?.offsetTop||0)+8,width:Math.max(0,(view?.width||innerWidth)-dock.offsetWidth-16),height:Math.max(0,(view?.height||innerHeight)-dock.offsetHeight-16)};}
  function position(){const box=bounds(),left=box.left+box.width*placement.x,top=box.top+box.height*placement.y;dock.style.left=left+'px';dock.style.top=top+'px';note.style.left=Math.max(box.left-left,Math.min(dock.offsetWidth-note.offsetWidth,box.left+box.width+dock.offsetWidth-left-note.offsetWidth))+'px';note.style.right='auto';const below=top-box.top<note.offsetHeight+8;note.style.top=below?'calc(100% + 8px)':'auto';note.style.bottom=below?'auto':'calc(100% + 8px)';}
  mic.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();ignoreMicClick=false;const rect=dock.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:rect.left,top:rect.top};mic.setPointerCapture(e.pointerId);});
  mic.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!ignoreMicClick&&Math.hypot(dx,dy)<6)return;ignoreMicClick=true;const box=bounds();placement={x:box.width?Math.max(0,Math.min(1,(drag.left+dx-box.left)/box.width)):0,y:box.height?Math.max(0,Math.min(1,(drag.top+dy-box.top)/box.height)):0};position();});
  mic.addEventListener('pointerup',()=>{drag=null;});
  mic.addEventListener('pointercancel',()=>{drag=null;ignoreMicClick=true;});
  mic.addEventListener('lostpointercapture',()=>{drag=null;});
  mic.addEventListener('click',()=>{if(ignoreMicClick){ignoreMicClick=false;return;}if(/Listening/.test(phase))speech?.stopVoice();else if(activeJob||busy){speech?.cancelVoice();activeJob=null;status('Voice cancelled.');}else begin();});
  mic.addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('visibilitychange',()=>{if(document.hidden){speech?.cancelVoice();activeJob=null;}});
  document.addEventListener('codi-desktop-blocked',()=>{speech?.cancelVoice();activeJob=null;});
  voiceControl={toggle(){dock.hidden=!dock.hidden;if(dock.hidden){speech?.cancelVoice();activeJob=null;}else position();}};
  visualViewport?.addEventListener('resize',position);visualViewport?.addEventListener('scroll',position);window.addEventListener('resize',position);position();
}
function refreshTerminals(){for(const desktop of surfaces.values())desktop.render();updateScaleNote();}
function appendSerial(text){serialPending+=text;if(!serialFrame)serialFrame=requestAnimationFrame(flushSerial);}
function flushSerial(){
  serialFrame=0;if(!serialPending)return;serialScreen.feed(serialPending);serialPending='';
  const full=serialScreen.text();serialOutput.splice(0,serialOutput.length,full);
  if(!bootFailed&&full.includes('Kernel panic - not syncing')){failGuest('Linux stopped. See the terminal output above.');return;}

}
function serialKey(e){
  if(guestState!=='ready'||e.isComposing)return;
  if(e.metaKey||e.ctrlKey&&(['v','V'].includes(e.key)||e.shiftKey))return;
  if(e.ctrlKey&&e.key.toLowerCase()==='c'&&window.getSelection()?.toString())return;
  const keys={Enter:'\r',Backspace:'\x7f',Tab:'\t',Escape:'\x1b',ArrowUp:'\x1b[A',ArrowDown:'\x1b[B',ArrowRight:'\x1b[C',ArrowLeft:'\x1b[D',Home:'\x1b[H',End:'\x1b[F',Delete:'\x1b[3~',PageUp:'\x1b[5~',PageDown:'\x1b[6~'};
  let text=keys[e.key];
  if(e.ctrlKey&&/^[a-z]$/i.test(e.key))text=String.fromCharCode(e.key.toUpperCase().charCodeAt(0)-64);
  else if(!text&&e.key.length===1&&!e.ctrlKey)text=(e.altKey?'\x1b':'')+e.key;
  if(text){e.preventDefault();e.stopPropagation();const output=e.currentTarget?.closest('.terminal-content')?.querySelector('[data-serial-view]');output?.followOutput?.();sendTerminal(Number(output?.dataset.terminalId),text);}
}
async function recoverDesktopSession(){
  if(accountTransition||renewingIdentity)throw Error('Waiting for the current account operation.');
  renewingIdentity=true;
  try{
    const {refreshRecoveryPolicy}=await import('./assets/desktop/recovery-policy.mjs');
    await refreshRecoveryPolicy(identityConfig);
    try{await identityModule.renewSession(identityConfig,currentSession);guestNetworkAdapter?.syncSession();}
    catch(error){
      if(error.status!==401)throw error;
      await endSession();
    }
  }finally{renewingIdentity=false;}
}
async function initializeSession(){
  const response=await fetch('config.json',{cache:'no-store'});
  if(!response.ok)throw Error('Identity configuration could not be loaded.');
  identityConfig=await response.json();
  identityModule=await import('./network/identity.mjs');
  const session=await requiredLogin();
  sessionViews(session);
  currentSession=session;
  startMirror();
  document.documentElement.classList.remove('login-required');
  if(identityConfig.identity.mode==='server')identityTimer=setInterval(maintainIdentity,30000);
  for(const surface of surfaces.values()){surface.restoreLayout();surface.render();}
  refreshTerminals();
  if(identityConfig.guestNetwork){const cookie=await fetch('codi-guest-cookie',{credentials:'same-origin',cache:'no-store',redirect:'error'});if(!cookie.ok)throw Error('Linux network connection could not be initialized.');}
  await startGuest();
  if(identityConfig.desktopLifecycle){
    bootRecovery?.stop();bootRecovery=null;
    const {startLifecycle}=await import('./assets/desktop/lifecycle.mjs');
    // Guest Internet can reconnect independently; it must not lock the desktop
    // when the account and file services are still available.
    desktopLifecycle=startLifecycle({config:identityConfig,roots:()=>[document.querySelector('#previews'),document.querySelector('#voice-control')],recoverSession:recoverDesktopSession});
  }
}
function sessionViews(session){
  // The guest never receives the signing key or issuer session token.
  return Object.defineProperties(session,{
    id:{get(){return this.public.sid;}},
    kind:{get(){return this.trust.level==='local'?'local':this.public.kind;}},
    displayName:{get(){return this.public.name;}},
    localKeyFingerprint:{get(){return this.fingerprint;}}
  });
}
async function accountSession(mode,username,password){
  if(mode==='anonymous')return identityModule.beginSession(identityConfig,'anonymous');
  if(identityConfig?.identity.mode!=='server'||!identityConfig.accounts?.actions?.includes(mode))throw Error('Accounts are unavailable in this preview.');
  const {makeKey,thumbprint,sameKey}=await import('./network/crypto.mjs'),key=await makeKey(),sid=crypto.randomUUID();
  const session={privateKey:key.privateKey,public:{sid,sub:sid,name:'anon-'+sid.slice(0,8),kind:'anonymous',key:key.publicKey,certificate:null}};
  const result=await identityModule.authenticatedRequest(identityConfig.identity,session,identityConfig.identity.apiBase+'/auth',{username,password,operation:mode});
  if(!sameKey(result.identity.key,session.public.key))throw Error('Server changed the session key.');
  const trust=await identityModule.verifyIdentity(result.identity,identityConfig.identity);
  if(result.identity.kind!=='registered'||result.identity.name!==username.trim().toLowerCase())throw Error('Account identity did not match.');
  session.public=result.identity;session.token=result.session_token;session.trust=trust;session.fingerprint=await thumbprint(session.public.key);return session;
}
function requiredLogin(){
  document.documentElement.classList.add('login-required');
  document.querySelector('.login-gate')?.remove();
  const gate=make('main','login-gate'),card=make('section','login-card'),form=make('form','login-form');
  gate.setAttribute('aria-label','Sign in to CodiServer');card.append(make('h1','','CodiServer'),make('p','','Sign in or create an account to continue.'));
  const name=make('input'),password=make('input'),confirmation=make('input');
  name.type='text';name.required=true;name.minLength=3;name.maxLength=28;name.pattern='[A-Za-z][A-Za-z0-9]{2,27}';name.autocomplete='username';name.autocapitalize='none';name.spellcheck=false;name.setAttribute('aria-label','Username');
  password.type='password';password.required=true;password.maxLength=256;password.autocomplete='current-password';password.setAttribute('aria-label','Password');
  confirmation.type='password';confirmation.maxLength=64;confirmation.autocomplete='new-password';confirmation.setAttribute('aria-label','Confirm password');
  const nameLabel=make('label','','Username'),passwordLabel=make('label','','Password'),confirmLabel=make('label','','Confirm password');nameLabel.append(name);passwordLabel.append(password);confirmLabel.append(confirmation);
  const hint=make('p','login-hint'),error=make('p','login-error');error.setAttribute('role','alert');const submit=make('button','','Sign in');submit.type='submit';const toggle=make('button','login-toggle','Create an account');toggle.type='button';let mode='signin',busy=false;
  function paint(){const register=mode==='register';confirmLabel.hidden=!register;confirmation.required=register;password.maxLength=register?64:256;password.autocomplete=register?'new-password':'current-password';submit.textContent=register?'Register':'Sign in';toggle.textContent=register?'Already have an account? Sign in':'Create an account';hint.textContent=register?'Username: 3–28 letters or numbers, starting with a letter. Password: 4–32 characters.':'Use your username and password.';error.textContent='';}
  toggle.addEventListener('click',()=>{if(busy)return;mode=mode==='signin'?'register':'signin';password.value='';confirmation.value='';paint();});
  form.append(nameLabel,passwordLabel,confirmLabel,hint,error,submit,toggle);card.append(form);gate.append(card);document.body.append(gate);paint();
  return new Promise(resolve=>{form.addEventListener('submit',async event=>{event.preventDefault();if(busy)return;const value=password.value,length=Array.from(value).length,maximum=mode==='register'?32:128;if(length<4||length>maximum||/[\u0000-\u001f\u007f-\u009f\p{Cs}]/u.test(value)){error.textContent='Password must be 4–'+maximum+' characters without control characters.';return;}if(mode==='register'&&value!==confirmation.value){error.textContent='Passwords do not match.';return;}busy=true;submit.disabled=true;toggle.disabled=true;error.textContent='';try{const session=await accountSession(mode,name.value,value);password.value='';confirmation.value='';gate.remove();resolve(session);}catch(failure){password.value='';confirmation.value='';error.textContent=failure.message||'Could not sign in. Please try again.';busy=false;submit.disabled=false;toggle.disabled=false;}});});
}
async function changeAccount(mode,username='',password='',stillWanted=()=>true){
  if(accountTransition)throw Error('An account change is already in progress.');
  accountTransition=true;
  try{
    const next=await accountSession(mode,username,password);
    if(!stillWanted()){await identityModule.logoutSession(identityConfig,next).catch(()=>{});return;}
    const previous=currentSession;
    if(previous&&previous.public?.sub!==next.public?.sub&&v86Instance){++bootEpoch;await v86Instance.stop();v86Instance=null;guestFiles.ready=false;terminalMuxReady=false;terminalSessions.clear();}
    for(const surface of surfaces.values())surface.saveLayout();
    currentSession=sessionViews(next);
    startMirror();
    guestNetworkAdapter?.syncSession();
    for(const surface of surfaces.values()){surface.closePopups();surface.restoreLayout();surface.render();}
    if(previous)identityModule.logoutSession(identityConfig,previous).catch(()=>{});
    if(v86Instance&&guestFiles.ready)v86Instance.create_file('/session.json',new TextEncoder().encode(JSON.stringify({sessionId:next.id,kind:next.kind,displayName:next.displayName}))).catch(()=>{});else await startGuest();
    feedback(mode==='anonymous'?'Signed out. Continuing as Anon.':'Signed in as '+next.displayName+'.');
  }finally{accountTransition=false;}
}
async function maintainIdentity(){
  if(!currentSession||renewingIdentity||accountTransition)return;
  const session=currentSession;
  const expiry=session.trust.claims?.exp;
  if(!expiry||expiry-Date.now()/1000>180)return;
  renewingIdentity=true;
  try{
    await identityModule.renewSession(identityConfig,session);
    if(currentSession===session){
      guestNetworkAdapter?.syncSession();
    }
  }catch(error){
    if(currentSession===session){
      const expired=expiry<=Date.now()/1000;
      feedback('Identity renewal failed: '+error.message);
      if(expired)guestNetworkAdapter?.reset();
    }
  }finally{renewingIdentity=false;for(const surface of surfaces.values())if(surface.appIdentity!==signedInSubject())surface.render();}
}
let bootEpoch=0;
let bootFailed=false;
function failGuest(message){bootFailed=true;guestState='error';guestMessage=String(message);guestFiles.ready=false;appendSerial('\r\nGuest error: '+guestMessage+'\r\n');if(serialFrame)cancelAnimationFrame(serialFrame);flushSerial();feedback(guestMessage);refreshTerminals();}
async function startGuest(){
  guestFiles.ready=false;
  const epoch=++bootEpoch;
  try{
    guestState='starting';guestMessage='Loading local Linux kernel and initramfs…';refreshTerminals();
    const imageResponse=await fetch('assets/terminal/v2/image.json',{cache:'no-store'});
    if(!imageResponse.ok)throw Error('The terminal guest image manifest is unavailable.');
    const image=await imageResponse.json();
    if(image.version!=='codi-terminal-image/2'||!Number.isSafeInteger(image.bytes)||image.bytes<1||image.bytes>67108864||!/^[0-9a-f]{64}$/.test(image.sha256)||image.path!=='assets/terminal/v2/'+image.sha256+'.cpio.gz')throw Error('Invalid terminal guest image metadata.');
    await Promise.all(['.build/v86/v86.wasm','.build/v86/seabios.bin','.build/v86/vgabios.bin','.build/v86/vmlinuz',image.path].map(async name=>{let response;try{response=await fetch(name,{method:'HEAD'});}catch(_){throw Error('Could not fetch guest asset '+name+'. Check the static server and assets.');}if(!response.ok)throw Error('Missing guest asset '+name+' (HTTP '+response.status+'). Run scripts/prepare-v86-assets.sh.');}));
    if(epoch!==bootEpoch)return;
    const relayPath=identityConfig.guestNetwork?.relayPath;
    const pageBase=new URL('.',location.href).pathname.replace(/\/$/,'');
    if(relayPath!==undefined&&relayPath!==pageBase+'/guest-network')throw Error('Invalid guest relay path');
    const relay=relayPath?new URL(relayPath,location.origin):null;if(relay)relay.protocol=location.protocol==='https:'?'wss:':'ws:';
    const controlled=identityConfig.guestNetwork?.authorization!==undefined;
    if(controlled&&!relay)throw Error('Guest authorization requires a relay');
    const GuestNetworkAdapter=controlled?(await import(pageBase+'/guest-access/client.mjs')).GuestNetworkAdapter:null;
    if(epoch!==bootEpoch)return;
    const {GuestWorkerClient}=await import(new URL('assets/desktop/guest-worker-client.mjs',document.baseURI));if(epoch!==bootEpoch)return;
    // v86 selects the browser scheduler when available; its normal nested
    // Worker scheduler remains the fallback. A fragment keeps the cache URL.
    const emulator=new GuestWorkerClient(new URL(pageBase+'/assets/desktop/guest-worker-runtime.js#use-scheduling-api',location.origin),{onFatal:error=>{if(epoch===bootEpoch){guestNetworkAdapter?.destroy();guestNetworkAdapter=null;failGuest(error.message);}}});
    const options={wasm_path:new URL('.build/v86/v86.wasm',document.baseURI).href,memory_size:256*1024*1024,
      bios:{url:new URL('.build/v86/seabios.bin',document.baseURI).href},vga_bios:{url:new URL('.build/v86/vgabios.bin',document.baseURI).href},
      bzimage:{url:new URL('.build/v86/vmlinuz',document.baseURI).href},initrd:{url:new URL(image.path,document.baseURI).href},
      ...(relay?{net_device:controlled?{type:'virtio'}:{type:'virtio',relay_url:relay.href}}:{}),
      filesystem:{},cmdline:'console=ttyS0,115200n8 rdinit=/init panic=-1 quiet loglevel=0'+(relay?' guest_net=1':''),autostart:true,disable_keyboard:true,disable_mouse:true,disable_speaker:true};
    v86Instance=emulator;
    if(controlled)guestNetworkAdapter=new GuestNetworkAdapter(emulator,identityConfig,{getSession:()=>currentSession,onStatus:value=>{if(value.mode==='disconnected')feedback('Linux Internet is unavailable; retrying. Browser files remain available.');}});
    emulator.add_listener('download-error',event=>{if(epoch===bootEpoch)failGuest('Could not load '+event.file_name+'. Check that the static server is running.');});
    setTimeout(()=>{if(epoch===bootEpoch&&!bootFailed&&guestState!=='ready')feedback('Linux is still starting. Keep this tab active; slower devices may need more time.');},60000);
    emulator.add_listener('serial0-output-byte',byte=>{if(epoch!==bootEpoch)return;receiveGuestSerial(String.fromCharCode(byte));});
    emulator.add_listener('emulator-ready',()=>{if(epoch!==bootEpoch)return;guestState='booting';guestMessage='Starting Linux and temporary home…';guestFiles.connect(emulator,{networkRelay:!!relay}).then(async()=>{await emulator.create_file('/session.json',new TextEncoder().encode(JSON.stringify({sessionId:currentSession.id,kind:currentSession.kind,displayName:currentSession.displayName})));}).catch(error=>{failGuest('Shared files: '+error.message);});refreshTerminals();});
    emulator.start(options);
  }catch(error){if(epoch!==bootEpoch)return;guestNetworkAdapter?.destroy();guestNetworkAdapter=null;if(v86Instance){try{await v86Instance.stop();}catch(_){}v86Instance=null;}failGuest(error.message||String(error));}
}
async function endSession(){

  for(const desktop of surfaces.values())desktop.saveLayout();
  desktopLifecycle?.stop();desktopLifecycle=null;
  clearInterval(identityTimer);
  guestNetworkAdapter?.destroy();guestNetworkAdapter=null;
  ++bootEpoch;if(v86Instance){try{await v86Instance.stop();}catch(_){}v86Instance=null;}
  if(currentSession&&identityModule){try{await identityModule.logoutSession(identityConfig,currentSession);}catch(error){console.warn('Session logout failed:',error.message);}}
  currentSession=null;serialOutput.length=0;serialPending='';guestState='loading';feedback('Signing out…');location.reload();
}
let bootRecovery=null,bootRetry=0;
async function initializeWithRecovery(){
  try{
    await initializeSession();bootRecovery?.stop();bootRecovery=null;
  }catch(error){
    clearInterval(identityTimer);identityTimer=null;
    if(currentSession&&identityModule)identityModule.logoutSession(identityConfig,currentSession).catch(()=>{});currentSession=null;
    feedback('Waiting for server: '+error.message);
    if(!bootRecovery){
      try{const {startLifecycle}=await import('./assets/desktop/lifecycle.mjs'),base=new URL('.',document.baseURI).pathname.replace(/\/$/,'');bootRecovery=startLifecycle({config:{identity:{apiBase:base+'/api/v1'},desktopLifecycle:{version:'codi-desktop-lifecycle/1',statusPath:base+'/api/v1/desktop-status'}},roots:()=>[document.querySelector('#previews'),document.querySelector('#voice-control')],getGuestLink:()=>false,hasRunningGuest:()=>false,initiallyDisconnected:true});}
      catch(moduleError){failGuest('Cannot reconnect yet: '+moduleError.message);}
    }
    clearTimeout(bootRetry);bootRetry=setTimeout(initializeWithRecovery,3000);
  }
}
initializeWithRecovery();
window.desktopLab={get lifecycle(){return desktopLifecycle?.state??null;},get settings(){return {...settings};},get surfaces(){return surfaces;},get reference(){return reference;},get session(){return currentSession?{id:currentSession.id,kind:currentSession.kind,displayName:currentSession.displayName,localKeyFingerprint:currentSession.localKeyFingerprint}:null;},get guestState(){return guestState;}};
function syncVisibleViewport(){
  const view=window.visualViewport,host=document.querySelector('#previews');
  if(!host)return;
  if(view&&view.scale===1&&compactDesktop(innerWidth)){host.style.height=Math.min(innerHeight,view.height)+'px';host.style.position='fixed';host.style.top=view.offsetTop+'px';}
  else{host.style.height='';host.style.position='';host.style.top='';}
}
window.visualViewport?.addEventListener('resize',syncVisibleViewport);
window.visualViewport?.addEventListener('scroll',syncVisibleViewport);
window.addEventListener('resize',syncVisibleViewport);syncVisibleViewport();
