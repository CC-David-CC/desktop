import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../active-system/app.js',import.meta.url),'utf8');
const start=source.indexOf('class Desktop {'),end=source.indexOf('\n}\n',start)+2;
const editorDefinitions=source.slice(source.indexOf('const layerAccountApps='),source.indexOf('async function renewAccountSession('));
const editors={text:'Text Editor',wordcraft:'WordCraft',pdfcraft:'PdfCraft',gridcraft:'GridCraft',deckcraft:'DeckCraft',
  photocraft:'PhotoCraft',vectorcraft:'VectorCraft',figcraft:'FigCraft',anicraft:'AniCraft',lightcraft:'LightCraft',
  designcraft:'DesignCraft',soundcraft:'SoundCraft',filmcraft:'FilmCraft',effectcraft:'EffectCraft',cadcraft:'CADCraft',texturecraft:'TextureCraft',materialcraft:'MaterialCraft',sketchcraft:'SketchCraft',solidcraft:'SolidCraft',pcbcraft:'PCBCraft',fieldcraft:'FieldCraft'};
const sha='a'.repeat(64),draft='12345678-1234-1234-1234-123456789abc';
function fixture() {
  let owner='account-A';const storage=new Map(),surfaces=new Map();
  const context=vm.createContext({console,location:{origin:'https://webos.test'},identityConfig:null,surfaces,
    signedInSubject:()=>owner,workspaceOwner:()=>owner,accountWindow:w=>!w.ownerSub||w.ownerSub===owner,isAccountApp:()=>false,
    enabledApp:()=>true,windowRect:w=>({x:w.x,y:w.y,w:w.w,h:w.h}),
    localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
    feedback:message=>{throw Error(message);}});
  const Desktop=vm.runInContext(editorDefinitions+'\n'+source.slice(start,end)+';Desktop',context);
  function desktop() {
    const d=Object.create(Desktop.prototype);Object.assign(d,{windows:[],current:0,active:null,nextId:10,layoutOwner:owner,
      root:{querySelector:()=>null},activateWindow(w){this.active=w.id;w.minimized=false;},
      launch(app,title){const w={id:this.nextId++,app,title,workspace:0,x:25,y:40,w:700,h:500};this.windows.push(w);return w;}});
    surfaces.set('screen-'+surfaces.size,d);return d;
  }
  return {desktop,storage,setOwner:value=>{owner=value;}};
}

test('Account document windows restore exact account resource, draft and geometry',()=>{
  const f=fixture(),d=f.desktop();
  for(const app of Object.keys(editors)) {
    const w=d.launch(app,app);w.ownerSub='account-A';w.workspace=2;w.minimized=true;
    w.launchContext={storage:'account',owner:'account-A',path:'Documents/'+app,sha256:sha};
    w[app+'DraftId']=draft;w[app+'RecoveryAsCopy']=true;
  }
  assert.equal(d.saveLayout(),true);const restored=f.desktop();restored.layoutOwner=null;restored.restoreLayout();
  assert.deepEqual(Array.from(restored.windows,w=>w.app),Object.keys(editors));
  for(const w of restored.windows) {
    assert.equal(w.launchContext.path,'Documents/'+w.app);assert.equal(w.launchContext.sha256,sha);
    assert.equal(w.launchContext.restore,true);assert.equal(w.ownerSub,'account-A');
    assert.equal(w.workspace,2);assert.equal(w.minimized,true);assert.equal(w.x,25);assert.equal(w.w,700);
    assert.equal(w[w.app+'DraftId'],draft);
    if(w.app!=='text')assert.equal(w[w.app+'RecoveryAsCopy'],true);
  }
  f.setOwner('account-B');const other=f.desktop();other.layoutOwner=null;other.restoreLayout();assert.equal(other.windows.length,0);
});

test('all account document hosts update canonical titles/revisions and activate one existing view across screens',()=>{
  const f=fixture(),a=f.desktop(),b=f.desktop();
  for(const [app,name] of Object.entries(editors)) {
    const w=a.launch(app,'Untitled');a.updateAccountFileBinding(w,{owner:'account-A',path:'Documents/'+app+'.data',sha256:sha});
    assert.equal(w.title,app+'.data — '+name);
    assert.equal(b.openAccountFile(app,{owner:'account-A',path:w.launchContext.path,sha256:sha}),w);
    assert.equal(a.active,w.id);assert.equal(b.windows.length,0);
    assert.throws(()=>a.updateAccountFileBinding(w,{owner:'account-B',path:'Other',sha256:sha}),/account/);
    a.updateAccountFileBinding(w,{owner:'account-A',path:null,sha256:null});assert.equal(w.title,'Untitled — '+name);
    assert.equal(w.launchContext,undefined);
  }
});

test('canonical resource validation rejects traversal and unconfirmed revisions before launching',()=>{
  const {desktop}=fixture(),d=desktop();
  for(const resource of [{owner:'account-A',path:'../x',sha256:sha},{owner:'account-B',path:'x',sha256:sha},{owner:'account-A',path:'x',sha256:'not-confirmed'}]) {
    assert.throws(()=>d.openAccountFile('gridcraft',resource),/account file/);
  }
  assert.equal(d.windows.length,0);
});

test('learning games bind one Files window to the current owner and restore its revision',()=>{
  const f=fixture(),d=f.desktop(),id='fraction-farm',path='Documents/Round.fraction-farm.json';
  const w=d.openAccountFile(id,{owner:'account-A',path,sha256:sha});
  assert.equal(w.title,'Round.fraction-farm.json — Fraction Farm');
  assert.equal(d.openAccountFile(id,{owner:'account-A',path,sha256:sha}),w);
  const other=f.desktop();other.layoutOwner=null;other.restoreLayout();
  assert.equal(other.windows[0].launchContext.sha256,sha);
  assert.equal(other.windows[0].launchContext.restore,true);
});
