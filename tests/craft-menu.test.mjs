import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../active-system/app.js',import.meta.url),'utf8');
const start=source.indexOf('const desktopMenu=['),policy=source.indexOf('function menuDisabledTitle(',start),end=source.indexOf('\nconst ',policy);
const selected={WordCraft:'wordcraft',PdfCraft:'pdfcraft',GridCraft:'gridcraft',DeckCraft:'deckcraft',PhotoCraft:'photocraft',VectorCraft:'vectorcraft',DesignCraft:'designcraft',FigCraft:'figcraft',AniCraft:'anicraft',LightCraft:'lightcraft',FilmCraft:'filmcraft',EffectCraft:'effectcraft',SoundCraft:'soundcraft',CADCraft:'cadcraft',SolidCraft:'solidcraft',PCBCraft:'pcbcraft',FieldCraft:'fieldcraft',SketchCraft:'sketchcraft',TextureCraft:'texturecraft',MaterialCraft:'materialcraft'};
function fixture(ids) {
  const context=vm.createContext({reference:{icons:{}},viewerProfile:{speech:false},enabledApp:id=>ids.includes(id)});
  const names=source.slice(source.indexOf('const layerAccountApps='),source.indexOf('async function renewAccountSession('));
  return vm.runInContext(names+'\n'+source.slice(start,end)+';({desktopMenu,applicationIds,menuDisabledTitle})',context);
}
function leaves(entries){return entries.flatMap(entry=>entry.children?leaves(entry.children):entry.separator?[]:[entry]);}

test('all twenty selected Craft apps appear once and unqualified entries retain the disabled menu policy',()=>{
  const {desktopMenu,applicationIds,menuDisabledTitle}=fixture(['wordcraft','pdfcraft']);
  const entries=leaves(desktopMenu);
  for(const [name,id] of Object.entries(selected)) {
    const matches=entries.filter(entry=>entry.name===name);assert.equal(matches.length,1,name);
    assert.equal(applicationIds[name],id);assert.equal(!!menuDisabledTitle(matches[0]),!['wordcraft','pdfcraft'].includes(id),name);
  }
});

test('qualifying the next two apps enables only them while retaining unsupported legacy entries',()=>{
  const {desktopMenu,menuDisabledTitle}=fixture(['wordcraft','pdfcraft','gridcraft','deckcraft']);
  const entries=leaves(desktopMenu);
  for(const name of ['WordCraft','PdfCraft','GridCraft','DeckCraft'])assert.equal(menuDisabledTitle(entries.find(entry=>entry.name===name)),null);
  for(const name of ['PhotoCraft','SolidCraft','SketchCraft','Document Editor','Spreadsheet','PDF Viewer','Image Editor','Audio Editor','SVG-edit']) {
    const entry=entries.find(entry=>entry.name===name);assert.ok(entry,name);assert.ok(menuDisabledTitle(entry),name);
  }
});
