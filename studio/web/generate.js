/* Generate layout: a seeded Battle Map Forge dungeon as ordinary editable
 * Map Studio floors, walls, doors and stairs. */
(() => {
  'use strict';
  const S=window.KrakenStudio,L=window.KrakenLayout,$=s=>document.querySelector(s);
  const STAIRS='stairs_e_01';
  let busy=false;
  const floorAssets=()=>S.assets.filter(a=>/Floors|Backgrounds/.test(a.category||'')).sort((a,b)=>a.name.localeCompare(b.name));
  const named=name=>S.assets.find(a=>a.name===name);
  function setting(){return L.SETTINGS.find(s=>s.id===$('#layoutSetting').value)||L.SETTINGS[0]}
  function randomSeed(){const n=new Uint32Array(1);crypto.getRandomValues(n);return 'forge-'+n[0].toString(36)}
  function status(text,bad=false){const s=$('#layoutStatus');s.textContent=text;s.classList.toggle('bad',bad)}
  function fillFloors(){
    const choices=floorAssets(),s=setting();
    for(const [id,role] of [['#layoutRoomFloor','room'],['#layoutCorridorFloor','corridor']]){
      const select=$(id),kept=select.value;select.replaceChildren(new Option('Setting default ('+s[role].replace(/_/g,' ')+')',''));
      for(const a of choices)select.add(new Option(a.name.replace(/_/g,' '),a.id));
      if(choices.some(a=>a.id===kept))select.value=kept;
    }
  }
  function open(){
    const select=$('#layoutSetting');
    if(!select.options.length)for(const s of L.SETTINGS)select.add(new Option(s.label,s.id));
    const last=S.project.layout;
    if(last&&L.SETTINGS.some(s=>s.id===last.setting)){select.value=last.setting;$('#layoutSeed').value=last.seed}
    if(!$('#layoutSeed').value)$('#layoutSeed').value=randomSeed();
    fillFloors();status('');$('#layoutDialog').showModal();
  }
  function floorFor(role,chosen=$(role==='room'?'#layoutRoomFloor':'#layoutCorridorFloor').value,s=setting()){
    const a=S.assets.find(v=>v.id===chosen)||named(chosen)||named(s[role])||floorAssets()[0];
    if(!a)throw Error('No floor artwork is available. Refresh the asset library.');
    return a;
  }
  async function loaded(asset){
    const art=S.image(asset.id);
    try{await art.decode()}catch{throw Error('Could not load artwork '+asset.name+'.')}
    return art;
  }
  // The floor texture repeats from the map's origin, so neighbouring regions
  // with the same floor join without a seam. Cells outside the region stay clear.
  // A region's floor (the generator's rooms and corridors, and Map Studio's agent tools' floors):
  // region {id, name, bounds {x, y, width, height}, and cells (grid squares) or polygons (outlines in
  // map pixels, filled even-odd)}, feather (px: a soft edge that blends into what is under it).
  async function floorObject(region,asset,art,grid,feather=0){
    const scale=asset.gridSize?grid/asset.gridSize:2*grid/Math.max(art.naturalWidth,art.naturalHeight);
    const tile=document.createElement('canvas');tile.width=Math.max(1,Math.round(art.naturalWidth*scale));tile.height=Math.max(1,Math.round(art.naturalHeight*scale));
    tile.getContext('2d').drawImage(art,0,0,tile.width,tile.height);
    const b=region.bounds,canvas=document.createElement('canvas');canvas.width=b.width;canvas.height=b.height;
    const ctx=canvas.getContext('2d'),pattern=ctx.createPattern(tile,'repeat');pattern.setTransform(new DOMMatrix().translate(-b.x,-b.y));
    const outline=c=>{c.beginPath();if(region.cells)for(const q of region.cells)c.rect(q.x*grid-b.x,q.y*grid-b.y,grid,grid);else for(const poly of region.polygons){poly.forEach((v,i)=>i?c.lineTo(v.x-b.x,v.y-b.y):c.moveTo(v.x-b.x,v.y-b.y));c.closePath()}};
    if(feather>0){
      ctx.fillStyle=pattern;ctx.fillRect(0,0,b.width,b.height);
      const mask=document.createElement('canvas');mask.width=b.width;mask.height=b.height;const m=mask.getContext('2d');
      m.filter=`blur(${feather/2}px)`;m.fillStyle='#fff';outline(m);m.fill('evenodd');
      ctx.globalCompositeOperation='destination-in';ctx.drawImage(mask,0,0);ctx.globalCompositeOperation='source-over';
    }else{outline(ctx);ctx.clip('evenodd');ctx.fillStyle=pattern;ctx.fillRect(0,0,b.width,b.height)}
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.92));
    const r=await fetch('/api/upload?name='+encodeURIComponent('Layout '+region.name),{method:'POST',body:blob});
    if(!r.ok)throw Error((await r.json()).error||'Upload failed');
    const {asset:made}=await r.json();
    return {asset:made,object:{id:region.id,assetId:made.id,name:region.name,x:b.x,y:b.y,width:b.width,height:b.height,rotation:0,visible:true,locked:true}};
  }
  // A generated layout opened as a new map. The dialog's way, and Map Studio's agent tools':
  // {setting, seed, composition, rooms, loops, deadEnds, roomFloor, corridorFloor (art id or name; empty for
  // the setting's), doorsOpen, stairs, stairArt (art id or name; empty for the starter kit's), grid}. Throws on failure; returns what it made.
  async function build(o){
    const p=S.project,grid=Math.round(Number(o.grid)||Number(p.grid))||50;
    const s=L.SETTINGS.find(v=>v.id===o.setting)||L.SETTINGS[0],map=L.generate({seed:o.seed||randomSeed(),setting:s.id,composition:o.composition,
      roomCount:o.rooms,loopCount:o.loops,deadEndCount:o.deadEnds});
    if(!map.validation.valid)throw Error('The generator could not make a valid layout from these settings. Try another seed.');
    const out=L.toStudio(map,{grid,doorsOpen:!!o.doorsOpen});
    const rooms=floorFor('room',o.roomFloor||'',s),corridors=floorFor('corridor',o.corridorFloor||'',s),art=new Map();
    for(const a of new Set([rooms,corridors]))art.set(a.id,await loaded(a));
    status('Laying '+out.regions.length+' floors…');
    const floors=await Promise.all(out.regions.map(region=>{const a=region.kind==='room'?rooms:corridors;return floorObject(region,a,art.get(a.id),grid)}));
    floors.forEach(f=>S.addAsset(f.asset));const objects=floors.map(f=>f.object);
    const stairArt=o.stairArt?S.assets.find(v=>v.id===o.stairArt)||named(o.stairArt):named(STAIRS),stairs=o.stairs!==false&&stairArt?out.stairs.filter(t=>t.kind==='stairs'):[];
    for(const t of stairs)objects.push({id:t.id,assetId:stairArt.id,name:'Stairs',x:t.x,y:t.y,width:t.width,height:t.height,rotation:t.rotation,visible:true});
    objects.forEach(o=>{o.layer=o.name==='Stairs'?'objects':'map'});
    S.openDocument({version:1,name:s.label+' ('+map.seed+')',width:out.width,height:out.height,grid,background:'#1d1b17',
      objects,walls:out.walls,lights:[],effects:[],exportLayers:p.exportLayers!==false,layout:out.layout});
    S.switchMode('view');
    const doors=out.walls.filter(w=>w.kind==='door').length;
    return {roomFloor:rooms.id,corridorFloor:corridors.id,roomFloorName:rooms.name,corridorFloorName:corridors.name,seed:map.seed,setting:s.id,rooms:map.rooms.length,walls:out.walls.length-doors,doors,stairs:stairs.length,
      roomList:out.regions.filter(r=>r.kind==='room').map(r=>({id:r.id,name:r.name,squares:{x:r.bounds.x/grid,y:r.bounds.y/grid,width:r.bounds.width/grid,height:r.bounds.height/grid}}))};
  }
  async function generate(e){
    e.preventDefault();if(busy)return;
    busy=true;$('#layoutGo').disabled=true;status('Generating…');
    try{
      const made=await build({seed:$('#layoutSeed').value,setting:setting().id,composition:$('#layoutComposition').value,rooms:$('#layoutRooms').value,
        loops:$('#layoutLoops').value,deadEnds:$('#layoutDeadEnds').value,roomFloor:$('#layoutRoomFloor').value,corridorFloor:$('#layoutCorridorFloor').value,
        doorsOpen:$('#layoutDoorsOpen').checked,stairs:$('#layoutStairs').checked});
      $('#layoutDialog').close();
      S.toast(`${made.rooms} rooms, ${made.walls} walls, ${made.doors?made.doors+' doors':'open passages'}${made.stairs?', '+made.stairs+' stairs':''}. Seed ${made.seed}.`);
    }catch(error){status(error.message,true)}finally{busy=false;$('#layoutGo').disabled=false}
  }
  window.KrakenGenerate={build,floorObject,loaded,SETTINGS:L.SETTINGS};
  $('#layoutBtn').onclick=open;$('#closeLayout').onclick=()=>$('#layoutDialog').close();
  $('#layoutDice').onclick=()=>{$('#layoutSeed').value=randomSeed()};
  $('#layoutSetting').onchange=fillFloors;$('#layoutForm').onsubmit=generate;
})();
