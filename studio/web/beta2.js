/* Beta 02 editing tools share the original document and undo stack. */
(() => {
  'use strict';
  const S=window.KrakenStudio,K=window.KrakenEditorCore,$=s=>document.querySelector(s);
  const clone=v=>JSON.parse(JSON.stringify(v)),uid=k=>k+'-'+crypto.randomUUID();
  const all=()=>['objects','walls','lights','effects'].flatMap(key=>S.project[key]);
  let selection=new Set(),gesture=null,vision={x:800,y:500},visionEnabled=false,filter='all';
  let favorites=new Set(JSON.parse(localStorage.getItem('kraken-favorites')||'[]'));
  let recent=JSON.parse(localStorage.getItem('kraken-recent')||'[]');
  let assemblies=JSON.parse(localStorage.getItem('kraken-assemblies')||'[]');
  let saveTimer,lastDocument='',saveChain=Promise.resolve(),busy=false;
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const selected=()=>all().filter(o=>selection.has(o.id));
  function selectItem(o,add=false){
    if(!add)selection.clear();
    const members=o.groupId?all().filter(v=>v.groupId===o.groupId):[o];
    const remove=add&&selection.has(o.id);
    members.forEach(v=>remove?selection.delete(v.id):selection.add(v.id));
    S.selected=remove?[...selection][0]||null:o.id;S.asset=null;S.active('select');S.draw();
  }
  function changed(){S.save();S.draw()}
  function deleteSelection(){
    if(!selection.size)return false;
    const editable=selected().filter(o=>!o.locked);if(!editable.length)return true;
    S.snapshot();const ids=new Set(editable.map(o=>o.id));
    for(const key of ['objects','walls','lights','effects'])S.project[key]=S.project[key].filter(o=>!ids.has(o.id));
    selection.clear();S.selected=null;changed();return true;
  }
  function translate(o,dx,dy){if(Array.isArray(o.points)){o.points=o.points.map((v,k)=>v+(k%2?dy:dx))}else if('x1'in o){o.x1+=dx;o.x2+=dx;o.y1+=dy;o.y2+=dy}else{o.x+=dx;o.y+=dy}}
  function bounds(items){
    const points=items.flatMap(o=>Array.isArray(o.points)?o.points.filter((_,k)=>k%2===0).map((x,k)=>({x,y:o.points[2*k+1]})):'x1'in o?[{x:o.x1,y:o.y1},{x:o.x2,y:o.y2}]:[{x:o.x,y:o.y},{x:o.x+(o.width||0),y:o.y+(o.height||0)}]);
    return {x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y)),right:Math.max(...points.map(p=>p.x)),bottom:Math.max(...points.map(p=>p.y))};
  }
  function duplicate(){
    const items=selected();if(!items.length)return;
    S.snapshot();const ids=new Map(items.map(o=>[o.id,uid('copy')])),groups=new Map();selection.clear();
    for(const key of ['objects','walls','lights','effects']){
      const copies=S.project[key].filter(o=>ids.has(o.id)).map(o=>{
        const copy=clone(o);copy.id=ids.get(o.id);copy.locked=false;
        if(o.groupId){if(!groups.has(o.groupId))groups.set(o.groupId,uid('group'));copy.groupId=groups.get(o.groupId)}
        if(copy.wallId)copy.wallId=ids.get(copy.wallId)||copy.wallId;
        translate(copy,S.project.grid,S.project.grid);selection.add(copy.id);return copy;
      });S.project[key].push(...copies);
    }S.selected=[...selection][0];changed();
  }
  function group(){if(selection.size<2)return;S.snapshot();const id=uid('group');selected().forEach(o=>o.groupId=id);changed()}
  function ungroup(){if(!selection.size)return;S.snapshot();selected().forEach(o=>delete o.groupId);changed()}
  function toggleLock(){if(!selection.size)return;S.snapshot();const locked=!selected().every(o=>o.locked);selected().forEach(o=>o.locked=locked);changed()}
  function align(){
    const units=new Map();selected().forEach(o=>{const key=o.groupId||o.id;if(!units.has(key))units.set(key,[]);units.get(key).push(o)});
    const groups=[...units.values()].filter(g=>!g.some(o=>o.locked));if(groups.length<2){S.toast('Shift-select two items or groups to align.');return}
    S.snapshot();const top=Math.min(...groups.map(g=>bounds(g).y));groups.forEach(g=>{const dy=top-bounds(g).y;g.forEach(o=>translate(o,0,dy))});changed();
  }
  function handles(o){return K.getObjectHandles(o,{rotationOffset:26/S.zoom})}
  function hit(point){return S.project.objects.slice().reverse().find(o=>o.visible!==false&&!o.locked&&!window.KrakenLayers?.locked(o)&&!window.KrakenLayers?.hidden(o)&&K.rotatedHitTest(o,point))}
  function pointerDown(e){
    if(e.button!==0||S.tool==='pan'||e.code==='Space')return false;
    const point=S.point(e),p=S.project;
    if(S.mode==='vision'||visionEnabled&&e.altKey){vision=point;gesture={kind:'vision'};$('#mapCanvas').setPointerCapture(e.pointerId);S.draw();return true}
    if(S.tool==='room'){
      gesture={kind:'room',start:{x:S.snap(point.x,'x'),y:S.snap(point.y,'y')},end:point};$('#mapCanvas').setPointerCapture(e.pointerId);return true;
    }
    if(['door','window'].includes(S.tool)){
      const result=K.insertPortalInWalls(p.walls,point,{kind:S.tool,width:Math.max(.25,Number($('#portalWidth').value)||1)*p.grid,tolerance:14/S.zoom,id:uid('portal')});
      if(result){S.snapshot();p.walls=result;syncWallArt();S.selected=result.find(o=>o.parentWallId)?.id||null;changed();return true}
    }
    const paint=$('#paintTool').value;
    if(S.mode==='paint'&&S.asset&&paint!=='stamp'){
      gesture={kind:paint,assetId:S.asset,path:[point],size:Math.min(500,Math.max(10,Number($('#brushSize').value)||100))};$('#mapCanvas').setPointerCapture(e.pointerId);S.draw();return true;
    }
    if(S.tool!=='select'||S.asset)return false;
    const leader=p.objects.find(o=>o.id===S.selected);
    if(leader&&!leader.locked){
      const handle=Object.entries(handles(leader)).find(([,pos])=>distance(point,pos)<=9/S.zoom);
      if(handle){S.snapshot();gesture={kind:handle[0]==='rotate'?'rotate':'resize',handle:handle[0],leader:clone(leader),items:clone(selected().length?selected():[leader]),point};$('#mapCanvas').setPointerCapture(e.pointerId);return true}
    }
    const o=hit(point);
    if(e.shiftKey){if(o)selectItem(o,true);return true}
    if(o){
      if(!selection.has(o.id))selectItem(o);else S.selected=o.id;
      if(o.locked)return true;
      S.snapshot();gesture={kind:'move',start:point,items:clone(selected().filter(o=>!o.locked))};$('#mapCanvas').setPointerCapture(e.pointerId);return true;
    }
    selection.clear();return false;
  }
  function transformItems(fn){
    const map=new Map(all().map(o=>[o.id,o]));for(const original of gesture.items){const target=map.get(original.id);if(target)Object.assign(target,fn(clone(original)))}
  }
  function pointerMove(e){
    if(!gesture)return false;const point=S.point(e);
    if(gesture.kind==='vision'){vision=point;S.draw();return true}
    if(gesture.kind==='room'){gesture.end={x:S.snap(point.x,'x'),y:S.snap(point.y,'y')};S.draw();return true}
    if(['texture','scatter'].includes(gesture.kind)){if(distance(point,gesture.path.at(-1))>3)gesture.path.push(point);S.draw();return true}
    if(gesture.kind==='move'){
      const dx=S.snap(point.x-gesture.start.x),dy=S.snap(point.y-gesture.start.y);transformItems(o=>{translate(o,dx,dy);return o});
    }
    if(gesture.kind==='resize'){
      const resized=K.resizeRotatedObject(gesture.leader,gesture.handle,point,{preserveAspect:gesture.items.length>1||!e.altKey,minSize:8});
      if(gesture.items.length===1)Object.assign(all().find(o=>o.id===gesture.leader.id),resized);
      else{
        const scale=resized.width/gesture.leader.width,a={x:gesture.leader.x+gesture.leader.width/2,y:gesture.leader.y+gesture.leader.height/2},b={x:resized.x+resized.width/2,y:resized.y+resized.height/2};
        transformItems(o=>{if('x1'in o){for(const n of [1,2]){o['x'+n]=b.x+(o['x'+n]-a.x)*scale;o['y'+n]=b.y+(o['y'+n]-a.y)*scale}}else{const cx=o.x+(o.width||0)/2,cy=o.y+(o.height||0)/2;o.width&&=o.width*scale;o.height&&=o.height*scale;o.x=b.x+(cx-a.x)*scale-(o.width||0)/2;o.y=b.y+(cy-a.y)*scale-(o.height||0)/2}return o});
      }
    }
    if(gesture.kind==='rotate'){
      const o=gesture.leader,center={x:o.x+o.width/2,y:o.y+o.height/2};let angle=Math.atan2(point.y-center.y,point.x-center.x)*180/Math.PI+90;
      if(e.shiftKey)angle=Math.round(angle/15)*15;const delta=(angle-(o.rotation||0))*Math.PI/180;
      const rotate=v=>({x:center.x+(v.x-center.x)*Math.cos(delta)-(v.y-center.y)*Math.sin(delta),y:center.y+(v.x-center.x)*Math.sin(delta)+(v.y-center.y)*Math.cos(delta)});
      transformItems(v=>{if('x1'in v){for(const n of [1,2]){const q=rotate({x:v['x'+n],y:v['y'+n]});v['x'+n]=q.x;v['y'+n]=q.y}}else{const q=rotate({x:v.x+(v.width||0)/2,y:v.y+(v.height||0)/2});v.x=q.x-(v.width||0)/2;v.y=q.y-(v.height||0)/2;if(v.width)v.rotation=(v.rotation||0)+delta*180/Math.PI}return v});
    }
    changed();return true;
  }
  function pointerUp(){
    if(!gesture)return false;const finished=gesture;
    if(finished.kind==='room')makeRoom(finished.start,finished.end);
    else if(finished.kind==='texture')paintTexture(finished);
    else if(finished.kind==='scatter')paintScatter(finished);
    gesture=null;S.draw();return true;
  }
  function floorAsset(){return S.asset||S.assets.find(a=>a.name==='stone_tiles_b_01')?.id||S.assets.find(a=>a.category.includes('Floor'))?.id}
  function makeRoom(a,b){
    const rect={x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(b.x-a.x),height:Math.abs(b.y-a.y)};
    if(rect.width<S.project.grid||rect.height<S.project.grid)return;
    const room=K.createRectRoom(rect,{floorAssetId:floorAsset(),idPrefix:uid('room')});
    if(!room.objects.length){S.toast('Choose a floor asset first.',true);return}
    room.objects.forEach(o=>Object.assign(o,{name:'Room floor',visible:true}));S.snapshot();S.project.objects.push(...room.objects);S.project.walls.push(...room.walls);syncWallArt();
    selection=new Set(all().filter(o=>o.groupId===room.groupId).map(o=>o.id));S.selected=room.objects[0].id;changed();
  }
  function syncWallArt(){
    const p=S.project,wallAsset=S.assets.find(a=>a.name==='stone_inner_wall_east_c_01')||S.assets.find(a=>a.name.includes('stone_wall'));
    if(!wallAsset)return;
    p.objects=p.objects.filter(o=>!o.wallArt);
    p.walls.filter(w=>w.groupId).forEach(w=>{
      const dx=w.x2-w.x1,dy=w.y2-w.y1,length=Math.hypot(dx,dy),thickness=12;
      const portal=w.kind!=='wall';if(portal)return;
      p.objects.push({id:'art-'+w.id,wallArt:true,wallId:w.id,groupId:w.groupId,assetId:wallAsset.id,name:'Room wall',x:(w.x1+w.x2)/2-length/2,y:(w.y1+w.y2)/2-thickness/2,width:length,height:thickness,rotation:Math.atan2(dy,dx)*180/Math.PI,visible:true});
    });
  }
  async function paintTexture(stroke){
    if(busy)return;busy=true;
    try{
      const radius=stroke.size/2,b=bounds(stroke.path.map(p=>({x:p.x-radius,y:p.y-radius,width:stroke.size,height:stroke.size}))),left=Math.floor(b.x),top=Math.floor(b.y),width=Math.ceil(b.right-left),height=Math.ceil(b.bottom-top);
      if(width*height>12000000)throw Error('Use shorter brush strokes for this map.');
      const art=S.image(stroke.assetId);await art.decode();const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
      const source=S.assets.find(v=>v.id===stroke.assetId),tile=document.createElement('canvas');tile.width=tile.height=Math.max(8,Math.round(source?.gridSize?(art.naturalWidth||source.width)*S.project.grid/source.gridSize:S.project.grid*2));tile.getContext('2d').drawImage(art,0,0,tile.width,tile.height);
      ctx.fillStyle=ctx.createPattern(tile,'repeat');ctx.fillRect(0,0,width,height);ctx.globalCompositeOperation='destination-in';
      const mask=document.createElement('canvas');mask.width=width;mask.height=height;const m=mask.getContext('2d'),soft=Number($('#brushSoftness').value)/100;
      const points=K.scatterBrush(stroke.path,{spacing:Math.max(2,radius/5),jitter:0,seed:1});points.push(stroke.path[0],stroke.path.at(-1));
      points.forEach(p=>{const g=m.createRadialGradient(p.x-left,p.y-top,Math.max(.1,radius*(1-soft)),p.x-left,p.y-top,radius);g.addColorStop(0,'white');g.addColorStop(1,'transparent');m.fillStyle=g;m.beginPath();m.arc(p.x-left,p.y-top,radius,0,Math.PI*2);m.fill()});ctx.drawImage(mask,0,0);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.92)),r=await fetch('/api/upload?name=Terrain%20brush.webp',{method:'POST',body:blob});if(!r.ok)throw Error((await r.json()).error);
      const {asset}=await r.json();S.addAsset(asset);S.snapshot();const o={id:uid('terrain'),assetId:asset.id,name:'Terrain brush',x:left,y:top,width,height,rotation:0,visible:true};S.project.objects.push(o);selection=new Set([o.id]);S.selected=o.id;changed();
    }catch(e){S.toast('Brush failed: '+e.message,true)}finally{busy=false}
  }
  function paintScatter(stroke){
    const a=S.assets.find(a=>a.id===stroke.assetId),q=S.image(stroke.assetId),ratio=(q.naturalHeight||100)/(q.naturalWidth||100);
    const points=K.scatterBrush(stroke.path,{spacing:stroke.size*.7,jitter:stroke.size*.3,rotationRange:[-180,180],scaleRange:[.7,1.3],seed:uid('seed')});
    if(S.project.objects.length+points.length>5000){S.toast('Too many artwork objects.',true);return}
    S.snapshot();selection.clear();for(const point of points){const width=stroke.size*point.scale,height=width*ratio,o={id:uid('scatter'),assetId:stroke.assetId,name:a?.name||'Scatter',x:point.x-width/2,y:point.y-height/2,width,height,rotation:point.rotation,visible:true};S.project.objects.push(o);selection.add(o.id)}S.selected=[...selection][0]||null;changed();
  }
  function path(ctx,points){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath()}
  function render(ctx,p,{zoom,selected:leaderId}){
    const ids=new Set(all().map(o=>o.id));selection=new Set([...selection].filter(id=>ids.has(id)));
    if(!leaderId&&!gesture)selection.clear();else if(leaderId&&!selection.has(leaderId))selection=new Set([leaderId]);
    if(visionEnabled){
      const polygon=K.visibilityPolygon(vision,Math.max(5,Number($('#visionRange').value)||60)*p.grid/5,window.KrakenLOS.visionSegments(p));
      ctx.save();ctx.fillStyle='rgba(0,0,0,.87)';ctx.beginPath();ctx.rect(0,0,p.width,p.height);polygon.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.closePath();ctx.fill('evenodd');ctx.fillStyle='#76d8d0';ctx.beginPath();ctx.arc(vision.x,vision.y,8/zoom,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    ctx.save();ctx.lineWidth=1.5/zoom;ctx.strokeStyle='#e7c76a';
    selected().filter(o=>o.width&&!S.project.effects.includes(o)).forEach(o=>{path(ctx,Object.values(K.rotatedCorners(o)));ctx.stroke()});// effects show their own outline
    const leader=p.objects.find(o=>o.id===leaderId);
    if(leader&&!leader.locked&&S.tool==='select'&&!S.asset){
      const h=handles(leader);ctx.beginPath();ctx.moveTo((h.nw.x+h.ne.x)/2,(h.nw.y+h.ne.y)/2);ctx.lineTo(h.rotate.x,h.rotate.y);ctx.stroke();
      for(const [name,v]of Object.entries(h)){ctx.fillStyle=name==='rotate'?'#56bfb5':'#f0dfab';ctx.beginPath();ctx.arc(v.x,v.y,name==='rotate'?6/zoom:5/zoom,0,Math.PI*2);ctx.fill();ctx.stroke()}
    }
    if(gesture?.kind==='room'){const a=gesture.start,b=gesture.end;ctx.setLineDash([6/zoom,4/zoom]);ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y)}
    if(gesture&&['texture','scatter'].includes(gesture.kind)){ctx.strokeStyle='rgba(100,210,200,.5)';ctx.lineWidth=gesture.size;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();gesture.path.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.stroke()}
    ctx.restore();$('#layeredExport').checked=!!p.exportLayers;
    $('#lockBtn').textContent=selected().length&&selected().every(o=>o.locked)?'Unlock':'Lock';
    $('#favoriteCurrent').textContent=favorites.has(S.asset)?'★':'☆';
    document.querySelectorAll('.layer').forEach(row=>{row.classList.toggle('selected',selection.has(row.dataset.id));const label=row.querySelector('.layer-name'),o=all().find(o=>o.id===row.dataset.id);if(o?.locked)label.textContent='🔒 '+label.textContent});
    extendInspector();scheduleRecovery(p);
  }
  function extendInspector(){
    const o=all().find(o=>o.id===S.selected);if(!o)return;
    const panel=$('#properties'),extra=document.createElement('div');extra.className='beta-inspector';
    if(['door','window'].includes(o.kind)){const label=document.createElement('label'),toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=!!o.open;label.append(toggle,' Open portal');toggle.onchange=()=>{S.snapshot();o.open=toggle.checked;changed()};extra.append(label)}
    if(extra.childNodes.length)panel.append(extra);
  }
  function assetVisible(a){return filter==='favorites'?favorites.has(a.id):filter==='recent'?recent.includes(a.id):true}
  function assetPicked(id){recent=[id,...recent.filter(v=>v!==id)].slice(0,40);localStorage.setItem('kraken-recent',JSON.stringify(recent))}
  function toggleFavorite(id){if(!id){S.toast('Choose an asset first.');return}favorites.has(id)?favorites.delete(id):favorites.add(id);localStorage.setItem('kraken-favorites',JSON.stringify([...favorites]));S.showAssets();S.draw()}
  function prefabList(){const select=$('#prefabSelect');select.replaceChildren(new Option('Assemblies...',''));assemblies.forEach((a,i)=>select.add(new Option(a.name,String(i))))}
  function saveAssembly(){
    if(!selection.size){S.toast('Select artwork or a room first.');return}const name=prompt('Assembly name','My room');if(!name)return;
    const data={name,parts:{}};for(const key of ['objects','walls','lights','effects'])data.parts[key]=clone(S.project[key].filter(o=>selection.has(o.id)));
    assemblies.push(data);localStorage.setItem('kraken-assemblies',JSON.stringify(assemblies));prefabList();
  }
  function placeAssembly(){
    const index=$('#prefabSelect').value;if(index==='')return;const data=clone(assemblies[Number(index)].parts),items=Object.values(data).flat(),box=bounds(items),dx=S.project.width/2-(box.x+box.right)/2,dy=S.project.height/2-(box.y+box.bottom)/2;
    const ids=new Map(items.map(o=>[o.id,uid('assembly')])),group=uid('group');S.snapshot();selection.clear();
    for(const key of ['objects','walls','lights','effects'])for(const o of data[key]){o.id=ids.get(o.id);if(o.wallId)o.wallId=ids.get(o.wallId)||o.wallId;o.groupId=group;o.locked=false;translate(o,dx,dy);S.project[key].push(o);selection.add(o.id)}S.selected=data.objects[0]?.id||[...selection][0];changed();
  }
  function thumb(){const canvas=document.createElement('canvas');canvas.width=240;canvas.height=150;canvas.getContext('2d').drawImage($('#mapCanvas'),0,0,240,150);return canvas.toDataURL('image/png')}
  function saveProject(manual=false){
    const target=S.project,payload=clone(target),thumbnail=thumb();
    saveChain=saveChain.catch(()=>{}).then(async()=>{
      const r=await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:payload,thumbnail,id:target.projectId})});if(!r.ok)throw Error((await r.json()).error);
      const data=await r.json();if(S.project===target){target.projectId=data.id;lastDocument=JSON.stringify(target);localStorage.setItem('kraken-map-autosave',lastDocument);$('#savedState').textContent='RECOVERY SAVED'}if(manual){S.toast('Project saved. Find it again under Open > Saved project.');S.markSaved()}
    }).catch(e=>{if(manual)S.toast('Save failed: '+e.message,true)});return saveChain;
  }
  function scheduleRecovery(p){
    const document=JSON.stringify(p);if(document===lastDocument)return;lastDocument=document;clearTimeout(saveTimer);
    if(p.objects.length||p.walls.length)saveTimer=setTimeout(()=>saveProject(false),1800);
  }
  async function projects(){
    const dialog=$('#projectDialog'),list=$('#projectList');list.textContent='Loading...';dialog.showModal();
    try{
      const r=await fetch('/api/projects'),data=await r.json();if(!r.ok)throw Error(data.error);list.replaceChildren();
      const entries=data.projects||data;
      if(!entries.length)list.textContent='No saved projects yet. Use Save project.';
      for(const project of entries){
        const card=document.createElement('article'),label=document.createElement('b'),button=document.createElement('button');label.textContent=project.name||project.id;button.textContent='Open latest';card.append(label,button);
        if(project.thumbnail){const img=document.createElement('img');img.src=project.thumbnail;img.alt='Project preview';card.prepend(img)}
        button.onclick=async()=>{try{const r=await fetch('/api/projects/'+encodeURIComponent(project.id)),data=await r.json();if(!r.ok)throw Error(data.error);S.openDocument(data.project||data);dialog.close()}catch(e){S.toast(e.message,true)}};
        const versions=project.revisions||[];if(versions.length){const picker=document.createElement('select');picker.add(new Option('Recovery versions...',''));for(const version of versions)picker.add(new Option(version.savedAt||version.created||version.id,version.id||version.file));picker.onchange=async()=>{if(!picker.value)return;try{const r=await fetch('/api/projects/'+encodeURIComponent(project.id)+'?revision='+encodeURIComponent(picker.value)),d=await r.json();if(!r.ok)throw Error(d.error);S.openDocument(d.project||d);dialog.close()}catch(e){S.toast(e.message,true)}};card.append(picker)}
        list.append(card);
      }
    }catch(e){list.textContent='Could not load projects: '+e.message}
  }
  async function subscription(){
    const dialog=$('#subscriptionDialog'),content=$('#subscriptionContent');dialog.showModal();content.textContent='Checking installed packs...';
    try{const r=await fetch('/api/subscription'),d=await r.json();content.replaceChildren();const info=document.createElement('p');info.textContent=d.message||'Vault packs are detected, but their artwork cannot yet be read by this external editor. Export permitted images through FG and use Import artwork.';content.append(info);for(const pack of d.packs||[]){const row=document.createElement('div');row.textContent=pack.name||pack.filename||String(pack);content.append(row)}}catch(e){content.textContent='Pack check unavailable: '+e.message}
  }
  function keyDown(e){
    if(e.key==='Escape'){selection.clear();gesture=null;return false}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();duplicate();return true}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='g'){e.preventDefault();e.shiftKey?ungroup():group();return true}
    return false;
  }
  window.KrakenBeta02={saveProject,render,pointerDown,pointerMove,pointerUp,keyDown,deleteSelection,assetVisible,assetPicked,modeChanged(mode){if(mode==='vision'){visionEnabled=true;$('#visionToggle').checked=true;S.asset=null}}};
  $('#duplicateBtn').onclick=duplicate;$('#groupBtn').onclick=group;$('#ungroupBtn').onclick=ungroup;$('#lockBtn').onclick=toggleLock;$('#alignBtn').onclick=align;
  $('#prefabSaveBtn').onclick=saveAssembly;$('#prefabPlaceBtn').onclick=placeAssembly;prefabList();
  $('#layeredExport').onchange=e=>{S.snapshot();S.project.exportLayers=e.target.checked;changed()};
  $('#visionToggle').onchange=e=>{visionEnabled=e.target.checked;S.draw()};$('#visionRange').onchange=()=>S.draw();
  $('#allAssets').onclick=()=>{filter='all';S.showAssets()};$('#favoriteAssets').onclick=()=>{filter='favorites';S.showAssets()};$('#recentAssets').onclick=()=>{filter='recent';S.showAssets()};$('#favoriteCurrent').onclick=()=>toggleFavorite(S.asset);
  $('#assetGrid').addEventListener('contextmenu',e=>{const asset=e.target.closest('.asset');if(asset){e.preventDefault();toggleFavorite(asset.dataset.id)}});
  $('#saveProjectBtn').onclick=()=>saveProject(true);$('#projectsBtn').onclick=projects;$('#closeProjects').onclick=()=>$('#projectDialog').close();$('#subscriptionBtn').onclick=subscription;$('#closeSubscription').onclick=()=>$('#subscriptionDialog').close();
  window.addEventListener('beforeunload',()=>{clearTimeout(saveTimer);localStorage.setItem('kraken-map-autosave',JSON.stringify(S.project))});
  S.draw();
})();
