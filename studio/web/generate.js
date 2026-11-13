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
  function floorFor(role){
    const chosen=$(role==='room'?'#layoutRoomFloor':'#layoutCorridorFloor').value;
    const a=S.assets.find(v=>v.id===chosen)||named(setting()[role])||floorAssets()[0];
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
  async function floorObject(region,asset,art,grid){
    const scale=asset.gridSize?grid/asset.gridSize:2*grid/Math.max(art.naturalWidth,art.naturalHeight);
    const tile=document.createElement('canvas');tile.width=Math.max(1,Math.round(art.naturalWidth*scale));tile.height=Math.max(1,Math.round(art.naturalHeight*scale));
    tile.getContext('2d').drawImage(art,0,0,tile.width,tile.height);
    const b=region.bounds,canvas=document.createElement('canvas');canvas.width=b.width;canvas.height=b.height;
    const ctx=canvas.getContext('2d'),pattern=ctx.createPattern(tile,'repeat');pattern.setTransform(new DOMMatrix().translate(-b.x,-b.y));
    ctx.beginPath();for(const c of region.cells)ctx.rect(c.x*grid-b.x,c.y*grid-b.y,grid,grid);ctx.clip();ctx.fillStyle=pattern;ctx.fillRect(0,0,b.width,b.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.92));
    const r=await fetch('/api/upload?name='+encodeURIComponent('Layout '+region.name),{method:'POST',body:blob});
    if(!r.ok)throw Error((await r.json()).error||'Upload failed');
    const {asset:made}=await r.json();
    return {asset:made,object:{id:region.id,assetId:made.id,name:region.name,x:b.x,y:b.y,width:b.width,height:b.height,rotation:0,visible:true,locked:true}};
  }
  async function generate(e){
    e.preventDefault();if(busy)return;
    const p=S.project,grid=Math.round(Number(p.grid))||50;
        busy=true;$('#layoutGo').disabled=true;status('Generating…');
    try{
      const s=setting(),map=L.generate({seed:$('#layoutSeed').value,setting:s.id,composition:$('#layoutComposition').value,
        roomCount:$('#layoutRooms').value,loopCount:$('#layoutLoops').value,deadEndCount:$('#layoutDeadEnds').value});
      if(!map.validation.valid)throw Error('The generator could not make a valid layout from these settings. Try another seed.');
      const out=L.toStudio(map,{grid,doorsOpen:$('#layoutDoorsOpen').checked});
      const rooms=floorFor('room'),corridors=floorFor('corridor'),art=new Map();
      for(const a of new Set([rooms,corridors]))art.set(a.id,await loaded(a));
      status('Laying '+out.regions.length+' floors…');
      const floors=await Promise.all(out.regions.map(region=>{const a=region.kind==='room'?rooms:corridors;return floorObject(region,a,art.get(a.id),grid)}));
      floors.forEach(f=>S.addAsset(f.asset));const objects=floors.map(f=>f.object);
      const stairArt=named(STAIRS),stairs=$('#layoutStairs').checked&&stairArt?out.stairs.filter(t=>t.kind==='stairs'):[];
      for(const t of stairs)objects.push({id:t.id,assetId:stairArt.id,name:'Stairs',x:t.x,y:t.y,width:t.width,height:t.height,rotation:t.rotation,visible:true});
      objects.forEach(o=>{o.layer=o.name==='Stairs'?'objects':'map'});
      S.openDocument({version:1,name:s.label+' ('+map.seed+')',width:out.width,height:out.height,grid,background:'#1d1b17',
        objects,walls:out.walls,lights:[],effects:[],exportLayers:p.exportLayers!==false,layout:out.layout});
      S.switchMode('view');$('#layoutDialog').close();
      const doors=out.walls.filter(w=>w.kind==='door').length;
      S.toast(`${map.rooms.length} rooms, ${out.walls.length-doors} walls, ${doors?doors+' doors':'open passages'}${stairs.length?', '+stairs.length+' stairs':''}. Seed ${map.seed}.`);
    }catch(error){status(error.message,true)}finally{busy=false;$('#layoutGo').disabled=false}
  }
  $('#layoutBtn').onclick=open;$('#closeLayout').onclick=()=>$('#layoutDialog').close();
  $('#layoutDice').onclick=()=>{$('#layoutSeed').value=randomSeed()};
  $('#layoutSetting').onchange=fillFloors;$('#layoutForm').onsubmit=generate;
})();
