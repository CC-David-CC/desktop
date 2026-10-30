/* Retire the prior Codi desktop worker before loading a different release. */
(async()=>{
  const controller=navigator.serviceWorker?.controller;
  if(controller&&new URL(controller.scriptURL).pathname.endsWith('/assets/desktop/offline-worker.js')){
    const current=await new Promise(resolve=>{const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();resolve(null);},1000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data);};controller.postMessage({type:'codi-cache-version'},[channel.port2]);});
    let release=null;try{const response=await fetch('assets/desktop/cache-manifest.json',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(4000)});if(response.ok){const data=await response.json();if(/^[0-9a-f]{64}$/.test(data.id))release=data.id;}}catch{}
    if(current?.protocol!=='codi-simplified-cache/1'||(release&&current.release!==release)){
      const base=new URL('.',document.baseURI),registration=await navigator.serviceWorker.getRegistration(base.pathname);
      if(registration?.scope===base.href)await registration.unregister();
      for(const name of await caches.keys())if(name.startsWith('codi-public-v1|'+base.pathname+'|'))await caches.delete(name);
      location.reload();return;
    }
  }
  for(const src of ['.build/v86/libv86.js','reference.js','terminal.js','desktop-apps.js','app.js'])await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src+'?simplified=1';s.onload=resolve;s.onerror=()=>reject(Error('Could not load '+src));document.body.append(s);});
})().catch(error=>{document.querySelector('#previews').textContent='Desktop could not start: '+error.message;});
