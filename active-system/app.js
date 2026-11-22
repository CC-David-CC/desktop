'use strict';
window.CODI_PRIVATE_FILES_UI=1;
const reference = window.CODI_REFERENCE;
const $ = (s, root = document) => root.querySelector(s);
const make = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const shipped = {
  panelHeight: reference.panelHeight, iconSize: reference.iconSize, panelFontSize: 13.3333,
  workspaceWidth: reference.workspaceWidth, workspaceCount: reference.workspaceCount,
  menuRowHeight: reference.menuRowHeight, menuFontSize: reference.menuFontSize,
  titleHeight: 30, controlWidth: 36,
  titleFontSize: 12, titleIconSize:18, controlGlyphSize:18,
  workspaceLabels: false, volumeButton: false, panelLabelsBold:false
};
let settings = {...shipped};
// Accounts owns retained sign-in; Desktop keeps only its public projection.
let resolution = [innerWidth,innerHeight], hitboxes = false;
const surfaces = new Map();
const models = new Map();
let currentSession = null;
let identityConfig = null;
let accountServices = null;
let panelPins = null;
let defaultPanelPins = ['files'];
let desktopAgentOperations = null;
const sessionAccounts=new WeakMap();
const viewerProfile=window.CODI_VIEWER_PROFILE;
const enabledApp=id=>viewerProfile.apps.includes(id);
const layerAccountApps=['photocraft','vectorcraft','figcraft','anicraft','lightcraft','designcraft','soundcraft','filmcraft','effectcraft','cadcraft','texturecraft','materialcraft','sketchcraft','solidcraft','pcbcraft','fieldcraft'];
const learningGames = Object.freeze({
  'math-path': 'Math Path',
  'fraction-farm': 'Fraction Farm',
  'word-weaver': 'Word Weaver',
  'rule-detective': 'Rule Detective',
  'market-math': 'Market Math',
  'pocket-conquest': 'Pocket Conquest',
  'tile-islands': 'Tile Islands'
});
const drakonApps = Object.freeze({'drakon-python':'DRAKON Python','drakon-javascript':'DRAKON JavaScript','drakon-bash':'DRAKON Bash'});
const accountDocumentNames=Object.freeze({notecraft:'NoteCraft','i-success':'I-SUCCESS',narrator:'Narrator',...drakonApps,...learningGames,mathcraft:'MathCraft',text:'Text Editor',wordcraft:'WordCraft',pdfcraft:'PdfCraft',gridcraft:'GridCraft',deckcraft:'DeckCraft',photocraft:'PhotoCraft',vectorcraft:'VectorCraft',figcraft:'FigCraft',anicraft:'AniCraft',lightcraft:'LightCraft',designcraft:'DesignCraft',soundcraft:'SoundCraft',filmcraft:'FilmCraft',effectcraft:'EffectCraft',cadcraft:'CADCraft',texturecraft:'TextureCraft',materialcraft:'MaterialCraft',sketchcraft:'SketchCraft',solidcraft:'SolidCraft',pcbcraft:'PCBCraft',fieldcraft:'FieldCraft'});
async function renewAccountSession(session){const client=sessionAccounts.get(session);if(!client)throw Error('Account session unavailable.');await client.renew();}
async function logoutAccountSession(session){const client=sessionAccounts.get(session);if(client)await client.logout();}
let identityTimer = null;
let renewingIdentity = false;
let accountTransition = false;
let guestState = viewerProfile.guest ? 'idle' : 'disabled';
let guestMessage = viewerProfile.guest ? 'Open Terminal to start Linux.' : 'Linux is not enabled.';
const serialOutput = [];
let serialPending = '';
let serialFrame = 0;
let v86Instance = null;
let guestNetworkAdapter = null;
let guestAccountDevice = null;
let guestAccountSyncTimer = null;
let desktopLifecycle = null;
let deviceCacheModule = import('./assets/desktop/device-cache.mjs');
deviceCacheModule.then(module=>viewerProfile.offlineCache?module.registerDeviceCache():null).catch(error=>console.warn('Device app cache unavailable:',error.message));
let feedbackTimer = null;
let onScreenKeyboardEnabled = false;
let voiceControl = null;
const originalInputModes = new WeakMap();
function applyScreenKeyboardPolicy(root=document){
  const fields=[...(root.matches?.('input,textarea,[contenteditable]')?[root]:[]),...root.querySelectorAll('input,textarea,[contenteditable]')];
  for(const field of fields){
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
const browserSourcePages=new Set();
function closeBrowserSourcePages(){for(const page of browserSourcePages)page.stop();browserSourcePages.clear();}
function showBrowserSources(){
  const session=currentSession;
  if(session?.public.kind!=='registered'||!identityConfig?.browserRelay){feedback('Sign in to view Browser licenses and source.');return;}
  const popup=window.open('about:blank','_blank');
  if(!popup){feedback('Allow pop-ups to open Browser licenses and source.');return;}
  popup.opener=null;popup.document.title='Browser licenses and source';popup.document.body.textContent='Opening licenses and source…';
  const sessionValid=()=>currentSession===session;
  const valid=()=>sessionValid()&&!popup.closed;
  (async()=>{try{
    const [{startBrowserSourcePage},{openBrowserRelay}]=await Promise.all([import('./assets/desktop/browser-source-launcher.mjs'),import('./assets/desktop/browser-relay-client.mjs')]);
    if(!valid()){popup.close();return;}
    let page;page=startBrowserSourcePage({popup,origin:location.origin,valid,notify:feedback,onStop:()=>browserSourcePages.delete(page),connect:options=>openBrowserRelay(identityConfig,session,{...options,valid:sessionValid})});
    browserSourcePages.add(page);await page.ready;if(!valid()){page.stop();browserSourcePages.delete(page);}
  }catch(error){popup.close();feedback('Could not open licenses and source: '+error.message);}})();
}
function compactDate(now){const two=n=>String(n).padStart(2,'0');return two(now.getMonth()+1)+'/'+two(now.getDate())+'/'+two(now.getFullYear()%100);}
function refreshDesktopClocks(){
  const now=new Date(),date=compactDate(now),time=now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  for(const clock of document.querySelectorAll('.panel .clock'))clock.textContent=date;
  for(const popup of document.querySelectorAll('.status-popup[data-status-type="clock"]')){
    const dateLine=popup.querySelector('.clock-date'),timeLine=popup.querySelector('.clock-time');
    if(dateLine)dateLine.textContent=now.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'});
    if(timeLine)timeLine.textContent=time;
  }
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
  if(!s||sessionAccounts.get(s)?.inspect().phase!=='authenticated')return null;
  return s?.public.kind==='registered'&&['official','test-server'].includes(s.trust?.level)&&s.trust.claims?.sub===s.public.sub&&s.trust.claims.exp>Date.now()/1000?s.public.sub:null;
}
function accountApplications(){
  const subject=signedInSubject();if(!subject||!enabledApp('personal-template'))return [];
  if(!accountAppCatalogs.has(subject))accountAppCatalogs.set(subject,new Map(accountAppTemplates.map(template=>{
    const id='user-app:'+subject.slice(5)+':'+template.slot;
    return [id,{...template,id,ownerSub:subject,ownerName:currentSession.public.name}];
  })));
  return [...accountAppCatalogs.get(subject).values()];
}
const isAccountApp=app=>typeof app==='string'&&app.startsWith('user-app:');
const accountApp=app=>accountApplications().find(entry=>entry.id===app);
const availableApplication=app=>!isAccountApp(app)||!!accountApp(app);
const accountWindow=w=>(!w.ownerSub||w.ownerSub===workspaceOwner())&&(!isAccountApp(w.app)||!!accountApp(w.app));
function feedback(text) {
  clearTimeout(feedbackTimer);const status=$('#feedback');status.textContent=text;
  if(text)feedbackTimer=setTimeout(()=>{status.textContent='';feedbackTimer=null;},4000);
}
function icon(key, direct = false) {
  if(isAccountApp(key))key='prototype-'+key.split(':').at(-1);
  const drawings={
    applications:'<path d="M5 4h4l3 5 3-5h4l-5 8 5 8h-4l-3-5-3 5H5l5-8z" fill="#397fbb" stroke="#28639a"/>',
    'end-session':'<path d="M5 4h4l3 5 3-5h4l-5 8 5 8h-4l-3-5-3 5H5l5-8z" fill="#397fbb" stroke="#28639a"/>',
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
    'jsketcher':'<path d="M12 2 21 7v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10"/>',
    'excalidraw':'<path d="M4 17 16 5l3 3L7 20H4z"/>',
    'svg-editor':'<path d="M4 4h16v16H4zM7 16l5-9 5 9z"/>',
    'gcode-preview':'<path d="M4 4h16v16H4zM7 15l3-5 3 3 3-6"/>',
    spreadsheet:'<rect x="3" y="3" width="18" height="18" rx="2" fill="#dcf1e5"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    'pdf-viewer':'<path fill="#fce2e2" d="M5 2h10l5 5v15H5z"/><path d="M15 2v6h5M8 12h8M8 16h8M8 20h5"/>',
    'document-editor':'<path fill="#e3f0fc" d="M5 2h10l5 5v15H5z"/><path d="M15 2v6h5M8 11h9M8 15h9M8 19h6"/>',
    'image-editor':'<rect x="3" y="4" width="18" height="16" rx="2" fill="#e3f0fc"/><circle cx="8" cy="9" r="2"/><path d="M5 18l5-5 3 3 2-2 4 4"/>',
    text:'<path fill="#fff" d="M5 2h10l5 5v15H5z"/><path d="M15 2v6h5M8 11h9M8 15h9M8 19h6"/>',
    'falling-blocks':'<rect x="3" y="3" width="8" height="8" rx="1" fill="#69c9d0"/><rect x="12" y="3" width="8" height="8" rx="1" fill="#edc76a"/><rect x="12" y="12" width="8" height="8" rx="1" fill="#a693e8"/>',
    'owl-companion':'<circle cx="8" cy="10" r="5" fill="#d6b46a"/><circle cx="16" cy="10" r="5" fill="#d6b46a"/><path d="M4 7 8 3l1 5m11-1-4-4-1 5M7 18h10l-5 4z" fill="#8a6538"/><circle cx="8" cy="10" r="1.5" fill="#172238"/><circle cx="16" cy="10" r="1.5" fill="#172238"/>',
    microduck:'<circle cx="12" cy="11" r="8" fill="#f5d65c"/><circle cx="15" cy="9" r="1.4" fill="#303743"/><path d="M19 12h4l-4 3z" fill="#e7934e"/>',
    'physics-playground':'<circle cx="8" cy="8" r="4" fill="#74b8e5"/><rect x="13" y="12" width="8" height="8" rx="1" fill="#e7a764"/><path d="M2 21h20" stroke="#65758b"/>',
    'snake-garden':'<path d="M5 5h3v3H5zm0 3h3v3H5zm3 3h3v3H8zm3 0h3v3h-3zm3 3h3v3h-3z" fill="#6cab65"/><circle cx="18" cy="19" r="1" fill="#172238"/><path d="M3 20h18" stroke="#8f6b42"/>',
    'clockwork-room':'<circle cx="12" cy="12" r="8" fill="#d6b36a" stroke="#604a2a"/><circle cx="12" cy="12" r="2" fill="#604a2a"/><path d="M12 6v6l4 2M8 8l1.5 1.5" stroke="#604a2a"/>',
    'chess-study':'<rect x="4" y="4" width="16" height="16" rx="1" fill="#efe6d2"/><path d="M4 12h16M12 4v16" stroke="#6b5541"/><path d="M6 6h4v4H6zm8 8h4v4h-4z" fill="#6b5541"/>',
    solitaire:'<rect x="2" y="4" width="10" height="15" rx="1" fill="#f5f0e5" stroke="#59606a"/><rect x="8" y="7" width="10" height="15" rx="1" fill="#e8edf5" stroke="#59606a"/><path d="M17 10c-2 0-3 1.5-3 3 0 2.5 3 4 3 4s3-1.5 3-4c0-1.5-1-3-3-3z" fill="#b94e5c"/>',
    'sky-courier':'<path d="M3 15h12l4-8 2 10-6-1-5 4z" fill="#73b9e4" stroke="#4f6375"/><path d="M13 8 9 3 8 10" fill="#efc262"/><circle cx="16" cy="11" r="1" fill="#172238"/>',
    'marble-works':'<path d="M3 18c3-8 7-10 10-3s5 3 8-2" fill="none" stroke="#7b6750" stroke-width="3"/><circle cx="8" cy="12" r="3" fill="#7bb8eb"/><path d="M14 5h7v3" stroke="#7b6750"/>',
    'stack-balance':'<rect x="4" y="16" width="6" height="4" fill="#d59a5f"/><rect x="10" y="11" width="6" height="4" fill="#6ea7d8"/><rect x="16" y="6" width="5" height="4" fill="#d7be65"/><path d="M3 21h18" stroke="#59606a"/>',
    'crystal-defense':'<path d="m12 2 7 7-7 13-7-13z" fill="#8bd6df" stroke="#456d7b"/><path d="M5 9h14M12 2v20M8 10l4 8 4-8" stroke="#e8fbff"/>',
    'drone-circuit':'<path d="M8 9h8l3 5-7 3-7-3z" fill="#73b9e4" stroke="#4f6375"/><circle cx="5" cy="6" r="3" fill="#d5e9f5"/><circle cx="19" cy="6" r="3" fill="#d5e9f5"/><path d="M6 7l3 3m9-3-3 3" stroke="#59606a"/>',
    'reactive-control-desk':'<rect x="3" y="5" width="18" height="14" rx="2" fill="#d9dfe5" stroke="#59606a"/><circle cx="8" cy="12" r="3" fill="#7fcab9"/><path d="M13 10h5m-5 4h5" stroke="#59606a"/>',
    'story-cards':'<rect x="3" y="5" width="11" height="15" rx="1" fill="#f2e8d5" stroke="#6b5541"/><rect x="10" y="3" width="11" height="15" rx="1" fill="#e4edf5" stroke="#59606a"/><path d="M15 7h3m-3 3h3m-3 3h2" stroke="#59606a"/>',
    'expression-puppet':'<circle cx="12" cy="11" r="8" fill="#e4c89c" stroke="#6b5541"/><circle cx="9" cy="10" r="1.5" fill="#172238"/><circle cx="15" cy="10" r="1.5" fill="#172238"/><path d="M8 14c2 2 6 2 8 0" stroke="#7a3d3d"/><path d="M5 4 2 1m17 3 3-3" stroke="#8e6b4b"/>',
    'rhythm-garden':'<circle cx="7" cy="15" r="4" fill="#e48c9a"/><circle cx="12" cy="9" r="4" fill="#d4b85e"/><circle cx="17" cy="15" r="4" fill="#78b7d8"/><path d="M12 21v-9" stroke="#5a8b5b"/>',
    'lantern-leap':'<path d="M8 8h8l2 12H6z" fill="#e7b761" stroke="#7a5d35"/><path d="M10 8V5h4v3M9 4h6" stroke="#7a5d35"/><path d="M18 4l4 4-4 4-4-4z" fill="#e48c50"/>',
    'garden-defense':'<path d="M4 20c0-8 3-12 8-12s8 4 8 12" fill="#78ad68"/><path d="M12 8V3m0 3-4-3m4 3 4-3" stroke="#5b7d4e"/><circle cx="12" cy="13" r="4" fill="#d8c35d"/>',
    'pocket-rally':'<path d="M4 16h16l-2-6H8z" fill="#e46c57" stroke="#703f36"/><circle cx="8" cy="18" r="2.2" fill="#26313d"/><circle cx="16" cy="18" r="2.2" fill="#26313d"/><path d="M10 10h5" stroke="#f6d46a"/>',
    'sling-targets':'<path d="M4 20 9 8h6l5 12M12 8V3m-4 2 4-2 4 2" fill="none" stroke="#59606a" stroke-width="2"/><circle cx="12" cy="13" r="3" fill="#e46c57"/><circle cx="12" cy="13" r="1" fill="#f5f0e5"/>',
    'gravity-pinball':'<path d="M6 3h12l2 18H4z" fill="#202d3e"/><circle cx="12" cy="9" r="3" fill="#e7d35e"/><path d="M5 18l5-3v5zm14 0-5-3v5z" fill="#6dbddb"/><circle cx="8" cy="6" r="1" fill="#e46c57"/>',
    'kinetic-relay':'<path d="M4 18 10 6l4 12z" fill="#d39b66"/><circle cx="15" cy="9" r="4" fill="none" stroke="#73b9e4" stroke-width="2"/><circle cx="20" cy="17" r="2" fill="#e7d35e"/><path d="M2 20h20" stroke="#59606a"/>',
    'tabletop-bot-arena':'<circle cx="12" cy="12" r="9" fill="#d9dfe5" stroke="#59606a"/><rect x="6" y="8" width="5" height="4" rx="1" fill="#e46c57"/><rect x="13" y="12" width="5" height="4" rx="1" fill="#73b9e4"/><path d="M12 3v3m0 12v3" stroke="#59606a"/>',
    'pocket-golf':'<circle cx="8" cy="7" r="2" fill="#f5f0e5"/><path d="M10 7v11" stroke="#59606a" stroke-width="2"/><path d="M5 19c4-2 10-2 14 0" fill="none" stroke="#78ad68" stroke-width="2"/><circle cx="15" cy="16" r="1.6" fill="#172238"/>',
    'target-garden':'<circle cx="12" cy="12" r="8" fill="none" stroke="#e46c57" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="#d4b85e" stroke-width="2"/><circle cx="12" cy="12" r="1.5" fill="#59606a"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3" stroke="#59606a"/>',
    'orbital-courier':'<circle cx="12" cy="12" r="5" fill="#73b9e4" stroke="#4f6375"/><ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="#e7d35e" transform="rotate(-28 12 12)"/><circle cx="20" cy="8" r="1.5" fill="#e46c57"/><path d="M9 12h6M12 9v6" stroke="#f5f7fa"/>',
    'clockwork-quest':'<circle cx="12" cy="12" r="8" fill="#d6b36a" stroke="#604a2a"/><path d="M12 7v5l3 2M4 5l3 3m13-3-3 3M4 19l3-3m13 3-3-3" stroke="#604a2a"/><circle cx="12" cy="12" r="2" fill="#e46c57"/>',
    'memory-garden':'<rect x="3" y="4" width="7" height="9" rx="1" fill="#d8e8c0" stroke="#5b7d4e"/><rect x="14" y="11" width="7" height="9" rx="1" fill="#e8d7b7" stroke="#7a5d35"/><circle cx="7" cy="8" r="2" fill="#d4b85e"/><path d="M15 16h5m-2.5-2.5v5" stroke="#5b7d4e"/>',
    calculator:'<rect x="4" y="2" width="16" height="20" rx="2" fill="#d8dee2"/><path fill="#b8dcdf" d="M7 5h10v5H7z"/><path d="M7 13h2m2 0h2m2 0h2M7 16h2m2 0h2m2 0h2M7 19h2m2 0h2m2 0h2"/>',
    help:'<circle cx="12" cy="12" r="10" fill="#d4e8fb"/><path d="M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4m0 3v1"/>'
  };
  if(drawings[key]){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('icon');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('fill','none');svg.setAttribute('stroke','#45545b');svg.setAttribute('stroke-width','1.5');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.innerHTML=drawings[key];return svg;
  }
  const weatherIcons = {narrator:'assets/desktop/narrator.svg',weather:'assets/desktop/weather.svg','weather-maps':'assets/desktop/weather-maps.svg'};
  const path = (Object.hasOwn(drakonApps,key) ? 'assets/desktop/'+key+'.svg' : null) || (key === 'mathcraft' ? 'assets/desktop/mathcraft.svg' : null) || weatherIcons[key] || (direct ? key : reference.icons[key]);
  if (!path) return make('span','icon');
  const img = make('img','icon'); img.src = path; img.alt = ''; img.draggable = false; return img;
}
function button(label, handler, cls = '') {
  const n = make('button', cls); n.type='button'; n.setAttribute('aria-label',label);
  if (handler) n.addEventListener('click',handler); return n;
}
function textButton(label, handler, cls = '') { const n=button(label,handler,cls);n.textContent=label;return n; }
const desktopMenu=[
  {name:'Browser (in development)',icon:'browser',disabled:true,disabledTitle:'In development'},
  {name:'Office',icon:'document-editor',children:[...(enabledApp('notecraft')?[{name:'NoteCraft',icon:'notebook'}]:[]),{name:'WordCraft',icon:'document-editor'},{name:'PdfCraft',icon:'pdf-viewer'},{name:'GridCraft',icon:'spreadsheet'},{name:'DeckCraft',icon:'document-editor'},{name:'DesignCraft',icon:'document-editor'},{name:'Text Editor',icon:'text'},{name:'Document Editor',icon:'document-editor'},{name:'Spreadsheet',icon:'spreadsheet'},{name:'Data Explorer (Perspective)',icon:'spreadsheet'},{name:'PDF Viewer',icon:'pdf-viewer'}]},
  {name:'Weather & Maps',icon:'weather',children:[{name:'Weather',icon:'weather'},{name:'Weather Maps',icon:'weather-maps'}]},
  ...(enabledApp('i-success')?[{name:'Learning',icon:'notebook',children:[{name:'I-SUCCESS',icon:'notebook'}]}]:[]),
  {name:'Programming',icon:'notebook',children:[...Object.entries(drakonApps).filter(([id])=>enabledApp(id)).map(([icon,name])=>({name,icon})),...(enabledApp('mathcraft')?[{name:'MathCraft',icon:'mathcraft'}]:[]),{name:'Terminal',icon:reference.icons.terminal},...(enabledApp('linux-x11')?[{name:'Linux X11',icon:reference.icons.terminal}]:[]),{name:'Python Notebook — Browser',icon:'notebook'},{name:'Python Notebook — Linux (in development)',icon:'notebook',disabled:true,disabledTitle:'In development'}]},
  {name:'Electronics',icon:'help',children:[{name:'PCBCraft',icon:'help'},{name:'Arduino Simulator',icon:'help'},{name:'Pico Simulator',icon:'help'},{name:'Circuit Simulator',icon:'help'},{name:'Electronics Design',icon:'help'},{name:'Digital Logic',icon:'help'}]},
  {name:'Crafts',icon:'image-editor',children:[{name:'Embroidery Studio',icon:'image-editor'},{name:'Stitch Converter',icon:'image-editor'}]},
  {name:'Graphics',icon:'image-editor',children:[{name:'PhotoCraft',icon:'image-editor'},{name:'VectorCraft',icon:'image-editor'},{name:'FigCraft',icon:'image-editor'},{name:'LightCraft',icon:'image-editor'}]},
  {name:'Animation & Video',icon:'image-editor',children:[{name:'AniCraft',icon:'image-editor'},{name:'FilmCraft',icon:'image-editor'},{name:'EffectCraft',icon:'image-editor'}]},
  {name:'CAD',icon:'replicad',children:[{name:'CADCraft',icon:'replicad'},{name:'SolidCraft',icon:'replicad'},{name:'SketchCraft',icon:'replicad'},{name:'FieldCraft',icon:'replicad'}]},
  {name:'Materials & Textures',icon:'image-editor',children:[{name:'TextureCraft',icon:'image-editor'},{name:'MaterialCraft',icon:'image-editor'}]},
  {name:'Diagramming',icon:'image-editor',children:[{name:'Image Editor',icon:'image-editor'},{name:'diagrams.net',icon:'diagrams-net'},{name:'Excalidraw',icon:'image-editor'},{name:'SVG-edit',icon:'image-editor'}]},
  {name:'3D Printing',icon:'help',children:[{name:'Kiri:Moto',icon:'kiri-moto'},{name:'Mesh:Tool',icon:'mesh-tool'},{name:'G-code Preview',icon:'gcode-preview'},{name:'Replicad',icon:'replicad'},{name:'jSketcher',icon:'replicad'}]},
  {name:'Games',icon:'falling-blocks',children:[
    {name:'Learning & Strategy',icon:'falling-blocks',children:Object.values(learningGames).map(name=>({name,icon:'falling-blocks'}))},
    {name:'Arcade games',icon:'falling-blocks',children:[{name:'Falling Blocks (preview)',icon:'falling-blocks'},{name:'Chess Study (preview)',icon:'chess-study'},{name:'Solitaire (preview)',icon:'solitaire'},{name:'Sky Courier (preview)',icon:'sky-courier'},{name:'Snake Garden (preview)',icon:'snake-garden'},{name:'Lantern Leap (preview)',icon:'lantern-leap'},{name:'Garden Defense (preview)',icon:'garden-defense'},{name:'Pocket Rally (preview)',icon:'pocket-rally'}]},
    {name:'Physics games (XR planned)',icon:'physics-playground',children:[{name:'Microduck',icon:'microduck'},{name:'Physics Playground (preview)',icon:'physics-playground'},{name:'Marble Works (preview)',icon:'marble-works'},{name:'Stack & Balance (preview)',icon:'stack-balance'},{name:'Sling Targets (preview)',icon:'sling-targets'},{name:'Gravity Pinball (preview)',icon:'gravity-pinball'},{name:'Kinetic Relay (preview)',icon:'kinetic-relay'},{name:'Tabletop Bot Arena (preview)',icon:'tabletop-bot-arena'}]},
    {name:'World games (XR planned)',icon:'clockwork-room',children:[{name:'Clockwork Room (preview)',icon:'clockwork-room'},{name:'Crystal Defense (preview)',icon:'crystal-defense'},{name:'Drone Circuit (preview)',icon:'drone-circuit'},{name:'Pocket Golf (preview)',icon:'pocket-golf'},{name:'Target Garden (preview)',icon:'target-garden'},{name:'Orbital Courier (preview)',icon:'orbital-courier'},{name:'Clockwork Quest (preview)',icon:'clockwork-quest'}]},
    {name:'Interactive games',icon:'owl-companion',children:[{name:'Owl Companion (preview)',icon:'owl-companion'},{name:'Reactive Control Desk (preview)',icon:'reactive-control-desk'},{name:'Story Cards (preview)',icon:'story-cards'},{name:'Expression Puppet (preview)',icon:'expression-puppet'},{name:'Rhythm Garden (preview)',icon:'rhythm-garden'},{name:'Memory Garden (preview)',icon:'memory-garden'}]},
  ]},
  {name:'Audio Tools',icon:'help',children:[{name:'Narrator',icon:'narrator'},{name:'SoundCraft',icon:'help'},{name:'Audio Editor',icon:'help'}]},
  {name:'System Tools',icon:'help',children:[{name:'Files',icon:reference.icons.files},{name:'Calculator',icon:'calculator'},{name:'Voice input',icon:'microphone',action:()=>voiceControl?.activate()},{name:'Keyboard lock',icon:'keyboard',action:()=>{setScreenKeyboardEnabled(!onScreenKeyboardEnabled);feedback(onScreenKeyboardEnabled?'On-screen keyboard enabled':'On-screen keyboard locked');}},{separator:true},{name:'CodeMirror 6',icon:'help',disabled:true},{name:'OpenCascade.js',icon:'help',disabled:true},{name:'glTF-Transform',icon:'help',disabled:true},{name:'FFmpeg',icon:'help',disabled:true},{name:'WaveSurfer.js',icon:'help',disabled:true},{name:'Tone.js',icon:'help',disabled:true},{name:'zip.js',icon:'help',disabled:true},{name:'Mermaid.js',icon:'help',disabled:true},{name:'Apache ECharts',icon:'help',disabled:true},{name:'Plotly.js',icon:'help',disabled:true},{name:'pdfme',icon:'help',disabled:true},{name:'MapLibre GL JS',icon:'help',disabled:true},{name:'Transformers.js',icon:'help',disabled:true},{name:'Trystero (WebRTC)',icon:'help',disabled:true},{name:'TanStack Virtual',icon:'help',disabled:true},{name:'ONNX Runtime Web',icon:'help',disabled:true},{name:'WebTorrent',icon:'help',disabled:true},{name:'Yjs',icon:'help',disabled:true}]},
  {separator:true},{name:'Help',icon:'help'},{name:'End session',icon:'end-session'}
];
const applicationIds=Object.freeze({'NoteCraft':'notecraft','I-SUCCESS':'i-success','Narrator':'narrator',...Object.fromEntries(Object.entries({...drakonApps,...learningGames}).map(([id,name])=>[name,id])),'Linux X11':'linux-x11','MathCraft':'mathcraft','Weather':'weather','Weather Maps':'weather-maps','Microduck':'microduck','Falling Blocks (preview)':'falling-blocks','Owl Companion (preview)':'owl-companion','Physics Playground (preview)':'physics-playground','Snake Garden (preview)':'snake-garden','Clockwork Room (preview)':'clockwork-room','Chess Study (preview)':'chess-study','Solitaire (preview)':'solitaire','Sky Courier (preview)':'sky-courier','Marble Works (preview)':'marble-works','Stack & Balance (preview)':'stack-balance','Crystal Defense (preview)':'crystal-defense','Drone Circuit (preview)':'drone-circuit','Reactive Control Desk (preview)':'reactive-control-desk','Story Cards (preview)':'story-cards','Expression Puppet (preview)':'expression-puppet','Rhythm Garden (preview)':'rhythm-garden','Lantern Leap (preview)':'lantern-leap','Garden Defense (preview)':'garden-defense','Pocket Rally (preview)':'pocket-rally','Sling Targets (preview)':'sling-targets','Gravity Pinball (preview)':'gravity-pinball','Kinetic Relay (preview)':'kinetic-relay','Tabletop Bot Arena (preview)':'tabletop-bot-arena','Pocket Golf (preview)':'pocket-golf','Target Garden (preview)':'target-garden','Orbital Courier (preview)':'orbital-courier','Clockwork Quest (preview)':'clockwork-quest','Memory Garden (preview)':'memory-garden','Browser (in development)':'browser','Terminal':'terminal','Files':'files','Text Editor':'text','Document Editor':'document-editor','Spreadsheet':'spreadsheet','Data Explorer (Perspective)':'data-explorer','Audio Editor':'audio-editor','G-code Preview':'gcode-preview','Excalidraw':'excalidraw','SVG-edit':'svg-editor','diagrams.net':'diagrams-net','Python Notebook — Browser':'notebook','Arduino Simulator':'arduino-simulator','Pico Simulator':'pico-simulator','Circuit Simulator':'circuitjs','jSketcher':'jsketcher','Electronics Design':'electronics-design','Digital Logic':'digital-logic','Embroidery Studio':'embroidery-studio','Stitch Converter':'stitch-converter','Replicad':'replicad','Kiri:Moto':'kiri-moto','Mesh:Tool':'mesh-tool','PDF Viewer':'pdf-viewer','Image Editor':'image-editor','Calculator':'calculator','Help':'help','WordCraft':'wordcraft','PdfCraft':'pdfcraft','GridCraft':'gridcraft','DeckCraft':'deckcraft','PhotoCraft':'photocraft','VectorCraft':'vectorcraft','DesignCraft':'designcraft','FigCraft':'figcraft','AniCraft':'anicraft','LightCraft':'lightcraft','FilmCraft':'filmcraft','EffectCraft':'effectcraft','SoundCraft':'soundcraft','CADCraft':'cadcraft','SolidCraft':'solidcraft','PCBCraft':'pcbcraft','FieldCraft':'fieldcraft','SketchCraft':'sketchcraft','TextureCraft':'texturecraft','MaterialCraft':'materialcraft'});
// Presentation only: menu dispatch, persisted IDs, and app-owned titles stay unchanged.
// Each entry lists the existing menu name, the user-facing name, and former title aliases.
function menuDisabledTitle(entry){if(entry.disabled)return entry.disabledTitle||'Background tool available to applications';if((applicationIds[entry.name]&&!enabledApp(applicationIds[entry.name]))||(entry.name==='Voice input'&&!viewerProfile.speech))return 'Not enabled in this test release';return null;}

const applicationDisplayNames=Object.freeze({notecraft:['NoteCraft','NoteCraft'],'i-success':['I-SUCCESS','I-SUCCESS'],narrator:['Narrator','Narrator'],...Object.fromEntries(Object.entries(drakonApps).map(([id,name])=>[id,[name,name]])),'linux-x11':['Linux X11','Linux X11'],mathcraft:['MathCraft','MathCraft'],
  weather:['Weather','Weather'], 'weather-maps':['Weather Maps','Weather Maps'],
  text:['Text Editor','Text Editor (CodeMirror 6)'],
  'document-editor':['Document Editor','Document Editor (Tiptap)'],
  spreadsheet:['Spreadsheet','Spreadsheet (Jspreadsheet CE + SheetJS CE)'],
  'data-explorer':['Data Explorer (Perspective)','Data Explorer (Perspective + DuckDB)','Data Explorer'],
  'pdf-viewer':['PDF Viewer','PDF Viewer (PDF.js)'],
  notebook:['Python Notebook — Browser','Python Notebook (JupyterLite + Pyodide)','Python Notebook'],
  'arduino-simulator':['Arduino Simulator','Arduino Simulator (AVR8js)'],
  'pico-simulator':['Pico Simulator','Pico Simulator (RP2040js)'],
  circuitjs:['Circuit Simulator','Circuit Simulator (CircuitJS)'],
  jsketcher:['jSketcher','CAD Modeler (JSketcher inspired)'],
  'electronics-design':['Electronics Design','Electronics Design (designElectronics)'],
  'digital-logic':['Digital Logic','Digital Logic Simulator (DigitalJS)'],
  'embroidery-studio':['Embroidery Studio','Embroidery Studio (StitchFoundry)'],
  'stitch-converter':['Stitch Converter','Stitch Converter (tsembroidery)'],
  'image-editor':['Image Editor','Image Editor (Filerobot)'],
  'diagrams-net':['diagrams.net','Diagram Editor (diagrams.net)'],
  excalidraw:['Excalidraw','Sketch Board (Excalidraw)'],
  'svg-editor':['SVG-edit','Vector Editor (SVG-Edit)','SVG-Edit'],
  'kiri-moto':['Kiri:Moto','Fabrication Studio (Kiri:Moto)'],
  'mesh-tool':['Mesh:Tool','Mesh Editor (Mesh:Tool)'],
  'gcode-preview':['G-code Preview','G-code Viewer (G-code Preview)'],
  replicad:['Replicad','Primitive 3D Modeler (Replicad)'],
  'audio-editor':['Audio Editor','Audio Editor (AudioMass)']
});
const applicationMenuLabels=new Map(Object.values(applicationDisplayNames).map(([menu,label])=>[menu,label]));
// Bind labels only to the static catalog entries, never similarly named personal apps.
const applicationMenuNames=new WeakMap();
for(const group of desktopMenu)for(const entry of group.children||[])if(applicationMenuLabels.has(entry.name))applicationMenuNames.set(entry,applicationMenuLabels.get(entry.name));
function applicationName(app,fallback=app){return applicationDisplayNames[app]?.[1]||fallback;}
function displayedWindowTitle(w){
  const entry=applicationDisplayNames[w.app];if(!entry)return w.title;
  const [menu,label,...aliases]=entry,oldNames=[menu,label,...aliases];
  if(oldNames.includes(w.title))return label;
  for(const name of oldNames){const suffix=' — '+name;if(w.title.endsWith(suffix))return w.title.slice(0,-suffix.length)+' — '+label;}
  return w.title+' — '+label;
}
function initialWindows(){return [];}
const windowRect=w=>({x:w.x,y:w.y,w:w.w,h:w.h});
const compactDesktop=width=>width<=720||(matchMedia('(pointer:coarse)').matches&&width<1024);
const wideEngineeringApps=new Set(['microduck','electronics-design','circuitjs','jsketcher','digital-logic','arduino-simulator','pico-simulator','replicad','kiri-moto','mesh-tool','gcode-preview']);
function windowHasChanges(w){return !!(w.microduck?.dirty||w.calculator?.saving||w.editor?.dirty||w.imageEditor?.dirty||w.documentEditor?.dirty||w.dataExplorer?.dirty||w.spreadsheet?.dirty||(w.audioEditor?.dirty||w.audioEditor?.hasChanges?.())||w.fallingBlocks?.dirty||w.owlCompanion?.dirty||w.physicsPlayground?.dirty||w.snakeGarden?.dirty||w.clockworkRoom?.dirty||w.chessStudy?.dirty||w.solitaire?.dirty||w.skyCourier?.dirty||w.marbleWorks?.dirty||w.stackBalance?.dirty||w.crystalDefense?.dirty||w.droneCircuit?.dirty||w.reactiveControlDesk?.dirty||w.storyCards?.dirty||w.expressionPuppet?.dirty||w.rhythmGarden?.dirty||w.lanternLeap?.dirty||w.gardenDefense?.dirty||w.pocketRally?.dirty||w.slingTargets?.dirty||w.gravityPinball?.dirty||w.kineticRelay?.dirty||w.tabletopBotArena?.dirty||w.pocketGolf?.dirty||w.targetGarden?.dirty||w.orbitalCourier?.dirty||w.clockworkQuest?.dirty||w.memoryGarden?.dirty||w.replicad?.dirty||w.gridTools?.dirty||w.logic?.dirty||w.jsketcher?.hasChanges?.()||w.circuitjs?.hasChanges?.()||w.electronicsDesign?.dirty||w.arduinoSketch?.dirty||w.arduinoSimulator?.saving||w.picoSimulator?.hasChanges?.()||w.stitchConverter?.dirty||w.embroideryStudio?.dirty||w.excalidraw?.dirty||w.svgEditor?.dirty||w.diagramsNet?.dirty||w.notebook?.dirty||w.browserDownloadState?.dirty);}

class Desktop {
  constructor(parent, config, label, state) {
    this.baseConfig = {...config};this.config={...config}; this.windows = state?.windows || initialWindows(); this.current=state?.current || 0;this.active=state?.active ?? null;
    this.initialPins=state?.pins ?? null;this.menuPath=[]; this.menu=state?.menu || null; this.nextId=Math.max(10,...this.windows.map(w=>w.id))+1;
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
  saveLayout(){const owner=signedInSubject();if(!owner||this.layoutOwner!==owner)return true;try{const windows=this.windows.filter(w=>accountWindow(w)&&!w.previewBytes&&!isAccountApp(w.app)&&w.launchContext?.storage!=='guest').slice(0,64).map(w=>{const saved=w.documentEditor||w.spreadsheet||w.editor||w.imageEditor||w.audioEditor||w.excalidraw||w.svgEditor||w.diagramsNet||w.replicad||w.logic||w.jsketcher||w.circuitjs||w.electronicsDesign||w.arduinoSimulator||w.picoSimulator||w.stitchConverter||w.embroideryStudio||w.notebook;const path=saved?.version&&typeof saved.path==='string'?saved.path:w.launchContext?.path,rect=w.desktopRect||windowRect(w),restore=w.desktopRect?w.desktopRestore:w.restore;return {id:w.id,app:w.app,title:w.title,workspace:w.workspace,x:rect.x,y:rect.y,w:rect.w,h:rect.h,minimized:!!w.minimized,rolled:!!w.rolled,restore:restore||undefined,tileSide:w.tileSide||undefined,tileSlot:Number.isInteger(w.tileSlot)?w.tileSlot:undefined,path,storage:w.launchContext?.storage,sha256:w.launchContext?.sha256,textDraftId:w.app==='text'?w.textDraftId:undefined,wordcraftDraftId:w.app==='wordcraft'?w.wordcraftDraftId:undefined,pdfcraftDraftId:w.app==='pdfcraft'?w.pdfcraftDraftId:undefined,gridcraftDraftId:w.app==='gridcraft'?w.gridcraftDraftId:undefined,deckcraftDraftId:w.app==='deckcraft'?w.deckcraftDraftId:undefined,wordcraftRecoveryAsCopy:w.app==='wordcraft'&&w.wordcraftRecoveryAsCopy?true:undefined,pdfcraftRecoveryAsCopy:w.app==='pdfcraft'&&w.pdfcraftRecoveryAsCopy?true:undefined,gridcraftRecoveryAsCopy:w.app==='gridcraft'&&w.gridcraftRecoveryAsCopy?true:undefined,deckcraftRecoveryAsCopy:w.app==='deckcraft'&&w.deckcraftRecoveryAsCopy?true:undefined,...(layerAccountApps.includes(w.app)?{[w.app+'DraftId']:w[w.app+'DraftId'],[w.app+'RecoveryAsCopy']:w[w.app+'RecoveryAsCopy']===true||undefined}:{})};});localStorage.setItem(this.layoutKey(owner),JSON.stringify({version:1,current:this.current,active:this.active,windows}));return true;}catch(error){console.warn('Could not save window layout:',error.message);return false;}}
  restoreLayout(){const owner=signedInSubject();if(!owner||this.layoutOwner===owner)return;this.layoutOwner=owner;this.windows=[];this.current=0;this.active=null;try{const raw=localStorage.getItem(this.layoutKey(owner));if(!raw||raw.length>65536)return;const data=JSON.parse(raw),allowed=new Set([...(enabledApp('notecraft')?['notecraft']:[]),...(enabledApp('i-success')?['i-success']:[]),...(enabledApp('narrator')?['narrator']:[]),...Object.keys(drakonApps).filter(enabledApp),...Object.keys(learningGames).filter(enabledApp),...(enabledApp('mathcraft')?['mathcraft']:[]),'weather','weather-maps','wordcraft','pdfcraft','gridcraft','deckcraft',...layerAccountApps.filter(enabledApp),'microduck','terminal','files','browser','text','document-editor','spreadsheet','data-explorer','pdf-viewer','image-editor','calculator','help','audio-editor','gcode-preview','kiri-moto','mesh-tool','excalidraw','svg-editor','replicad','diagrams-net','notebook','arduino-simulator','pico-simulator','circuitjs','jsketcher','electronics-design','digital-logic','embroidery-studio','stitch-converter','falling-blocks','owl-companion','physics-playground','snake-garden','clockwork-room','chess-study','solitaire','sky-courier','marble-works','stack-balance','crystal-defense','drone-circuit','reactive-control-desk','story-cards','expression-puppet','rhythm-garden','lantern-leap','garden-defense','pocket-rally','sling-targets','gravity-pinball','kinetic-relay','tabletop-bot-arena','pocket-golf','target-garden','orbital-courier','clockwork-quest','memory-garden']);if(data?.version!==1||!Array.isArray(data.windows)||data.windows.length>64)return;const seen=new Set();for(const v of data.windows){if(!v||!allowed.has(v.app)||!Number.isSafeInteger(v.id)||v.id<1||seen.has(v.id)||![v.x,v.y,v.w,v.h,v.workspace].every(Number.isFinite))continue;seen.add(v.id);const win={id:v.id,app:v.app,title:typeof v.title==='string'?v.title.slice(0,256):v.app,workspace:Math.max(0,Math.min(2,Math.floor(v.workspace))),x:v.x,y:v.y,w:Math.max(300,Math.min(4000,v.w)),h:Math.max(150,Math.min(4000,v.h)),minimized:!!v.minimized,rolled:!!v.rolled};if(v.tileSide==='left'||v.tileSide==='right')win.tileSide=v.tileSide;if(Number.isInteger(v.tileSlot)&&v.tileSlot>=0&&v.tileSlot<4){win.tileSlot=v.tileSlot;delete win.tileSide;}if(v.restore&&[v.restore.x,v.restore.y,v.restore.w,v.restore.h].every(Number.isFinite)&&v.restore.w>0&&v.restore.h>0)win.restore={x:v.restore.x,y:v.restore.y,w:Math.min(4000,v.restore.w),h:Math.min(4000,v.restore.h)};if(v.storage==='account'&&typeof v.path==='string'&&!v.path.startsWith('/')&&v.path.length<=2048){win.launchContext=Object.freeze({version:1,storage:'account',path:v.path,sha256:v.sha256,owner,...(Object.hasOwn(accountDocumentNames,v.app)?{restore:true}:{})});win.ownerSub=owner;}else if(typeof v.path==='string'&&v.path.startsWith('/')&&v.path.length<=2048){win.launchContext=Object.freeze({version:1,storage:'mirror',path:v.path,owner,...(['notebook','replicad','embroidery-studio'].includes(v.app)&&/^[0-9a-f]{64}$/.test(v.sha256)?{sha256:v.sha256}:{})});win.ownerSub=owner;}if(v.app==='text'&&typeof v.textDraftId==='string'&&/^[0-9a-f-]{36}$/.test(v.textDraftId))win.textDraftId=v.textDraftId;if(v.app==='wordcraft'&&typeof v.wordcraftDraftId==='string'&&/^[0-9a-f-]{36}$/.test(v.wordcraftDraftId))win.wordcraftDraftId=v.wordcraftDraftId;if(v.app==='pdfcraft'&&typeof v.pdfcraftDraftId==='string'&&/^[0-9a-f-]{36}$/.test(v.pdfcraftDraftId))win.pdfcraftDraftId=v.pdfcraftDraftId;if(v.app==='gridcraft'&&typeof v.gridcraftDraftId==='string'&&/^[0-9a-f-]{36}$/.test(v.gridcraftDraftId))win.gridcraftDraftId=v.gridcraftDraftId;if(v.app==='gridcraft'&&v.gridcraftRecoveryAsCopy===true)win.gridcraftRecoveryAsCopy=true;if(v.app==='deckcraft'&&typeof v.deckcraftDraftId==='string'&&/^[0-9a-f-]{36}$/.test(v.deckcraftDraftId))win.deckcraftDraftId=v.deckcraftDraftId;if(v.app==='deckcraft'&&v.deckcraftRecoveryAsCopy===true)win.deckcraftRecoveryAsCopy=true;if(layerAccountApps.includes(v.app)){const draft=v.app+'DraftId',copy=v.app+'RecoveryAsCopy';if(typeof v[draft]==='string'&&/^[0-9a-f-]{36}$/.test(v[draft]))win[draft]=v[draft];if(v[copy]===true)win[copy]=true;}if(v.app==='wordcraft'&&v.wordcraftRecoveryAsCopy===true)win.wordcraftRecoveryAsCopy=true;if(v.app==='pdfcraft'&&v.pdfcraftRecoveryAsCopy===true)win.pdfcraftRecoveryAsCopy=true;this.windows.push(win);}this.current=Math.max(0,Math.min(2,Math.floor(data.current)||0));this.active=seen.has(data.active)?data.active:null;this.nextId=Math.max(10,...seen)+1;}catch(error){console.warn('Could not restore window layout:',error.message);}}
  get pins(){return (panelPins?.pins(this.current)??this.initialPins??defaultPanelPins).filter(availableApplication);}
  panelWidth(){return this.mobile?52:72;}
  workWidth(){return Math.max(1,this.viewport.clientWidth-this.panelWidth());}
  largeWorkspace(){return this.viewport.clientWidth>1920&&this.viewport.clientHeight>1080;}
  scale() {
    const width=this.viewport.clientWidth,height=this.viewport.clientHeight;
    if(compactDesktop(width)!==this.mobile){this.render();return;}
    resolution=[width,height];this.scaleFactor=1;
    this.root.style.width=width+'px';this.root.style.height=height+'px';this.root.style.transform='none';
    this.spacer.style.width=width+'px';this.spacer.style.height=height+'px';
    for(const w of this.windows){this.fitWindow(w);const el=this.root.querySelector('[data-window="'+w.id+'"]');if(el)Object.assign(el.style,{left:w.x+'px',top:w.y+'px',width:w.w+'px',height:(w.rolled?this.config.titleHeight:w.h)+'px'});}
    this.root.querySelectorAll('.mini-window').forEach(el=>{const w=this.windows.find(w=>w.id===Number(el.dataset.windowId));if(w)Object.assign(el.style,{left:100*w.x/this.workWidth()+'%',top:100*w.y/height+'%',width:100*w.w/this.workWidth()+'%',height:100*w.h/height+'%'});});
    this.root.querySelectorAll('.popup').forEach(p=>this.positionPopup(p,parseFloat(p.style.left)||0,parseFloat(p.style.top)||0));
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
    const width=this.workWidth(),height=this.viewport.clientHeight,top=0;
    if(this.mobile){
      if(!w.mobileRect){if(!w.desktopRect){w.desktopRect=windowRect(w);w.desktopRestore=w.restore;}const stagger=(this.windows.filter(n=>n.workspace===w.workspace).indexOf(w)%4)*24;w.mobileRect={x:8,y:top+8+stagger,w:Math.max(1,width-16),h:Math.min(w.h,Math.max(150,height-top-24-stagger))};if(!w.restore)w.restore={...w.mobileRect};}
      const rect=w.restore?{x:0,y:top,w:width,h:height-top}:w.mobileRect;
      Object.assign(w,rect);w.w=Math.min(w.w,width);w.h=Math.min(w.h,Math.max(this.config.titleHeight,height-top));
    }
    else if(w.restore){Object.assign(w,{x:0,y:top,w:width,h:Math.max(1,height-top)});}
    else if(Number.isInteger(w.tileSlot)){const right=w.tileSlot%2===1,split=Math.floor(width/2),quarter=this.largeWorkspace(),middle=Math.floor(height/2),bottom=quarter&&w.tileSlot>=2;Object.assign(w,{x:right?split:0,y:bottom?middle:top,w:right?width-split:split,h:quarter?(bottom?height-middle:middle):height});}
    else if(w.tileSide){const split=Math.floor(width/2),wideEditor=w.app==='electronics-design'&&this.largeWorkspace()&&split<1850&&width>=1850;Object.assign(w,{x:wideEditor?0:w.tileSide==='left'?0:split,y:top,w:wideEditor?width:w.tileSide==='left'?split:width-split,h:Math.max(1,height-top)});}
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
    const vars={'panel-height':c.panelHeight,'panel-width':this.panelWidth(),'icon-size':c.iconSize,'panel-font':c.panelFontSize,
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
      win.querySelector('.caption-text').textContent=displayedWindowTitle(w);win.setAttribute('aria-label',displayedWindowTitle(w));
      const roll=win.querySelector('.window-controls button');roll.setAttribute('aria-label',w.rolled?'Unroll':'Roll up');roll.title=w.rolled?'Unroll':'Roll up';
      roll.querySelector('path').setAttribute('d',w.rolled?'M5 9 L12 16 L19 9':'M5 16 L12 9 L19 16');
    }
    this.scale();
    if(this.menu&&!keepMenu)this.showMenu(this.applicationItems(),0,0,0);
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
    const apps=button('Applications',()=>{const open=this.menu;this.closePopups();if(!open){this.menu=true;this.showMenu(this.applicationItems(),0,0,0);} },'app-menu-button');
    apps.textContent='APPs';p.append(apps);
    const tasks=make('div','tasks');
    const appIds=[...new Set([...this.pins,...this.windows.filter(w=>w.workspace===this.current&&accountWindow(w)).map(w=>w.app)])];
    for(const app of appIds) {
      const windows=this.windows.filter(w=>w.app===app&&w.workspace===this.current&&accountWindow(w));
      const active=windows.some(w=>w.id===this.active&&w.workspace===this.current&&!w.minimized);
      const label=accountApp(app)?.name||applicationName(app);
      const b=button(label+' windows',e=> {
        this.closePopups();
        if(e.shiftKey||e.ctrlKey||e.metaKey||!windows.length){this.launch(app);return;}
        this.showTasks(app,windows,b);
      },'task'+(windows.length?' running':'')+(active?' active':''));
      b.dataset.app=app;b.append(icon(app));b.disabled=!enabledApp(app);
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
    const clock=button('Date and time',()=>{const open=this.root.querySelector('.status-popup[data-status-type="clock"]');this.closePopups();if(!open)this.showStatus('clock',clock);},'clock');
    clock.textContent=compactDate(new Date());p.append(clock);
    const account=button('Session: '+sessionName(),()=>{this.closePopups();this.showStatus('account',account);},'account');
    const symbol=make('span','account-symbol','●');symbol.setAttribute('aria-hidden','true');account.append(symbol,make('span','account-label',sessionName()));account.title=sessionName();p.append(account);this.root.append(p);
  }
  showMenu(items,depth,x,y) {
    this.menuLevels??=[];this.menuLevels[depth]=items;this.menuLevels.length=depth+1;
    this.root.querySelectorAll('.menu-pane').forEach(p=>{if(this.mobile||Number(p.dataset.depth)>=depth)p.remove();});
    const pane=make('div','menu-pane popup');pane.dataset.depth=depth;pane.setAttribute('role','menu');
    pane.style.left='0px';pane.style.top=y+'px';pane.style.maxHeight=(resolution[1]-y-10)+'px';
    if(this.mobile&&depth>0){const back=textButton('‹ Back',()=>this.showMenu(this.menuLevels[depth-1],depth-1,8,0),'menu-row');pane.append(back);}
    for(const entry of items) {
      if(entry.separator){pane.append(make('div','menu-separator'));continue;}
      const displayName=applicationMenuNames.get(entry)||entry.name;
      const row=button(displayName,null,'menu-row');row.setAttribute('role','menuitem');const disabledTitle=menuDisabledTitle(entry);if(disabledTitle){row.disabled=true;row.title=disabledTitle;}
      const arrow=make('span','arrow',entry.children?'‹':'');arrow.setAttribute('aria-hidden','true');
      row.append(arrow,icon(entry.icon,!!reference.icons[entry.icon]||String(entry.icon||'').includes('/')),make('span','row-text',displayName));
      const open=()=>{
        pane.querySelectorAll('.selected').forEach(n=>n.classList.remove('selected'));row.classList.add('selected');
        if(entry.children){
          const r=row.getBoundingClientRect(),base=this.root.getBoundingClientRect();
          const nx=(r.left-base.left)/this.scaleFactor,ny=(r.top-base.top)/this.scaleFactor;
          this.showMenu(entry.children,depth+1,nx,ny);
        } else this.root.querySelectorAll('.menu-pane').forEach(n=>{if(Number(n.dataset.depth)>depth)n.remove();});
      };
      if(entry.children){row.setAttribute('aria-haspopup','menu');row.addEventListener('pointerenter',e=>{if(!this.mobile&&e.pointerType!=='touch')open();});}
      row.addEventListener('click',()=>{if(entry.children){open();return;}this.closePopups();this.launchEntry(entry);});
      row.addEventListener('keydown',e=>{if((e.key==='ArrowLeft'||e.key==='ArrowRight')&&entry.children){e.preventDefault();open();$('.menu-pane[data-depth="'+(depth+1)+'"] button',this.root)?.focus();}});
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
    const app=applicationIds[name];
    if(!app)return;
    this.launch(app);
  }
  activateWindow(w){
    if(!accountWindow(w)){feedback('Sign in to the app owner’s account.');return;}
    this.workspaceFocus??=new Map();if(this.active!==null)this.workspaceFocus.set(this.current,this.active);
    w.minimized=false;this.current=w.workspace;this.active=w.id;this.workspaceFocus.set(w.workspace,w.id);this.closePopups();this.render();
  }
  open(app,context){
    const keys=context&&Object.keys(context).sort().join(',');
    const revisionApp=['calculator','jsketcher','notebook','image-editor','svg-editor','excalidraw','diagrams-net','replicad','embroidery-studio','arduino-simulator','digital-logic','circuitjs','electronics-design','kiri-moto','mesh-tool'].includes(app);
    const temporaryFile=revisionApp&&context?.storage==='temporary'&&currentSession?.public.kind==='anonymous';
    const hasSelectedRevision=revisionApp&&(context?.storage==='mirror'||temporaryFile)&&keys==='owner,path,sha256,storage,version'&&typeof context.sha256==='string'&&/^[a-f0-9]{64}$/.test(context.sha256);
    if(!['calculator','microduck','text','image-editor','document-editor','pdf-viewer','spreadsheet','data-explorer','audio-editor','gcode-preview','mesh-tool','kiri-moto','excalidraw','svg-editor','replicad','digital-logic','circuitjs','jsketcher','electronics-design','arduino-simulator','pico-simulator','stitch-converter','embroidery-studio','diagrams-net','notebook','falling-blocks','owl-companion','physics-playground','snake-garden','clockwork-room','chess-study','solitaire','sky-courier','marble-works','stack-balance','crystal-defense','drone-circuit','reactive-control-desk','story-cards','expression-puppet','rhythm-garden','lantern-leap','garden-defense','pocket-rally','sling-targets','gravity-pinball','kinetic-relay','tabletop-bot-arena','pocket-golf','target-garden','orbital-courier','clockwork-quest','memory-garden'].includes(app)||!context||(keys!=='owner,path,storage,version'&&!hasSelectedRevision)||context.version!==1||(app==='calculator'&&!hasSelectedRevision)||(context.storage!=='mirror'&&!(temporaryFile&&hasSelectedRevision)&&!(context.storage==='guest'&&app==='text'))||typeof context.path!=='string'||context.path.length>2048||typeof context.owner!=='string')throw Error('Unsupported document launch context');
    const fileOwner=temporaryFile?workspaceOwner():signedInSubject();
    if(!fileOwner||context.owner!==fileOwner)throw Error('The selected file belongs to a different session.');
    if(revisionApp&&(!context.path.startsWith('/')||context.path.slice(1).split('/').some(part=>!part||part==='.'||part==='..'||/[\\\0]/.test(part))))throw Error('Invalid project path.');
    const launchContext=Object.freeze({version:1,storage:context.storage,path:context.path,owner:context.owner,...(hasSelectedRevision?{sha256:context.sha256}:{})});
    const found=this.windows.find(w=>w.app===app&&w.ownerSub===context.owner&&(w.spreadsheet?.path||w.documentEditor?.path||w.editor?.path||w.audioEditor?.path||w.replicad?.path||w.logic?.path||w.jsketcher?.path||w.circuitjs?.path||w.electronicsDesign?.path||w.arduinoSimulator?.path||w.picoSimulator?.path||w.stitchConverter?.path||w.embroideryStudio?.path||w.launchContext?.path)===context.path);
    if(found){this.activateWindow(found);return found;}
    const title=app==='calculator'?'Calculator':app==='microduck'?'Microduck':app==='falling-blocks'?'Falling Blocks':app==='owl-companion'?'Owl Companion':app==='physics-playground'?'Physics Playground':app==='snake-garden'?'Snake Garden':app==='clockwork-room'?'Clockwork Room':app==='chess-study'?'Chess Study':app==='solitaire'?'Solitaire':app==='sky-courier'?'Sky Courier':app==='marble-works'?'Marble Works':app==='stack-balance'?'Stack & Balance':app==='crystal-defense'?'Crystal Defense':app==='drone-circuit'?'Drone Circuit':app==='reactive-control-desk'?'Reactive Control Desk':app==='story-cards'?'Story Cards':app==='expression-puppet'?'Expression Puppet':app==='rhythm-garden'?'Rhythm Garden':app==='lantern-leap'?'Lantern Leap':app==='garden-defense'?'Garden Defense':app==='pocket-rally'?'Pocket Rally':app==='sling-targets'?'Sling Targets':app==='gravity-pinball'?'Gravity Pinball':app==='kinetic-relay'?'Kinetic Relay':app==='tabletop-bot-arena'?'Tabletop Bot Arena':app==='pocket-golf'?'Pocket Golf':app==='target-garden'?'Target Garden':app==='orbital-courier'?'Orbital Courier':app==='clockwork-quest'?'Clockwork Quest':app==='memory-garden'?'Memory Garden':app==='text'?'Text Editor':app==='document-editor'?'Document Editor':app==='pdf-viewer'?'PDF Viewer':app==='spreadsheet'?'Spreadsheet':app==='data-explorer'?'Data Explorer':app==='audio-editor'?'Audio Editor':app==='gcode-preview'?'G-code Preview':app==='mesh-tool'?'Mesh:Tool':app==='excalidraw'?'Excalidraw':app==='svg-editor'?'SVG-edit':app==='replicad'?'Replicad':app==='digital-logic'?'Digital Logic':app==='jsketcher'?'jSketcher':app==='circuitjs'?'Circuit Simulator':app==='electronics-design'?'Electronics Design':app==='arduino-simulator'?'Arduino Simulator':app==='pico-simulator'?'Pico Simulator':app==='stitch-converter'?'Stitch Converter':app==='embroidery-studio'?'Embroidery Studio':app==='diagrams-net'?'diagrams.net':app==='notebook'?'Python Notebook':'Image Editor';
    const w=this.launch(app,context.path.split('/').pop()+' — '+title);
    w.launchContext=launchContext;w.ownerSub=context.owner;this.render();return w;
  }
  updateAccountFileBinding(w,resource){
    if(!this.windows.includes(w)||!Object.hasOwn(accountDocumentNames,w.app)||!workspaceOwner()||resource.owner!==workspaceOwner())throw Error('Current document window/account required.');
    const path=resource.path,sha256=resource.sha256;
    if(path===null){if(sha256!==null)throw Error('Untitled document cannot have a saved revision.');delete w.launchContext;}
    else{
      if(typeof path!=='string'||path.length>2048||path.startsWith('/')||path.endsWith('/')||path.split('/').some(p=>!p||p==='.'||p==='..'||/[\0\\]/.test(p))||!/^[0-9a-f]{64}$/.test(sha256))throw Error('Confirmed canonical document file binding required.');
      w.launchContext=Object.freeze({version:1,storage:'account',path,sha256,owner:resource.owner});
    }
    w.ownerSub=resource.owner;w.title=(path===null?'Untitled':path.split('/').pop())+' — '+accountDocumentNames[w.app];
    const win=this.root.querySelector('[data-window="'+w.id+'"]');
    if(win){win.querySelector('.caption-text').textContent=displayedWindowTitle(w);win.setAttribute('aria-label',displayedWindowTitle(w));}
    if(!this.saveLayout())feedback('Your file is saved, but this browser could not remember its window.');
  }
  activateTextFile(resource){return this.activateAccountFile(resource,'text');}
  accountFileLocation(resource,app=null,exclude=null){
    if(!workspaceOwner()||resource.owner!==workspaceOwner()||typeof resource.path!=='string'||resource.path.length>2048||resource.path.startsWith('/')||resource.path.endsWith('/')||resource.path.split('/').some(p=>!p||p==='.'||p==='..'||/[\0\\]/.test(p)))throw Error('Current canonical account file required.');
    for(const desktop of new Set([this,...surfaces.values()])){
      const w=desktop.windows.find(w=>w!==exclude&&Object.hasOwn(accountDocumentNames,w.app)&&(!app||w.app===app)&&w.ownerSub===resource.owner&&w.launchContext?.storage==='account'&&w.launchContext.owner===resource.owner&&w.launchContext.path===resource.path);
      if(w)return {desktop,w};
    }
    return null;
  }
  activateAccountFile(resource,app=null){
    const location=this.accountFileLocation(resource,app);
    if(!location)return null;
    const {desktop,w}=location;
    w.rolled=false;w.focusWhenReady=true;desktop.activateWindow(w);
    const view=desktop.root.querySelector('[data-window="'+w.id+'"]')?.appView;
    if(view?.focus){w.focusWhenReady=false;view.focus();}
    return w;
  }
  openAccountFile(app,resource){
    if(!Object.hasOwn(accountDocumentNames,app)||!enabledApp(app)||!workspaceOwner()||resource.owner!==workspaceOwner()||typeof resource.path!=='string'||resource.path.startsWith('/')||resource.path.split('/').some(p=>!p||p==='.'||p==='..')||!/^[0-9a-f]{64}$/.test(resource.sha256))throw Error('An exact account file is required.');
    const existing=this.activateAccountFile(resource);if(existing)return existing;
    const w=this.launch(app,resource.path.split('/').pop()+' — '+accountDocumentNames[app]);
    w.launchContext=Object.freeze({version:1,storage:'account',path:resource.path,sha256:resource.sha256,owner:resource.owner});w.ownerSub=resource.owner;this.saveLayout();return w;
  }
  openPdfPreview(owner,bytes,name){
    if(!signedInSubject()||owner!==signedInSubject()||!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>128*1024*1024)throw Error('Cannot open this PDF preview.');
    const w=this.launch('pdf-viewer',(name.split('/').pop()||'Document')+' — Print preview');
    w.ownerSub=owner;w.previewBytes=new Uint8Array(bytes);this.render();return w;
  }
  launch(app,title) {
    if(!enabledApp(app)){feedback('This app is not enabled in this test release.');return null;}
    const personal=accountApp(app);
    if(isAccountApp(app)&&!personal){feedback('Sign in to open your apps.');return null;}
    const names={notecraft:'NoteCraft','i-success':'I-SUCCESS',narrator:'Narrator',...drakonApps,...learningGames,mathcraft:'MathCraft',weather:'Weather','weather-maps':'Weather Maps',wordcraft:'WordCraft',pdfcraft:'PdfCraft',gridcraft:'GridCraft',deckcraft:'DeckCraft',photocraft:'PhotoCraft',vectorcraft:'VectorCraft',figcraft:'FigCraft',anicraft:'AniCraft',lightcraft:'LightCraft',designcraft:'DesignCraft',soundcraft:'SoundCraft',filmcraft:'FilmCraft',effectcraft:'EffectCraft',cadcraft:'CADCraft',texturecraft:'TextureCraft',materialcraft:'MaterialCraft',sketchcraft:'SketchCraft',solidcraft:'SolidCraft',pcbcraft:'PCBCraft',fieldcraft:'FieldCraft',microduck:'Microduck','falling-blocks':'Falling Blocks (preview)','owl-companion':'Owl Companion (preview)','physics-playground':'Physics Playground (preview)','snake-garden':'Snake Garden (preview)','clockwork-room':'Clockwork Room (preview)','chess-study':'Chess Study (preview)',solitaire:'Solitaire (preview)','sky-courier':'Sky Courier (preview)','marble-works':'Marble Works (preview)','stack-balance':'Stack & Balance (preview)','crystal-defense':'Crystal Defense (preview)','drone-circuit':'Drone Circuit (preview)','reactive-control-desk':'Reactive Control Desk (preview)','story-cards':'Story Cards (preview)','expression-puppet':'Expression Puppet (preview)','rhythm-garden':'Rhythm Garden (preview)','lantern-leap':'Lantern Leap (preview)','garden-defense':'Garden Defense (preview)','pocket-rally':'Pocket Rally (preview)','sling-targets':'Sling Targets (preview)','gravity-pinball':'Gravity Pinball (preview)','kinetic-relay':'Kinetic Relay (preview)','tabletop-bot-arena':'Tabletop Bot Arena (preview)','pocket-golf':'Pocket Golf (preview)','target-garden':'Target Garden (preview)','orbital-courier':'Orbital Courier (preview)','clockwork-quest':'Clockwork Quest (preview)','memory-garden':'Memory Garden (preview)',browser:'Browser',terminal:'Terminal — guest',files:'Home — Files',text:'Untitled — Text Editor','document-editor':'Untitled — Document Editor','pdf-viewer':'PDF Viewer',spreadsheet:'Untitled — Spreadsheet','data-explorer':'Data Explorer','audio-editor':'Audio Editor','gcode-preview':'G-code Preview','excalidraw':'Excalidraw','svg-editor':'SVG-edit','diagrams-net':'diagrams.net',notebook:'Python Notebook','arduino-simulator':'Arduino Simulator','pico-simulator':'Pico Simulator','circuitjs':'Circuit Simulator','jsketcher':'jSketcher','electronics-design':'Electronics Design','digital-logic':'Digital Logic','embroidery-studio':'Embroidery Studio','stitch-converter':'Stitch Converter',replicad:'Replicad','kiri-moto':'Kiri:Moto','mesh-tool':'Mesh:Tool','image-editor':'Image Editor',calculator:'Calculator',help:'Desktop help'};
    const offset=(this.nextId%5)*35;
    const side=this.windows.filter(n=>n.workspace===this.current&&!n.minimized&&n.tileSide).length%2?'right':'left';
    const w={id:this.nextId++,app,title:title||personal?.name||names[app]||app,workspace:this.current,x:170+offset,y:80+offset,w:820,h:540};
    if(this.largeWorkspace()&&!wideEngineeringApps.has(app)){const used=new Set(this.windows.filter(n=>n.workspace===this.current&&!n.minimized&&Number.isInteger(n.tileSlot)).map(n=>n.tileSlot));w.tileSlot=[0,1,2,3].find(slot=>!used.has(slot))??this.nextId%4;}else w.tileSide=side;
    if(personal)w.ownerSub=personal.ownerSub;
    this.windows.push(w);this.active=w.id;this.closePopups();this.render();return w;
  }
  showTasks(app,windows,anchor) {
    const popup=make('div','task-popup popup');
    popup.style.top=this.localTop(anchor)+'px';popup.style.left=this.localLeft(anchor)+'px';
    const name=accountApp(app)?.name||applicationDisplayNames[app]?.[1]||desktopMenu.find(entry=>({'Microduck':'microduck','Falling Blocks (preview)':'falling-blocks','Owl Companion (preview)':'owl-companion','Physics Playground (preview)':'physics-playground','Snake Garden (preview)':'snake-garden','Clockwork Room (preview)':'clockwork-room','Chess Study (preview)':'chess-study','Solitaire (preview)':'solitaire','Sky Courier (preview)':'sky-courier','Marble Works (preview)':'marble-works','Stack & Balance (preview)':'stack-balance','Crystal Defense (preview)':'crystal-defense','Drone Circuit (preview)':'drone-circuit','Reactive Control Desk (preview)':'reactive-control-desk','Story Cards (preview)':'story-cards','Expression Puppet (preview)':'expression-puppet','Rhythm Garden (preview)':'rhythm-garden','Lantern Leap (preview)':'lantern-leap','Garden Defense (preview)':'garden-defense','Pocket Rally (preview)':'pocket-rally','Sling Targets (preview)':'sling-targets','Gravity Pinball (preview)':'gravity-pinball','Kinetic Relay (preview)':'kinetic-relay','Tabletop Bot Arena (preview)':'tabletop-bot-arena','Pocket Golf (preview)':'pocket-golf','Target Garden (preview)':'target-garden','Orbital Courier (preview)':'orbital-courier','Clockwork Quest (preview)':'clockwork-quest','Memory Garden (preview)':'memory-garden','Browser (in development)':'browser','Terminal':'terminal','Files':'files','Text Editor':'text','Document Editor':'document-editor','Spreadsheet':'spreadsheet','Data Explorer (Perspective)':'data-explorer','Audio Editor':'audio-editor','G-code Preview':'gcode-preview','Excalidraw':'excalidraw','SVG-edit':'svg-editor','diagrams.net':'diagrams-net','Python Notebook — Browser':'notebook','Arduino Simulator':'arduino-simulator','Pico Simulator':'pico-simulator','Circuit Simulator':'circuitjs','jSketcher':'jsketcher','Electronics Design':'electronics-design','Digital Logic':'digital-logic','Embroidery Studio':'embroidery-studio','Stitch Converter':'stitch-converter','Replicad':'replicad','Kiri:Moto':'kiri-moto','Mesh:Tool':'mesh-tool','PDF Viewer':'pdf-viewer','Image Editor':'image-editor','Calculator':'calculator','Help':'help'}[entry.name])===app)?.name||app;
    popup.append(textButton('New '+name+' window',()=>this.launch(app),'new-window'));
    for(const [index,w] of windows.entries()) {
      const label=displayedWindowTitle(w)+' · '+(index+1)+' · Workspace '+(w.workspace+1)+(w.minimized?' · minimized':w.id===this.active?' · active':'');
      const b=button('Switch to '+label,()=>this.activateWindow(w));b.dataset.windowId=String(w.id);
      const preview=make('div','task-preview');preview.append(make('div'),document.createTextNode(label));b.append(preview,document.createTextNode(label));popup.append(b);
    }
    popup.append(textButton(this.pins.includes(app)?'Unpin from panel':'Pin to panel',()=>{
      const pinned=!this.pins.includes(app),workspace=this.current;
      this.closePopups();
      void panelPins?.setPinned(workspace,app,pinned).catch(error=>feedback('Could not update the app bar. '+error.message));
    },'pin'));this.root.append(popup);this.popupBackdrop();this.positionPopup(popup,this.localLeft(anchor),this.localTop(anchor));
  }
  positionPopup(popup,x,y){
    const width=this.workWidth(),height=this.viewport.clientHeight,gap=this.mobile?8:4;
    popup.style.maxWidth=Math.max(1,width-gap*2)+'px';
    if(this.mobile)popup.style.width=Math.max(1,width-gap*2)+'px';
    popup.style.maxHeight=Math.max(1,height-gap*2)+'px';
    if(popup.classList.contains('menu-pane')&&Number(popup.dataset.depth)===0){x=width-popup.offsetWidth-gap;y=height-popup.offsetHeight-gap;}
    else if(popup.classList.contains('menu-pane')&&!this.mobile){const prior=this.root.querySelector('.menu-pane[data-depth="'+(Number(popup.dataset.depth)-1)+'"]');if(prior)x=prior.offsetLeft-popup.offsetWidth+1;}
    else if(!popup.classList.contains('menu-pane'))x=width-popup.offsetWidth-gap;
    const left=Math.max(gap,Math.min(x,width-popup.offsetWidth-gap));
    const top=Math.max(gap,Math.min(y,height-popup.offsetHeight-gap));
    popup.style.left=left+'px';popup.style.top=top+'px';
  }
  localLeft(anchor) { if(!anchor)return 20;return Math.max(0,Math.min(resolution[0]-305,(anchor.getBoundingClientRect().left-this.root.getBoundingClientRect().left)/this.scaleFactor)); }
  localTop(anchor) {return anchor?(anchor.getBoundingClientRect().top-this.root.getBoundingClientRect().top)/this.scaleFactor:0;}
  appendNetworkInfo(popup){
    const session=currentSession;
    const status=make('p','','Guest networking: loopback only. Try ping -c 2 localhost.');
    popup.append(make('h4','','Network'),make('div','status-line','Browser: '+(navigator.onLine?'online':'offline')),status);
    guestNetworkAuthority(session)?.status().then(expires=>{
      if(expires&&currentSession===session&&status.isConnected)status.textContent='Guest networking is available for this account.';
    }).catch(()=>{});
  }
  showStatus(type,anchor) {
    const popup=make('div','status-popup popup');popup.dataset.statusType=type;popup.style.top=this.localTop(anchor)+'px';
    popup.style.left=this.localLeft(anchor)+'px';
    const title={workspaces:'Workspaces',volume:'Volume',clock:'Date & time',account:sessionName()};
    popup.append(make('h3','',title[type]));
    if(type==='workspaces') {
      const grid=make('div','workspace-switcher');grid.setAttribute('aria-label','Choose workspace');
      for(let i=0;i<this.config.workspaceCount;i++){
        const b=button('Workspace '+(i+1),()=>this.switchWorkspace(i),'workspace-choice'+(this.current===i?' selected':''));b.setAttribute('aria-pressed',String(this.current===i));
        this.windows.filter(w=>w.workspace===i&&!w.minimized&&accountWindow(w)).forEach(w=>{const m=make('span','mini-window');m.dataset.windowId=w.id;m.style.cssText='left:'+100*w.x/this.workWidth()+'%;top:'+100*w.y/resolution[1]+'%;width:'+100*w.w/this.workWidth()+'%;height:'+100*w.h/resolution[1]+'%;';b.append(m);});
        b.append(make('span','workspace-number',String(i+1)));grid.append(b);
      }
      popup.append(grid);
    }
    else if(type==='volume'){popup.append(make('p','','No desktop audio apps are running. Browser audio is managed by your device.'));}
    else if(type==='clock'){
      const now=new Date();
      popup.append(make('div','status-line clock-date',now.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'})),make('div','status-line clock-time',now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'})));
    }
    else {
      popup.append(make('div','status-line',currentSession?.public.kind==='registered'?'Signed in':'Guest session'));
      if(currentSession?.public.kind==='registered'){popup.append(textButton('Sign out',async()=>{if(accountTransition)return;try{await endSession();}catch(error){feedback(error.message);}}));if(identityConfig?.browserRelay)popup.append(textButton('Browser licenses & source',showBrowserSources));}
      else if(identityConfig?.identity.mode==='server'&&identityConfig.accounts?.actions?.includes('signin')){
        popup.append(make('p','',"This service is only for David's KSU friends and family. Anyone else using it is violating the terms of service. This restriction is not currently enforced."));
        const actions=make('div','account-actions');
        for(const [mode,label] of [['register','Register'],['signin','Sign in']]){const b=textButton(label,()=>this.showAccountForm(mode,anchor));b.dataset.accountAction=mode;b.disabled=accountTransition;actions.append(b);}popup.append(actions);
      }else popup.append(make('p','','Accounts are unavailable in this preview.'));
      this.appendNetworkInfo(popup);popup.append(textButton('Device storage',()=>this.showDeviceStorage(anchor)));if(currentSession)popup.append(textButton('End session',()=>endSession()));
    }
    if(type!=='workspaces')popup.append(textButton('Close',()=>this.closePopups()));this.root.append(popup);this.popupBackdrop();this.positionPopup(popup,this.localLeft(anchor),this.localTop(anchor));
  }
  showAccountForm(mode,anchor){
    this.closePopups();
    const popup=make('div','status-popup account-popup popup'),form=make('form','account-form');
    popup.dataset.statusType='account';popup.setAttribute('aria-label',mode==='register'?'Register account':'Sign in');
    popup.append(make('h3','',mode==='register'?'Register':'Sign in'),make('p','',mode==='register'?'Register to keep your temporary files in your new account.':guestPromotion?'Sign in to the account you just created to finish transferring your temporary files. Signing in to another account discards them.':'Signing in opens your existing account and discards your temporary guest files.'));
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
    popup.append(form);this.root.append(popup);applyScreenKeyboardPolicy(form);this.popupBackdrop();this.positionPopup(popup,this.localLeft(anchor),this.localTop(anchor));
  }
  async showDeviceStorage(anchor){
    this.closePopups();const popup=make('div','status-popup popup'),status=make('p','','Checking browser storage…');popup.setAttribute('aria-label','Device storage');
    popup.append(make('h3','','Device storage'),make('p','','Keep downloaded app code, Linux boot files and voice models on this device. This does not save your running Linux session, unsaved documents, passwords or private server files.'),status);
    const keep=textButton('Keep loaded app files on this device',async()=>{
      keep.disabled=true;status.textContent='Requesting storage and caching files already loaded by this tab…';
      try{const module=await deviceCacheModule,result=await module.keepLoadedAppFiles();if(popup.isConnected)status.textContent=result.items+' app files cached ('+Math.round(result.bytes/1048576)+' MiB). '+(result.persistent?'The browser granted persistent storage.':'The browser did not grant persistent storage; cached files may be evicted.')+' Clearing site data removes them. Server files are unaffected.';}
      catch(error){if(popup.isConnected)status.textContent='Could not finish caching: '+error.message+'. The server remains available as the normal source.';}finally{keep.disabled=false;}
    });popup.append(keep,textButton('Close',()=>this.closePopups()));this.root.append(popup);this.popupBackdrop();this.positionPopup(popup,this.localLeft(anchor),this.localTop(anchor));
    try{const info=await (await deviceCacheModule).deviceStorageInfo();if(popup.isConnected)status.textContent='This domain uses approximately '+Math.round((info.usage||0)/1048576)+' MiB of the browser’s estimated '+Math.round((info.quota||0)/1048576)+' MiB allowance. '+(info.persistent?'Storage is persistent.':'Storage is currently best effort.')+(info.updateWaiting?' An app update will activate after existing tabs close.':'');}catch(error){if(popup.isConnected)status.textContent=error.message;}
  }
  async requestWindowClose(w) {
    const appView=this.root.querySelector(`[data-window="${w.id}"]`)?.appView;
    if(typeof appView?.requestClose==='function'){if(w.closePending)return;w.closePending=true;try{if(await appView.requestClose({scope:'window'})!==true)return;if(appView.lifecycle?.commitClose)await appView.lifecycle.commitClose();}catch(error){feedback(error.message);return;}finally{w.closePending=false;}}
    // The mounted operation owns local commit/acknowledgement, not the app's
    // dirty flag or peer-derived busy state. Forced disposal remains separate.
    const pendingLocalWrite=()=>{
      const operations=this.root.querySelector(`[data-window="${w.id}"]`)?.appView?.documentOperations;
      const operation=operations?.state;
      if(operation?.phase==='local-write'&&operation.kind!==null&&!operation.disposed){feedback('Wait for the file to finish saving on this device before closing.');return true;}
      return false;
    };
    if(pendingLocalWrite())return;
    const dirty=()=>windowHasChanges(w);
    const close=()=>{if(!this.windows.includes(w)||pendingLocalWrite())return;if(w.app==='terminal')closeTerminal(w.id);if(w.previewBytes)w.previewBytes.fill(0);this.windows=this.windows.filter(n=>n.id!==w.id);if(this.active===w.id)this.active=null;this.render();};
    if(!dirty()){close();return;}
    if(w.closeDialog?.isConnected)return;
    const dialog=document.createElement('dialog');dialog.className='codi-confirm-dialog';dialog.setAttribute('aria-labelledby','codi-close-title-'+w.id);dialog.setAttribute('aria-describedby','codi-close-message-'+w.id);
    const title=make('h2','','Unsaved changes');title.id='codi-close-title-'+w.id;
    const message=make('p','',w.microduck?.dirty?'Close '+w.title+'? The live simulation state is not fully saved and will end.':'Close '+w.title+' and discard its unsaved changes?');message.id='codi-close-message-'+w.id;
    const controls=make('div','codi-confirm-actions');
    const finish=discard=>{if(!dialog.isConnected)return;dialog.close();dialog.remove();delete w.closeDialog;if(discard)close();else this.root.querySelector(`[data-window="${w.id}"] [aria-label="Close"]`)?.focus();};
    controls.append(textButton('Keep editing',()=>finish(false)),textButton('Discard changes',()=>finish(true),'codi-confirm-danger'));dialog.append(title,message,controls);document.body.append(dialog);w.closeDialog=dialog;
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});dialog.showModal();controls.firstElementChild.focus();
  }
  renderWindow(w) {
    this.fitWindow(w);
    const win=make('section','window'+(this.active===w.id?' focused':'')+(w.rolled?' rolled':''));
    win.dataset.window=w.id;win.setAttribute('aria-label',displayedWindowTitle(w));win.style.left=w.x+'px';win.style.top=w.y+'px';
    win.style.width=w.w+'px';win.style.height=(w.rolled?this.config.titleHeight+reference.frameBorderBottom:w.h)+'px';
    win.addEventListener('pointerdown',()=>{if(this.active!==w.id){this.active=w.id;this.root.querySelectorAll('.window.focused').forEach(n=>n.classList.remove('focused'));win.classList.add('focused');this.root.querySelectorAll('.task').forEach(n=>{const active=n.dataset.app===w.app;n.classList.toggle('active',active);n.setAttribute('aria-pressed',String(active));});}});
    const caption=make('div','window-caption');caption.append(icon(w.app),make('span','caption-text',displayedWindowTitle(w)));
    const controls=make('div','window-controls');
    const actions=[
      [w.rolled?'Unroll':'Roll up',w.rolled?'M5 9 L12 16 L19 9':'M5 16 L12 9 L19 16',()=>{w.rolled=!w.rolled;}],
      ['Minimize','M4 19 H20',()=>{w.minimized=true;this.active=null;}],
      ['Maximize','M5 5 H19 V19 H5 Z',()=>{if(w.restore){Object.assign(w,w.restore);delete w.restore;}else{w.restore={x:w.x,y:w.y,w:w.w,h:w.h};Object.assign(w,{x:0,y:0,w:this.workWidth(),h:resolution[1]});}}],
      ['Close','M5 5 L19 19 M19 5 L5 19',()=>{this.requestWindowClose(w);return false;}]
    ];
    actions.forEach(([name,path,action])=>{
      const b=button(name,()=>{if(action()===false)return;if(this.mobile)w.mobileRect=windowRect(w);this.closePopups();this.render();});b.title=name;
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
        if(!this.mobile&&(Math.abs(dx)>1||Math.abs(dy)>1)){delete w.tileSide;delete w.tileSlot;delete w.restore;}
        if(resize){w.w=Math.min(this.workWidth()-w.x,Math.max(Math.min(340,this.workWidth()),start.ww+dx));w.h=Math.min(resolution[1]-w.y,Math.max(this.config.titleHeight+90,start.wh+dy));win.style.width=w.w+'px';win.style.height=w.h+'px';}
        else{w.x=Math.max(0,Math.min(Math.max(0,this.workWidth()-w.w),start.wx+dx));w.y=Math.max(0,Math.min(resolution[1]-this.config.titleHeight,start.wy+dy));win.style.left=w.x+'px';win.style.top=w.y+'px';}
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
if(viewerProfile.speech)initializeVoiceControl();
// Mounted views report actual unsaved/pending work synchronously. Draft
// checkpoints run while editing; an unload handler is only a warning gate.
window.addEventListener('beforeunload',event=>{
  if(guestPromotion && temporaryWorkspaces.has(currentSession)){event.preventDefault();event.returnValue='';return;}
  for(const desktop of surfaces.values())for(const win of desktop.root.querySelectorAll('.window')){
    const life=win.appView?.lifecycle;if(!life)continue;
    try{const state=life.snapshot();if(!state.dirty&&!state.pending)continue;}catch{}
    event.preventDefault();event.returnValue='';return;
  }
});
window.addEventListener('pagehide',()=>{closeBrowserSourcePages();for(const surface of surfaces.values())surface.saveLayout();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)for(const surface of surfaces.values())surface.saveLayout();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')for(const desktop of surfaces.values())desktop.closePopups();});
function initializeVoiceControl(){
  const dock=make('div','voice-control');dock.id='voice-control';
  const note=make('span','voice-note','Select a text field, then tap the microphone.');note.setAttribute('role','status');note.setAttribute('aria-live','polite');
  const microphone='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>';
  const stopIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor"/></svg>';
  const mic=button('Start voice input',null,'voice-button');mic.title='Tap to start voice input';mic.innerHTML=microphone;
  dock.hidden=true;
  const dismiss=button('Hide voice input',()=>hideVoice(),'voice-dismiss');dismiss.textContent='×';dismiss.title='Hide voice input';
  dock.append(note,mic,dismiss);document.body.append(dock);
  let lastInput=null,activeJob=null,phase='',speech,busy=false,noticeTimer;
  const editable=el=>el?.nodeType===1&&!el.disabled&&!el.readOnly&&
    (el.matches('textarea,input:not([type]),input[type=text i],input[type=search i],input[type=url i],input[type=email i],input[type=tel i]')||el.isContentEditable);
  const ranges=new WeakMap(), observedDocuments=new WeakSet();
  function remember(el,win){
    if(!win)return;
    if(lastInput?.el!==el||lastInput?.win!==win)lastInput={el,win};
    if(editable(el)&&el.ownerDocument===document)applyScreenKeyboardPolicy(el);
  }
  function observeInputs(doc,ownerWindow){
    if(!doc||observedDocuments.has(doc))return;
    observedDocuments.add(doc);
    const owner=el=>ownerWindow||el?.closest?.('.window,dialog,[role=dialog]')||
      (el?.matches?.('input,textarea,[contenteditable]')?el.closest('#previews'):null);
    function track(event){
      const path=event.composedPath(), el=path[0];
      if(path.includes(dock))return;
      const win=owner(el)||path.find(node=>node?.matches?.('.window'));
      if(!win)return;
      const target=path.find(node=>node?.matches?.('[data-serial-view],[data-webos-voice-target],input,textarea,[contenteditable]'));
      if(target&&!target.matches('[data-serial-view],[data-webos-voice-target]')&&!editable(target)){remember(null,win);return;}
      if(target)remember(target,win);
      else if(lastInput?.win!==win||el?.matches?.('input,textarea,select,[contenteditable=false]'))remember(null,win);
    }
    doc.addEventListener('focusin',track,true);
    doc.addEventListener('pointerdown',track,true);
    doc.addEventListener('selectionchange',()=>{
      const sel=doc.getSelection(),el=lastInput?.el;
      if(el?.isContentEditable&&sel?.rangeCount&&el.contains(sel.anchorNode)&&el.contains(sel.focusNode))ranges.set(el,sel.getRangeAt(0).cloneRange());
    });
    function observeFrame(frame){
      const win=owner(frame);
      if(!win)return;
      if(frame.matches('[data-webos-voice-target]')){
        for(const event of ['pointerdown','focusin'])frame.contentDocument?.addEventListener(event,()=>remember(frame,win),true);
      }else if(frame.contentDocument)observeInputs(frame.contentDocument,win);
    }
    doc.addEventListener('load',e=>{if(e.target?.localName==='iframe')observeFrame(e.target);},true);
    doc.querySelectorAll('iframe').forEach(observeFrame);
  }
  observeInputs(document,null);
  const inputObserver=new MutationObserver(records=>{
    // A modal makes controls outside it inert. Keep the microphone usable
    // while an app asks the user to type a filename or another value.
    if(!dock.isConnected||records.some(record=>record.attributeName==='open'||[...record.addedNodes].some(node=>node.matches?.('dialog[open]')))){
      const container=document.querySelector('#previews dialog:modal')||document.body;
      if(dock.parentNode!==container){container.append(dock);position();}
    }
    if(lastInput&&(!lastInput.win.isConnected||!lastInput.el?.isConnected))lastInput=null;
    for(const record of records)for(const node of record.addedNodes)if(node instanceof HTMLElement)applyScreenKeyboardPolicy(node);
  });
  inputObserver.observe(document.querySelector('#previews'),{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
  setScreenKeyboardEnabled(true);
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
  async function loadSpeech(){
    speech ??= await import(new URL('assets/speech/client.mjs',document.baseURI));
    return speech;
  }
  function insertWithFocus(input,edit){
    let previous=document.activeElement;
    while(previous?.localName==='iframe'&&previous.contentDocument?.activeElement)previous=previous.contentDocument.activeElement;
    const selection=previous?.isContentEditable?previous.ownerDocument.getSelection():null;
    const previousRange=selection?.rangeCount&&previous.contains(selection.anchorNode)&&previous.contains(selection.focusNode)
      ?selection.getRangeAt(0).cloneRange():null;
    try{
      input.focus({preventScroll:true});
      edit();
    }finally{
      if(previous!==input&&previous?.isConnected){
        previous.focus({preventScroll:true});
        if(previousRange&&previous.contains(previousRange.commonAncestorContainer)){
          selection.removeAllRanges();selection.addRange(previousRange);
        }
      }
    }
  }
  function destination(selected){
    if(!selected)return null;
    const {el:input,win}=selected;
    if(!input?.isConnected||!win.isConnected||win.hidden||!input.getClientRects().length||input.closest('[inert],[hidden]'))return null;
    if(typeof input.codiVoiceCapture==='function')return input.codiVoiceCapture();
    if(input.matches('.terminal-input,[data-serial-view]')){
      const vm=v86Instance;if(guestState!=='ready'||!vm)return null;
      const id=Number(win.dataset.window),session=terminalSessions.get(id);
      return {element:input,valid:()=>v86Instance===vm&&guestState==='ready'&&terminalSessions.get(id)===session&&!session?.exited,insert:text=>{win.querySelector('[data-serial-view]')?.followOutput?.();insertTerminalText(id,text);}};
    }
    if(!editable(input))return null;
    if(input.isContentEditable){
      const doc=input.ownerDocument,selection=doc.getSelection();
      const range=selection?.rangeCount&&input.contains(selection.anchorNode)&&input.contains(selection.focusNode)?selection.getRangeAt(0).cloneRange():ranges.get(input)?.cloneRange();
      if(!range)return null;
      const before=input.textContent;
      return {element:input,valid:()=>input.textContent===before&&input.contains(range.commonAncestorContainer),insert:text=>{
        insertWithFocus(input,()=>{
          selection.removeAllRanges();selection.addRange(range);
          if(!doc.execCommand('insertText',false,text))throw Error('The selected editor could not insert the transcript.');
        });
      }};
    }
    const before=input.value,start=input.selectionStart,end=input.selectionEnd;
    return {element:input,valid:()=>editable(input)&&input.value===before&&input.selectionStart===start&&input.selectionEnd===end,insert:text=>{
      if(start===null){
        insertWithFocus(input,()=>{
          if(!input.ownerDocument.execCommand('insertText',false,text))throw Error('The selected field could not insert the transcript.');
        });
      }else{
        input.setRangeText(text,start,end,'end');
        input.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertText',data:text}));
      }
    }};
  }
  async function begin(){
    if(activeJob)return;
    const selected=lastInput,target=destination(selected);if(!target){message('Click a text field or terminal, then tap the microphone.');return;}
    // Focus tracking chooses the next recording. This one retains its own target.
    const token={window:selected.win,session:currentSession};activeJob=token;delete mic.dataset.error;
    try{
      const module=await loadSpeech();if(activeJob!==token||currentSession!==token.session)return;
      const valid=()=>activeJob===token&&currentSession===token.session&&token.window.isConnected&&target.element.isConnected&&target.valid();
      let delivery,deliveryError;
      await module.toggleVoice({terminal:target.element,status,sessionValid:valid,insert:text=>{
        if(valid())delivery=Promise.resolve(target.insert(text)).catch(error=>{deliveryError=error;});
      }});
      await delivery;
      if(deliveryError)throw deliveryError;
      if(activeJob===token&&!delivery&&!valid())message('The selected input changed. Voice text was discarded.');

    }catch(error){mic.dataset.error=error.message;status(error.name==='NotAllowedError'?'Allow microphone access, then tap the microphone again.':error.message||'Voice input failed.');}
    finally{if(activeJob===token)activeJob=null;}
  }
  let placement={x:1,y:1},drag=null,ignoreMicClick=false;
  function bounds(){const view=visualViewport,rail=surfaces.get('Desktop')?.panelWidth()||0;return {left:(view?.offsetLeft||0)+8,top:(view?.offsetTop||0)+8,width:Math.max(0,(view?.width||innerWidth)-dock.offsetWidth-rail-16),height:Math.max(0,(view?.height||innerHeight)-dock.offsetHeight-16)};}
  function position(){const box=bounds(),left=box.left+box.width*placement.x,top=box.top+box.height*placement.y;dock.style.left=left+'px';dock.style.top=top+'px';note.style.left=Math.max(box.left-left,Math.min(dock.offsetWidth-note.offsetWidth,box.left+box.width+dock.offsetWidth-left-note.offsetWidth))+'px';note.style.right='auto';const below=top-box.top<note.offsetHeight+8;note.style.top=below?'calc(100% + 8px)':'auto';note.style.bottom=below?'auto':'calc(100% + 8px)';}
  mic.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();ignoreMicClick=false;const rect=dock.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:rect.left,top:rect.top};mic.setPointerCapture(e.pointerId);});
  mic.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!ignoreMicClick&&Math.hypot(dx,dy)<6)return;ignoreMicClick=true;const box=bounds();placement={x:box.width?Math.max(0,Math.min(1,(drag.left+dx-box.left)/box.width)):0,y:box.height?Math.max(0,Math.min(1,(drag.top+dy-box.top)/box.height)):0};position();});
  mic.addEventListener('pointerup',()=>{drag=null;});
  mic.addEventListener('pointercancel',()=>{drag=null;ignoreMicClick=true;});
  mic.addEventListener('lostpointercapture',()=>{drag=null;});
  function activateMicrophone(){
    if(/Listening/.test(phase))speech?.stopVoice();
    else if(activeJob||busy){speech?.cancelVoice();activeJob=null;status('Voice cancelled.');}
    else void begin();
  }
  function hideVoice(){dock.hidden=true;speech?.cancelVoice();activeJob=null;status('');}
  mic.addEventListener('click',()=>{if(ignoreMicClick){ignoreMicClick=false;return;}activateMicrophone();});
  dismiss.addEventListener('pointerdown',event=>event.preventDefault());
  mic.addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('visibilitychange',()=>{if(document.hidden){speech?.cancelVoice();activeJob=null;}});
  document.addEventListener('codi-desktop-blocked',()=>{lastInput=null;speech?.cancelVoice();activeJob=null;});
  voiceControl={activate(){dock.hidden=false;position();activateMicrophone();}};
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
    try{await renewAccountSession(currentSession);}
    catch(error){
      if(error.status!==401)throw error;
      await endSession();
    }
  }finally{renewingIdentity=false;}
}
function loadAccountPanelPins(){
  panelPins.reset(signedInSubject()&&serverFilesAvailable()?serverFileContext:null);
  void panelPins.refresh().catch(error=>feedback('Could not load the app bar. '+error.message));
}
async function initializeSession(){
  const response=await fetch('config.json',{cache:'no-store'});
  if(!response.ok)throw Error('Identity configuration could not be loaded.');
  identityConfig=await response.json();
  const [services,panel]=await Promise.all([import('./assets/desktop/account-services.mjs'),import('./assets/desktop/panel-pins.mjs')]);
  accountServices=services;
  defaultPanelPins=panel.defaultPanelPins;
  panelPins=panel.createPanelPins(()=>{for(const surface of surfaces.values())surface.render();});
  desktopAgentOperations=null;
  if(identityConfig.agentOperations?.version==='webos-agent-operations/1'){
    const {createDesktopAgentOperations}=await import('./assets/desktop/agent-operations.mjs');
    desktopAgentOperations=createDesktopAgentOperations({
      owner(){
        const session=currentSession, client=sessionAccounts.get(session);
        if(!client||sessionEnding||accountTransition||signedInSubject()!==session.public.sub)throw Error('Account operation authority unavailable.');
        const authority=client.createOperationAuthority();
        return {...authority,check(){authority.check();if(currentSession!==session||sessionEnding||accountTransition||
          signedInSubject()!==authority.accountId)throw Error('Account changed.');}};
      },
      confirm:confirmDesktop,thumbprint:accountServices.thumbprint
    });
  }
  const session=await restoreOrStartGuestSession();
  sessionViews(session);
  currentSession=session;
  loadAccountPanelPins();
  // This release uses the shared server-authoritative account file service.
  document.documentElement.classList.remove('login-required');
  if(identityConfig.identity.mode==='server')identityTimer=setInterval(maintainIdentity,30000);
  for(const surface of surfaces.values()){surface.restoreLayout();surface.render();}
  if (session.public.kind === 'anonymous') {
    const desktop = surfaces.get('Desktop');
    if (desktop && enabledApp('weather-maps')) {
      const win = desktop.launch('weather-maps');
      if (win) {
        win.restore = {x:win.x, y:win.y, w:win.w, h:win.h};
        Object.assign(win, {x:0,y:0,w:desktop.workWidth(),h:resolution[1]});
        desktop.render();
      }
    }
    if(!desktopLifecycle)void startSessionLifecycle(session,identityConfig);
    return;
  }
  void accountServices.restoreTextRecovery({desktops:[...surfaces.values()],accountId:session.public.sub,valid:()=>currentSession===session&&signedInSubject()===session.public.sub});
  void accountServices.restoreWordcraftRecovery({desktops:[...surfaces.values()],accountId:session.public.sub,valid:()=>currentSession===session&&signedInSubject()===session.public.sub});
  void accountServices.restorePdfcraftRecovery({desktops:[...surfaces.values()],accountId:session.public.sub,valid:()=>currentSession===session&&signedInSubject()===session.public.sub});
  if(enabledApp('gridcraft'))void accountServices.restoreGridcraftRecovery({desktops:[...surfaces.values()],accountId:session.public.sub,valid:()=>currentSession===session&&signedInSubject()===session.public.sub});
  if(enabledApp('deckcraft'))void accountServices.restoreDeckcraftRecovery({desktops:[...surfaces.values()],accountId:session.public.sub,valid:()=>currentSession===session&&signedInSubject()===session.public.sub});
  for(const app of layerAccountApps){
    if(!enabledApp(app))continue;
    const restore=accountServices['restore'+app[0].toUpperCase()+app.slice(1)+'Recovery'];
    void restore({desktops:[...surfaces.values()],accountId:session.public.sub,valid:()=>currentSession===session&&signedInSubject()===session.public.sub});
  }
  refreshTerminals();
  if(identityConfig.desktopLifecycle)void startSessionLifecycle(session,identityConfig);
}
async function startSessionLifecycle(session,config){
  // A temporary asset failure after successful sign-in must not discard the
  // authenticated session or make the user enter their password again.
  for(let attempt=0;currentSession===session;attempt++){
    try{
      const suffix=attempt?'?retry='+attempt:'';
      const {startLifecycle}=await import('./assets/desktop/lifecycle.mjs'+suffix);
      if(currentSession!==session)return;
      bootRecovery?.stop();bootRecovery=null;
      desktopLifecycle=startLifecycle({config,roots:()=>[document.querySelector('#previews'),document.querySelector('#voice-control')],recoverSession:recoverDesktopSession});
      return;
    }catch(error){
      if(currentSession!==session)return;
      console.warn('Desktop connection monitoring is retrying:',error.message);
      await new Promise(resolve=>setTimeout(resolve,Math.min(30000,1000*2**Math.min(attempt,5))));
    }
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
async function accountSession(mode,username,password,client=accountServices.createAccountsClient({persistSession:true})){
  if(currentSession?.public.kind==='registered')throw Error('End the current account session before signing in again.');
  if(!['register','signin'].includes(mode))throw Error('Choose sign in or register.');
  const state=await client.authenticate({mode,username,password});
  return accountSessionProjection(client,state);
}
async function accountSessionProjection(client,state){
  const authority=client.createFileAuthority();
  const session={public:{sid:state.sessionId,sub:state.accountId,name:state.displayName,kind:'registered',key:authority.publicKey},
    trust:{level:state.trust},fingerprint:await accountServices.thumbprint(authority.publicKey)};
  Object.defineProperty(session.trust,'claims',{get(){const current=client.inspect();return {sub:current.accountId,exp:current.expiresAt};}});
  sessionAccounts.set(session,client);return session;
}
async function restoreOrStartGuestSession(){
  const client=accountServices.createAccountsClient({persistSession:true});
  const restored=await client.restore();
  if(restored)return accountSessionProjection(client,restored);
  const retention=client.inspect().retention;
  if(retention==='expired'||retention==='invalid')feedback('Your remembered sign-in expired. Use the Anon menu to sign in again.');
  const id=crypto.randomUUID();
  return {public:{sid:id,sub:'anon:'+id,name:'Anon',kind:'anonymous'},trust:{level:'local'}};
}
let guestPromotion = null;
async function changeAccount(mode,username='',password='',stillWanted=()=>true){
  if(accountTransition||sessionEnding)throw Error('An account change is already in progress.');
  accountTransition=true;let approved, pausedGuest, thawGuest, transferringWorkspace;
  const resumeFileWriters=[];
  try{
    const prior=currentSession;approved=prior?await confirmSessionEnd():{initial:[],tracker:trackSessionEdits()};
    if(!approved||currentSession!==prior)return;
    if(prior?.public.kind==='anonymous' && mode==='register' && v86Instance && guestState!=='ready')
      throw Error('Wait for Terminal to finish starting before transferring guest files.');
    const next=await accountSession(mode,username,password);
    if(mode==='register' && prior?.public.kind==='anonymous') guestPromotion={guest:prior,subject:next.public.sub};
    if(!stillWanted()||currentSession!==prior||(approved.tracker.changed()||!sameDirtyWindows(approved.initial,sessionDirtyWindows()))){await logoutAccountSession(next).catch(()=>{});if(stillWanted())feedback('Work changed while signing in. Review it and try again.');return;}
    try{await approved.tracker.quiesce();}catch(error){await logoutAccountSession(next).catch(()=>{});feedback(error.message||'Could not pause Text.');return;}
    if(!stillWanted()||currentSession!==prior||approved.tracker.changed()){await logoutAccountSession(next).catch(()=>{});feedback('Work changed while preparing to sign in.');return;}
    const previous=currentSession;
    for(const surface of surfaces.values())if(!surface.saveLayout()){await logoutAccountSession(next).catch(()=>{});feedback('Could not save your window layout. Your current session is still open.');return;}
    for(const surface of surfaces.values())surface.root.inert=true;
    if(guestPromotion?.guest===previous && guestPromotion.subject===next.public.sub && temporaryWorkspaces.has(previous)){
      try{
        if (v86Instance) {
          pausedGuest=v86Instance;
          await pausedGuest.request('pauseGuest');
          await guestAccountDevice?.flush();
        }
        const guest = temporaryWorkspaces.get(previous);
        transferringWorkspace=guest;
        guest.transferring=true;
        for (const pause of guest.writers) resumeFileWriters.push(await pause());
        thawGuest = guest.freeze();
        const files=new accountServices.UserFiles(sessionAccounts.get(next).createFileAuthority());
        await promoteGuestHome(guest.files,files);
        if(!stillWanted()||currentSession!==previous||approved.tracker.changed())throw Error('The workspace changed during the transfer.');
      }catch(error){
        await logoutAccountSession(next).catch(()=>{});
        throw Error('Your account was created. Your guest files are still here. Sign in to that account to retry. '+error.message);
      }
    }
    if(previous){try{await logoutAccountSession(previous);}catch(error){await logoutAccountSession(next).catch(()=>{});feedback('Could not confirm sign-out. The server may have ended your session; recover your work or try again.');return;}}
    if((approved.tracker.changed()||!sameDirtyWindows(approved.initial,sessionDirtyWindows()))){await logoutAccountSession(next).catch(()=>{});feedback('Work changed during sign-out. Your previous server session may have ended; recover your work.');return;}
    try{for(const surface of surfaces.values())for(const win of surface.root.querySelectorAll('.window'))disposeSessionView(win,'Account changing');}
    catch(error){console.warn('Account-change cleanup failed:',error);await logoutAccountSession(next).catch(()=>{});feedback('The previous server session ended, but window cleanup was incomplete. Some windows may have closed; copy remaining work before reloading. The next session may still be active.');return;}
    if(previous&&(previous.public?.sub!==next.public?.sub||guestNetworkAdapter)){
      stopGuest();
      guestPromotion=null;
      for(const id of terminalSessions.keys())closeTerminal(id);
    }
    // Let abort handlers terminate their workers before installing the next session.
    closeAccountMirror({suspend:true});await Promise.resolve();closeBrowserSourcePages();currentSession=sessionViews(next);
    startMirror();
    loadAccountPanelPins();
    // This release uses the shared server-authoritative account file service.
    for(const surface of surfaces.values()){surface.closePopups();surface.restoreLayout();surface.render();}
    if(v86Instance&&guestFiles.ready)v86Instance.create_file('/session.json',new TextEncoder().encode(JSON.stringify({sessionId:next.id,kind:next.kind,displayName:next.displayName}))).catch(()=>{});
    feedback(mode==='anonymous'?'Signed out. Continuing as Anon.':'Signed in as '+next.displayName+'.');
  }finally{
    thawGuest?.();
    if(transferringWorkspace)transferringWorkspace.transferring=false;
    for(const resume of resumeFileWriters.reverse()){
      try{await resume();}catch(error){feedback(error.message);}
    }
    if(pausedGuest && pausedGuest===v86Instance)await pausedGuest.request('resumeGuest').catch(error=>feedback(error.message));approved?.tracker.dispose();for(const surface of surfaces.values())surface.root.inert=false;accountTransition=false;}
}
async function maintainIdentity(){
  if(!currentSession||renewingIdentity||accountTransition)return;
  const session=currentSession;
  const expiry=session.trust.claims?.exp;
  if(!expiry||expiry-Date.now()/1000>180)return;
  renewingIdentity=true;
  try{
    await renewAccountSession(session);
  }catch(error){
    if(currentSession===session){
      const expired=expiry<=Date.now()/1000;
      feedback('Identity renewal failed: '+error.message);
      if(expired)guestNetworkAdapter?.destroy();
    }
  }finally{renewingIdentity=false;for(const surface of surfaces.values())if(surface.appIdentity!==signedInSubject())surface.render();}
}
let bootEpoch=0;
let bootFailed=false;
let guestBootRequest=null;
let guestBootTimer=null;
function useAccountGuestHome(){
  return viewerProfile.accountGuestHome===true&&(currentSession?.public.kind==='anonymous'||serverFilesAvailable()&&!!signedInSubject());
}
function guestNetworkAuthority(session){
  if(!identityConfig?.guestNetwork||currentSession!==session||!signedInSubject())return null;
  try{return sessionAccounts.get(session)?.createGuestNetworkAuthority()??null;}
  catch{return null;}
}
async function prepareGuestNetwork(signal){
  const session=currentSession,authority=guestNetworkAuthority(session);
  if(!authority)return null;
  try{
    if(!await authority.status({signal})||currentSession!==session)return null;
    const {connectGuestNetwork}=await import('./assets/desktop/guest-network.mjs');
    signal?.throwIfAborted();
    if(currentSession!==session)return null;
    return (emulator,onStatus)=>connectGuestNetwork(emulator,authority,{signal,onStatus});
  }catch(error){
    if(signal?.aborted)throw error;
    if(currentSession===session)feedback('Guest networking is unavailable. You can still use Linux locally.');
    return null;
  }
}
function stopGuest(){
  ++bootEpoch;
  guestBootRequest?.abort();
  guestBootRequest=null;
  clearTimeout(guestBootTimer);
  guestBootTimer=null;
  cancelAnimationFrame(serialFrame);
  serialFrame=0;
  serialPending='';
  serialOutput.length=0;
  terminalMuxReady=false;
  terminalMuxLine='';
  terminalBootText='';
  guestFiles.ready=false;
  guestFiles.emulator=null;
  guestFiles.trashOrigins.clear();
  clearTimeout(guestAccountSyncTimer);
  guestAccountSyncTimer=null;
  guestAccountDevice?.close();
  guestAccountDevice=null;
  const worker=v86Instance, network=guestNetworkAdapter;
  v86Instance=null;
  guestNetworkAdapter=null;
  if(viewerProfile.guest){guestState='idle';guestMessage='Open Terminal to start Linux.';}
  try{network?.destroy();}catch(error){console.warn('Linux network cleanup failed:',error);}
  try{worker?.close();}catch(error){console.warn('Linux worker cleanup failed:',error);}
}
function failGuest(message){
  stopGuest();
  bootFailed=true;
  guestState='error';
  guestMessage=String(message);
  for(const session of terminalSessions.values())session.screen.feed('\r\nGuest error: '+guestMessage+'\r\n');
  feedback(guestMessage);
  refreshTerminals();
}
function reportGuestWorkerFailure(error,epoch){
  if(epoch===bootEpoch)failGuest(error?.message||String(error));
}
async function startGuest(){
  if(!currentSession||!viewerProfile.guest||!['idle','error'].includes(guestState))return;
  const epoch=++bootEpoch;
  bootFailed=false;
  const request=new AbortController();
  guestBootRequest=request;
  try{
    guestState='starting';guestMessage='Loading local Linux kernel and initramfs…';refreshTerminals();
    const attachNetwork=await prepareGuestNetwork(request.signal);
    const imageResponse=await fetch('assets/terminal/v2/image.json',{cache:'no-store',signal:request.signal});
    if(!imageResponse.ok)throw Error('The terminal guest image manifest is unavailable.');
    const image=await imageResponse.json();
    if(image.version!=='codi-terminal-image/2'||!Number.isSafeInteger(image.bytes)||image.bytes<1||image.bytes>67108864||!/^[0-9a-f]{64}$/.test(image.sha256)||image.path!=='assets/terminal/v2/'+image.sha256+'.cpio.gz')throw Error('Invalid terminal guest image metadata.');
    const runtime='assets/terminal/v86/';
    await Promise.all([runtime+'v86.wasm',runtime+'seabios.bin',runtime+'vgabios.bin',runtime+'vmlinuz',image.path].map(async name=>{
      const response=await fetch(name,{method:'HEAD',signal:request.signal});
      if(!response.ok)throw Error('Missing guest asset '+name+' (HTTP '+response.status+').');
    }));
    if(epoch!==bootEpoch)return;
    const pageBase=new URL('.',location.href).pathname.replace(/\/$/,'');
    if(useAccountGuestHome()){
      const [context,{createAccountHome},{createAccountHome9p}]=await Promise.all([
        workspaceFileContext(),import('./storage/browser/account-home.mjs'),import('./assets/desktop/account-home-9p.mjs')
      ]);
      if(epoch!==bootEpoch||!context.valid())return;
      const home=createAccountHome({
        files:context.files,valid:()=>epoch===bootEpoch&&context.valid(),
        onChange(){
          if(guestAccountSyncTimer!==null)return;
          guestAccountSyncTimer=setTimeout(()=>{
            guestAccountSyncTimer=null;
            if(epoch===bootEpoch&&context.valid()&&mirrorSession===currentSession)void mirrorInstance?.sync().catch(()=>{});
          },500);
        }
      });
      guestAccountDevice=createAccountHome9p(home);
    }
    const {GuestWorkerClient}=await import(new URL('assets/desktop/guest-worker-client.mjs',document.baseURI));if(epoch!==bootEpoch)return;
    // v86 selects the browser scheduler when available; its normal nested
    // Worker scheduler remains the fallback. A fragment keeps the cache URL.
    const emulator=new GuestWorkerClient(new URL(pageBase+'/assets/desktop/guest-worker-runtime.js#use-scheduling-api',location.origin),{onFatal:error=>reportGuestWorkerFailure(error,epoch)});
    const options={wasm_path:new URL(runtime+'v86.wasm',document.baseURI).href,memory_size:256*1024*1024,
      bios:{url:new URL(runtime+'seabios.bin',document.baseURI).href},vga_bios:{url:new URL(runtime+'vgabios.bin',document.baseURI).href},
      bzimage:{url:new URL(runtime+'vmlinuz',document.baseURI).href},initrd:{url:new URL(image.path,document.baseURI).href},
      ...(attachNetwork?{net_device:{type:'virtio'}}:{}),
      filesystem:{},cmdline:'console=ttyS0,115200n8 rdinit=/init panic=-1 quiet loglevel=0'+(attachNetwork?' guest_net=1':''),autostart:true,disable_keyboard:true,disable_mouse:true,disable_speaker:true};
    v86Instance=emulator;
    if(attachNetwork)guestNetworkAdapter=attachNetwork(emulator,({mode})=>{
      if(mode==='disconnected')feedback('Linux networking is unavailable. Retrying while Linux stays open.');
    });
    emulator.add_listener('download-error',event=>{if(epoch===bootEpoch)failGuest('Could not load '+event.file_name+'. Check that the static server is running.');});
    guestBootTimer=setTimeout(()=>{if(epoch===bootEpoch&&!bootFailed&&guestState!=='ready')feedback('Linux is still starting. Keep this tab active; slower devices may need more time.');},60000);
    emulator.add_listener('serial0-output-byte',byte=>{if(epoch!==bootEpoch)return;receiveGuestSerial(String.fromCharCode(byte));});
    emulator.add_listener('emulator-ready',()=>{
      if(epoch!==bootEpoch)return;
      guestState='booting';
      guestMessage=guestAccountDevice?'Mounting My files as Linux home…':'Starting Linux and temporary home…';
      if(!guestAccountDevice)guestFiles.connect(emulator,{networkRelay:!!attachNetwork}).then(async()=>{
        if(epoch===bootEpoch)await emulator.create_file('/session.json',new TextEncoder().encode(JSON.stringify({
          sessionId:currentSession.id,kind:currentSession.kind,displayName:currentSession.displayName
        })));
      }).catch(error=>{if(epoch===bootEpoch)failGuest('Shared files: '+error.message);});
      refreshTerminals();
    });
    emulator.start(options,guestAccountDevice?{handleAccountRequest:guestAccountDevice.request}:undefined);
  }catch(error){if(epoch===bootEpoch)failGuest(error.message||String(error));}
  finally{if(guestBootRequest===request)guestBootRequest=null;}
}
function disposeSessionView(win,reason){
  const frame=win.querySelector('.notebook-app iframe');
  if(frame){const app=frame.contentWindow?.jupyterapp;if(app?.shell?.widgets)for(const widget of [...app.shell.widgets('main')])widget.dispose();}
  const errors=disposePublicAppView(win,reason);win.remove();if(errors.length)throw new AggregateError(errors,'An app did not finish cleanup.');
}
let sessionEnding=false;
function sessionDirtyWindows(owner=workspaceOwner()){
  const result=[];
  for(const desktop of surfaces.values())for(const w of desktop.windows){
    if(w.ownerSub&&w.ownerSub!==owner)continue;
    let embeddedDirty=false,viewState=null;
    try{viewState=desktop.root.querySelector('[data-window="'+w.id+'"]')?.appView?.lifecycle?.snapshot();}catch{embeddedDirty=true;}
    if(w.app==='notebook')try{embeddedDirty=!!desktop.root.querySelector('[data-window="'+w.id+'"] .notebook-app iframe')?.contentWindow?.jupyterapp?.status?.isDirty;}catch{embeddedDirty=true;}
    if(windowHasChanges(w)||embeddedDirty||viewState?.dirty||viewState?.pending){const revisions=Object.entries(w).flatMap(([name,value])=>value&&typeof value==='object'?['revision','edits','sequence'].filter(key=>Number.isSafeInteger(value[key])).map(key=>name+'.'+key+':'+value[key]):[]).concat(viewState?'view:'+viewState.revision:[]).join(',');result.push({desktop,w,revisions});}
  }
  return result;
}
function sameDirtyWindows(a,b){return a.length===b.length&&a.every((item,index)=>item.desktop===b[index].desktop&&item.w===b[index].w&&item.revisions===b[index].revisions);}
function sessionLifecycleSnapshot(life){const x=life.snapshot();if(!x||!Number.isSafeInteger(x.revision)||x.revision<0||typeof x.dirty!=='boolean'||typeof x.pending!=='boolean')throw Error('Invalid app lifecycle state.');return x;}
function trackSessionEdits(){
  let changed=false,invalid=false;const cleanup=[],observers=[],leases=[],tracked=[],textTracked=new WeakSet(),documentTracked=new WeakSet(),imageTracked=new WeakSet(),audioTracked=new WeakSet(),spreadsheetTracked=new WeakSet(),dataExplorerTracked=new WeakSet(),notebookTracked=new WeakSet(),mark=()=>{changed=true;};
  // Successful sign-out invalidates Accounts before view teardown. Keep the
  // captured owner's membership stable while checking for actual edits.
  const owner=workspaceOwner();
  const membership=()=>[...surfaces.values()].flatMap(desktop=>desktop.windows.filter(w=>!w.ownerSub||w.ownerSub===owner).map(w=>({desktop,w})));
  const initialMembers=membership();
  const read=sessionLifecycleSnapshot;
  const release=()=>{for(const lease of leases.splice(0).reverse())try{lease.release();}catch(error){console.error('Could not release app pause:',error);}};
  const disposeTracker=()=>{release();for(const observer of observers)observer.disconnect();for(const fn of cleanup)try{fn();}catch(error){console.error('Could not remove app listener:',error);}};
  try{for(const desktop of surfaces.values()){
    for(const event of ['input','change']){desktop.root.addEventListener(event,mark,true);cleanup.push(()=>desktop.root.removeEventListener(event,mark,true));}
    for(const win of desktop.root.querySelectorAll('.window')){
      const w=desktop.windows.find(item=>item.id===Number(win.dataset.window)),text=win.querySelector('.codi-text-editor .cm-content');
      const life=[...Object.keys(drakonApps),'narrator','mathcraft','text','wordcraft','pdfcraft','gridcraft','deckcraft',...layerAccountApps,'document-editor','image-editor','audio-editor','spreadsheet','data-explorer'].includes(w?.app)?win.appView?.lifecycle:undefined;
      if(w&&life!==undefined){try{if(!life||typeof life.snapshot!=='function'||typeof life.subscribe!=='function'||typeof life.quiesce!=='function')throw Error('Invalid app lifecycle.');const off=life.subscribe(mark);if(typeof off!=='function')throw Error('Invalid app lifecycle subscription.');cleanup.push(off);const initial=read(life);tracked.push({desktop,w,win,life,initial});if(w.app==='text')textTracked.add(w);else if(w.app==='document-editor')documentTracked.add(w);else if(w.app==='image-editor')imageTracked.add(w);else if(w.app==='audio-editor')audioTracked.add(w);else if(w.app==='spreadsheet')spreadsheetTracked.add(w);else if(w.app==='data-explorer')dataExplorerTracked.add(w);}catch(error){console.error('App lifecycle unavailable:',error);invalid=true;}}
      else if(w&&text){const observer=new MutationObserver(mark);observer.observe(text,{childList:true,characterData:true,subtree:true});observers.push(observer);textTracked.add(w);}
      else if(w?.app==='text'){invalid=true;}
      const frame=win.querySelector('.notebook-app iframe');if(frame)try{const app=frame.contentWindow?.jupyterapp;if(app?.shell?.widgets){for(const signal of [app.shell.currentChanged,app.shell.layoutModified])if(signal?.connect){signal.connect(mark);cleanup.push(()=>signal.disconnect(mark));}for(const widget of app.shell.widgets('main')){const signal=widget.context?.model?.contentChanged;if(signal?.connect){signal.connect(mark);cleanup.push(()=>signal.disconnect(mark));if(w)notebookTracked.add(w);}}}}catch(error){throw Error('Could not inspect notebook frame.',{cause:error});}
    }
  }
  }catch(error){disposeTracker();throw error;}
  const differs=()=>{if(changed||invalid||observers.some(observer=>observer.takeRecords().length))return true;const members=membership();if(members.length!==initialMembers.length||members.some((x,i)=>x.desktop!==initialMembers[i].desktop||x.w!==initialMembers[i].w))return true;try{return tracked.some(x=>{if(x.win.appView?.lifecycle!==x.life)return true;const state=read(x.life);return state.revision!==x.initial.revision||state.dirty!==x.initial.dirty||state.pending!==x.initial.pending;});}catch{return true;}};
  return {textTracked,documentTracked,imageTracked,audioTracked,spreadsheetTracked,dataExplorerTracked,notebookTracked,changed:differs,async quiesce(){if(invalid)throw Error('An app lifecycle is unavailable.');try{for(const item of tracked){if(differs())throw Error('Work changed while preparing to sign out.');const lease=await item.life.quiesce();if(!lease||typeof lease.release!=='function')throw Error('An app pause was unavailable.');leases.push(lease);}if(differs())throw Error('Work changed while preparing to sign out.');}catch(error){release();throw error;}},dispose:disposeTracker};
}

function sessionHasUntrackedWork(w,tracker){
  for(const value of Object.values(w)){
    if(!value||typeof value!=='object')continue;
    let dirty=!!(value.dirty||value.saving);try{if(typeof value.hasChanges==='function')dirty=dirty||!!value.hasChanges();}catch{return true;}
    if(!dirty)continue;
    if(value===w.notebook&&w.app==='notebook'&&tracker.notebookTracked.has(w))continue;
    if(value===w.editor&&w.app==='text'&&tracker.textTracked.has(w))continue;
    if(value===w.documentEditor&&w.app==='document-editor'&&tracker.documentTracked.has(w))continue;
    if(value===w.imageEditor&&w.app==='image-editor'&&tracker.imageTracked.has(w))continue;
    if(value===w.audioEditor&&w.app==='audio-editor'&&tracker.audioTracked.has(w))continue;
    if(value===w.spreadsheet&&w.app==='spreadsheet'&&tracker.spreadsheetTracked.has(w))continue;
    if(value===w.dataExplorer&&w.app==='data-explorer'&&tracker.dataExplorerTracked.has(w))continue;
    // These two editors expose a monotonic edit counter; other applications
    // need an explicit lifecycle/revision contract before this can be trusted.
    if(!value.saving&&((value===w.imageEditor&&w.app==='image-editor')||(value===w.documentEditor&&w.app==='document-editor'))&&Number.isSafeInteger(value.edits))continue;
    return true;
  }
  return w.app==='notebook'&&!tracker.notebookTracked.has(w);
}
async function confirmSessionEnd(approvedViews=new Map()){
  let tracker,initial,closeChanged=false;try{tracker=trackSessionEdits();initial=sessionDirtyWindows();for(const [view,before] of approvedViews){if(!before)continue;const now=sessionLifecycleSnapshot(view.lifecycle);if(now.revision!==before.revision||now.dirty!==before.dirty||now.pending!==before.pending)closeChanged=true;}}catch(error){tracker?.dispose();console.error('Could not inspect app state:',error);feedback('Could not inspect an app safely. Your session is still open; close the app and try again.');return null;}
  if(closeChanged){tracker.dispose();feedback('Work changed after close confirmation. Review it and try ending the session again.');return null;}
  const untracked=initial.find(({w})=>sessionHasUntrackedWork(w,tracker));
  if(untracked){const message=untracked.w.app==='calculator'&&untracked.w.calculator?.saving?'Finish the pending Calculator file operation before ending or changing your session.':'Close '+untracked.w.title+' using its own close button before ending or changing your session. This protects its unsaved work.';await confirmDesktop(message,{title:'Finish in this app first',confirmLabel:'OK',cancelLabel:'Keep working'});tracker.dispose();return null;}
  // Public document views already asked Save/Discard/Cancel. Keep tracking
  // their real dirty revisions, but do not ask the legacy question twice.
  const unconfirmed=initial.filter(({desktop,w})=>!approvedViews.get(desktop.root.querySelector('[data-window="'+w.id+'"]')?.appView));
  if(unconfirmed.length){const names=unconfirmed.slice(0,4).map(({w})=>w.title).join(', '),more=unconfirmed.length>4?' and '+(unconfirmed.length-4)+' more':'';const ok=await confirmDesktop('End this session and discard unsaved work in '+names+more+'? Notebook output and temporary Linux files may also be lost.',{title:'Unsaved changes',confirmLabel:'End session',cancelLabel:'Keep working',danger:true});if(!ok){tracker.dispose();return null;}}
  if(tracker.changed()||!sameDirtyWindows(initial,sessionDirtyWindows())){tracker.dispose();feedback('Work changed while confirming. Review it and try ending the session again.');return null;}
  return {initial,tracker};
}
async function endSession(){
  if(sessionEnding||accountTransition)return;
  sessionEnding=true;let approved;
  try{
  const session=currentSession;
  for(const desktop of surfaces.values())desktop.root.inert=true;
  const approvedViews=new Map();
  for(const desktop of surfaces.values())for(const win of desktop.root.querySelectorAll('.window')){const view=win.appView;if(typeof view?.requestClose==='function'){if(await view.requestClose({scope:'session'})!==true)return;try{const state=view.lifecycle?sessionLifecycleSnapshot(view.lifecycle):null;approvedViews.set(view,state?Object.freeze({revision:state.revision,dirty:state.dirty,pending:state.pending}):null);}catch{feedback('Could not inspect an app safely. Your session is still open.');return;}}}
  approved=await confirmSessionEnd(approvedViews);
  if(!approved||currentSession!==session)return;
  if((approved.tracker.changed()||!sameDirtyWindows(approved.initial,sessionDirtyWindows()))){feedback('Work changed while confirming. Review it and try ending the session again.');return;}
  try{await approved.tracker.quiesce();}catch(error){feedback(error.message||'Could not pause Text.');return;}
  if(currentSession!==session||approved.tracker.changed()){feedback('Work changed while preparing to sign out.');return;}
  for(const desktop of surfaces.values())if(!desktop.saveLayout()){feedback('Could not save your window layout. Your session is still open; try again.');return;}
  // Prevent new input while the server request is in flight. On an uncertain
  // outcome the desktop remains intact so the user can retry or recover work.
  for(const desktop of surfaces.values())desktop.root.inert=true;
  try{if(session&&sessionAccounts.has(session))await logoutAccountSession(session);}
  catch(error){for(const desktop of surfaces.values())desktop.root.inert=false;feedback('Could not confirm sign-out. The server may have ended this session; recover your work or try again.');return;}
  if((approved.tracker.changed()||!sameDirtyWindows(approved.initial,sessionDirtyWindows(session.public.sub)))){for(const desktop of surfaces.values())desktop.root.inert=false;feedback('Work changed during sign-out. The server session ended; recover your work before reloading.');return;}
  closeBrowserSourcePages();
  try{for(const desktop of surfaces.values())for(const win of desktop.root.querySelectorAll('.window'))await win.appView?.lifecycle?.commitClose?.();for(const desktop of surfaces.values())for(const win of desktop.root.querySelectorAll('.window'))disposeSessionView(win,'Session ending');}
  catch(error){for(const desktop of surfaces.values())desktop.root.inert=false;console.warn('Session cleanup failed:',error);feedback('The server signed out, but window cleanup was incomplete. Some windows may have closed; copy remaining work before reloading.');return;}
  // Let abort handlers terminate their workers before requesting navigation.
  closeAccountMirror({suspend:true});await Promise.resolve();desktopLifecycle?.stop();desktopLifecycle=null;
  clearInterval(identityTimer);
  stopGuest();
  currentSession=null;feedback('Signing out…');location.reload();
  }finally{for(const desktop of surfaces.values())desktop.root.inert=false;approved?.tracker.dispose();sessionEnding=false;}
}
let bootRecovery=null,bootRetry=0;
async function initializeWithRecovery(){
  try{
    await initializeSession();bootRecovery?.stop();bootRecovery=null;
  }catch(error){
    clearInterval(identityTimer);identityTimer=null;
    if(currentSession&&sessionAccounts.has(currentSession))logoutAccountSession(currentSession).catch(()=>{});currentSession=null;
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
Object.defineProperty(window.desktopLab,'agentOperations',{get(){return desktopAgentOperations?.bridge;}});
function syncVisibleViewport(){
  const view=window.visualViewport,host=document.querySelector('#previews');
  if(!host)return;
  // Android Chrome can collapse its browser toolbar only when the document
  // itself can scroll. The desktop remains fixed to the visible viewport;
  // app scrolling and keyboard resizing are still handled independently.
  const androidChrome=/Android/i.test(navigator.userAgent)&&/(?:Chrome|Chromium)\//i.test(navigator.userAgent);
  document.documentElement.classList.toggle('android-chrome-scroll',androidChrome&&matchMedia('(pointer:coarse)').matches&&compactDesktop(innerWidth)&&!!view&&view.scale===1);
  if(view&&view.scale===1&&compactDesktop(innerWidth)){host.style.height=Math.min(innerHeight,view.height)+'px';host.style.position=document.documentElement.classList.contains('android-chrome-scroll')?'sticky':'fixed';host.style.top=view.offsetTop+'px';}
  else{host.style.height='';host.style.position='';host.style.top='';}
}
window.visualViewport?.addEventListener('resize',syncVisibleViewport);
window.visualViewport?.addEventListener('scroll',syncVisibleViewport);
window.addEventListener('resize',syncVisibleViewport);syncVisibleViewport();
