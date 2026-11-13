(() => {
  "use strict";
  const $ = (s) => document.querySelector(s),
    c = $("#mapCanvas"),
    x = c.getContext("2d"),
    blank = () => ({
      version: 1,
      name: "Untitled Map",
      width: 1600,
      height: 1000,
      grid: 50,
      background: "#292d27",
      objects: [],
      walls: [],
      lights: [],
      effects: [],
      exportLayers: true,
    });
  let p = blank(),
    assets = [],
    asset = null,
    sel = null,
    tool = "select",
    z = 1,
    pan = { x: 40, y: 40 },
    drag,
    undo = [],
    redo = [],
    imgs = new Map(),
    space = false;
  const id = (k) =>
      k +
      "-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 6),
    esc = (s) =>
      String(s).replace(
        /[&<>"']/g,
        (m) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[m],
      );
  let dirty = false,
    mode = "view";
  function toast(s, b) {
    let t = $("#toast");
    t.textContent = s;
    t.style.borderColor = b ? "#bd6057" : "";
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), Math.max(3500, String(s).length * 55));
  }
  function store() {
    window.KrakenLayers?.normalize(p);
    window.KrakenShell?.changed();
    dirty = true;
    localStorage.setItem("kraken-map-autosave", JSON.stringify(p));
    $("#savedState").textContent = "UNSAVED";
  }
  function snap() {
    undo.push(JSON.stringify(p));
    if (undo.length > 60) undo.shift();
    redo = [];
  }
  function num(v, min = 0) {
    v = Number(v);
    return Number.isFinite(v) && v >= min ? v : min;
  }
  function pt(e) {
    let r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z };
  }
  function grid(v, axis) {
    // axis "x"/"y": snap to the grid lines (which may be offset); no axis: a whole number of squares
    const off = axis ? Number(p.gridOffset?.[axis]) || 0 : 0;
    return $("#snapToggle").checked ? Math.round((v - off) / p.grid) * p.grid + off : v;
  }
  function im(a) {
    if (imgs.has(a)) return imgs.get(a);
    let q = new Image();
    q.src = "/api/asset/" + encodeURIComponent(a);
    q.onload = q.onerror = draw;
    imgs.set(a, q);
    return q;
  }
  function active(t) {
    tool = t;
    $("#panTool").classList.toggle("active", t === "pan");
    document
      .querySelectorAll("[data-tool]")
      .forEach((b) => b.classList.toggle("active", b.dataset.tool === t));
    $("#canvasHint").textContent =
      t === "select"
        ? asset
          ? "Click to place selected asset"
          : "Select, move, and resize objects"
        : t === "light"
          ? "Click to place a light; drag a light to move it"
          : ["wall", "door", "window"].includes(t)
            ? "Drag to draw " + t
            : "Drag an approximate " + t + " preview";
  }
  function draw() {
    c.width = p.width;
    c.height = p.height;
    c.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${z})`;
    $("#zoomReadout").textContent = Math.round(z * 100) + "%";
    $("#mapReadout").textContent = `${p.width} x ${p.height} | Grid ${p.grid}`;
    x.fillStyle = p.background;
    x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = "rgba(220,210,170,.12)";
    for (let a = ((Number(p.gridOffset?.x) || 0) % p.grid + p.grid) % p.grid; a <= c.width; a += p.grid) {
      x.beginPath();
      x.moveTo(a, 0);
      x.lineTo(a, c.height);
      x.stroke();
    }
    for (let a = ((Number(p.gridOffset?.y) || 0) % p.grid + p.grid) % p.grid; a <= c.height; a += p.grid) {
      x.beginPath();
      x.moveTo(0, a);
      x.lineTo(c.width, a);
      x.stroke();
    }
    p.objects
      .filter((o) => o.visible !== false && !window.KrakenLayers?.hidden(o))
      .forEach((o) => {
        let q = im(o.assetId);
        x.save();
        x.translate(o.x + o.width / 2, o.y + o.height / 2);
        x.rotate(((o.rotation || 0) * Math.PI) / 180);
        x.globalAlpha = o.opacity ?? 1;
        q.naturalWidth
          ? x.drawImage(q, -o.width / 2, -o.height / 2, o.width, o.height)
          : ((x.fillStyle = "#566b66"),
            x.fillRect(-o.width / 2, -o.height / 2, o.width, o.height));
        x.restore();
      });
    x.save();
    x.strokeStyle = "rgba(220,210,170,.16)";
    x.lineWidth = 1;
    for (let a = ((Number(p.gridOffset?.x) || 0) % p.grid + p.grid) % p.grid; a <= p.width; a += p.grid) {
      x.beginPath();
      x.moveTo(a, 0);
      x.lineTo(a, p.height);
      x.stroke();
    }
    for (let a = ((Number(p.gridOffset?.y) || 0) % p.grid + p.grid) % p.grid; a <= p.height; a += p.grid) {
      x.beginPath();
      x.moveTo(0, a);
      x.lineTo(p.width, a);
      x.stroke();
    }
    x.restore();
    window.KrakenWeather?.draw(x, z);
    window.KrakenLighting?.drawAmbient(x);
    [...p.lights].sort((a, b) => !!a.inverse - !!b.inverse) // darkness last: it takes light away
      .filter(() => $("#previewLighting").checked && !window.KrakenLayers?.groupHidden("lights") && mode !== "play")
      .forEach((l) => {
        if (l.on === false) { x.strokeStyle = l.color; x.lineWidth = 2 / z; x.beginPath(); x.arc(l.x, l.y, 5, 0, 7); x.stroke(); return; }
        window.KrakenLighting.paint(x, l, p.grid);
        x.fillStyle = l.inverse ? "#000" : l.color;
        x.beginPath();
        x.arc(l.x, l.y, 5, 0, 7);
        x.fill();
      });
    window.KrakenLighting?.draw(x, z);
    let o = p.objects.find((o) => o.id === sel);
    if (o && !window.KrakenBeta02) {
      x.strokeStyle = "#f1ca5b";
      x.setLineDash([7, 4]);
      x.strokeRect(o.x - 3, o.y - 3, o.width + 6, o.height + 6);
      x.setLineDash([]);
    }
    inspect();
    window.KrakenBeta02?.render(x, p, {zoom:z, selected:sel});
    window.KrakenWallArt?.render(x, z);
    // Walls last of the map's own layers: on top of the lighting preview, so it never washes them out.
    if (!window.KrakenPlay?.hidesEditing()) window.KrakenLOS.render(x, p, z);
    window.KrakenLOS?.refresh();
    window.KrakenGrid?.draw(x, z);
    if (!window.KrakenPlay?.hidesEditing()) window.KrakenRegions?.draw(x, z);
    window.KrakenPlay?.render(x, z);
    window.KrakenGrid?.refresh();
  }
  function found() {
    for (let k of ["objects", "lights", "effects", "walls"]) {
      let o = p[k].find((a) => a.id === sel);
      if (o) return [o, k];
    }
    return [];
  }
  function field(l, k, v, t = "number") {
    return `<div class="field"><label>${l}</label><input data-p="${k}" type="${t}" value="${esc(v)}"></div>`;
  }
  function inspect() {
    const box = $("#properties"),
      f = found(),
      o = f[0];
    if (!o) {
      box.innerHTML =
        '<div class="property-heading">MAP SETTINGS</div>' +
        field("Map width", "width", p.width) +
        field("Map height", "height", p.height) +
        field("Grid square (pixels)", "grid", p.grid) +
        field("Background", "background", p.background, "color") +
        '<button id="fitBtn">Zoom Extents</button>';
      $("#fitBtn").onclick = fit;
    } else {
      let h = "";
      if (f[1] === "objects")
        h =
          field("Asset name", "name", o.name, "text") +
          `<div class="two">${field("X", "x", o.x)}${field("Y", "y", o.y)}</div><div class="two">${field("Width", "width", o.width)}${field("Height", "height", o.height)}</div>${field("Rotation", "rotation", o.rotation || 0)}<label><input data-p="visible" type="checkbox" ${o.visible !== false ? "checked" : ""}> Visible</label>`;
      if (f[1] === "lights")
        h =
          '<div class="effect-label">LIGHT · RANGES IN FEET</div>' +
          `<div class="two">${field("X", "x", o.x)}${field("Y", "y", o.y)}</div>${field("Color", "color", o.color, "color")}<div class="two">${field("Bright (ft)", "bright", o.bright)}${field("Dim (ft)", "dim", o.dim)}</div>`;
      if (f[1] === "effects")
        h = `<div class="effect-label">${esc(o.name || o.type)} · WEATHER EFFECT</div><p class="muted">Paint where it shows and hides, and change its settings, in Weather effects.</p><button id="fxOpen">Open Weather effects</button>`;
      if (f[1] === "walls")
        h = `<div class="effect-label">${esc(window.KrakenLOS.label(o).toUpperCase())}</div><p class="muted">Edit walls with the Walls &amp; doors tools.</p>`;
      box.innerHTML =
        h +
        '<button class="danger" id="deleteSelected">Delete selected</button>';
      $("#deleteSelected").onclick = deleteSelected;
      if ($("#fxOpen")) $("#fxOpen").onclick = () => switchMode("fx", false);
    }
    box.querySelectorAll("[data-p]").forEach(
      (input) =>
        (input.onchange = () => {
          try {
            const next = JSON.parse(JSON.stringify(p));
            const target = o
              ? next[f[1]].find((item) => item.id === sel)
              : next;
            const value =
              input.type === "checkbox"
                ? input.checked
                : input.type === "number"
                  ? Number(input.value)
                  : input.value;
            target[input.dataset.p] = value;
            const checked = validProject(next);
            snap();
            p = checked;
            store();
            draw();
          } catch (error) {
            toast(error.message, true);
            inspect();
          }
        }),
    );
    layers();
  }
  function layers() {
    if (window.KrakenLayers) return window.KrakenLayers.render();
    const all = [...p.objects, ...p.effects, ...p.lights, ...p.walls];
    $("#layerList").innerHTML =
      all
        .slice()
        .reverse()
        .map((o) => {
          const label = String(o.name || o.type || o.kind || "Light");
          const isArt = p.objects.some((a) => a.id === o.id);
          return `<div class="layer ${o.id === sel ? "selected" : ""}" data-id="${esc(o.id)}"><button class="pick" title="Select ${esc(label)}"><img src="icons/layers.svg" alt=""></button><span class="layer-name" title="${esc(label)}">${esc(label)}</span><button class="visibility" title="${isArt ? "Show or hide artwork" : "Native overlay"}" ${isArt ? "" : "disabled"} style="opacity:${o.visible === false ? 0.3 : 1}"><img src="icons/eye.svg" alt=""></button><button class="up" title="Bring artwork forward">&#8593;</button><button class="del" title="Delete ${esc(label)}">&#215;</button></div>`;
        })
        .join("") || '<div class="empty">No layers yet.</div>';
    document.querySelectorAll(".layer").forEach((row) => {
      const key = row.dataset.id;
      const choose = () => {
        asset = null;
        sel = key;
        active("select");
        draw();
      };
      row.querySelector(".pick").onclick = choose;
      row.querySelector(".layer-name").onclick = choose;
      row.querySelector(".del").onclick = () => {
        sel = key;
        deleteSelected();
      };
      row.querySelector(".visibility").onclick = () => {
        const o = p.objects.find((o) => o.id === key);
        if (o) {
          snap();
          o.visible = o.visible === false;
          store();
          draw();
        }
      };
      row.querySelector(".up").onclick = () => {
        const i = p.objects.findIndex((o) => o.id === key);
        if (i >= 0 && i < p.objects.length - 1) {
          snap();
          [p.objects[i], p.objects[i + 1]] = [p.objects[i + 1], p.objects[i]];
          store();
          draw();
        }
      };
    });
  }
  function fit() {
    let r = $("#viewport").getBoundingClientRect();
    z = Math.max(
      0.2,
      Math.min(
        3,
        Math.min((r.width - 30) / p.width, (r.height - 30) / p.height),
      ),
    );
    pan = { x: (r.width - p.width * z) / 2, y: (r.height - p.height * z) / 2 };
    draw();
  }
  function hit(a) {
    if(asset)return undefined;
    return p.objects.slice().reverse().find(o=>o.visible!==false&&!o.locked&&!window.KrakenLayers?.locked(o)&&!window.KrakenLayers?.hidden(o)&&window.KrakenEditorCore.rotatedHitTest(o,a));
  }
  c.onpointerdown = (e) => {
    if(window.KrakenGrid?.pointerDown(e))return;
    if(window.KrakenRegions?.pointerDown(e))return;
    if(window.KrakenWeather?.pointerDown(e))return;
    if(window.KrakenPlay?.pointerDown(e))return;
    if(window.KrakenLighting?.pointerDown(e))return;
    if(window.KrakenLOS?.pointerDown(e))return;
    if(window.KrakenWallArt?.pointerDown(e))return;
    if(window.KrakenBeta02?.pointerDown(e))return;
    let a = pt(e);
    c.setPointerCapture(e.pointerId);
    if (e.button === 1 || space || tool === "pan") {
      drag = { k: "pan", x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }
    if (e.button) return;
    if (tool === "select") {
      let o = hit(a);
      if (o) {
        sel = o.id;
        snap();
        drag = { k: "move", o, dx: a.x - o.x, dy: a.y - o.y };
        draw();
        return;
      }
      if (asset) {
        let a0 = assets.find((v) => v.id === asset),
          q = im(asset),
          w = (a0?.width || q.naturalWidth || 100) * p.grid / (a0?.gridSize || 100),
          h = (a0?.height || q.naturalHeight || 100) * p.grid / (a0?.gridSize || 100);
        snap();
        o = {
          id: id("obj"),
          assetId: asset,
          name: a0?.name || "Asset",
          x: grid(a.x - w / 2, "x"),
          y: grid(a.y - h / 2, "y"),
          width: w,
          height: h,
          rotation: 0,
          visible: true,
        };
        p.objects.push(o);
        sel = o.id;
        store();
        draw();
      } else {
        sel = null;
        draw();
      }
    } else if (tool === "light") {
      snap();
      let l = {
        id: id("light"),
        x: grid(a.x, "x"),
        y: grid(a.y, "y"),
        color: "#ffbb66",
        bright: 10,
        dim: 20,
      };
      p.lights.push(l);
      sel = l.id;
      store();
      draw();
    } else drag = { k: "draw", a: { x: grid(a.x, "x"), y: grid(a.y, "y") } };
  };
  c.onpointermove = (e) => {
    if(window.KrakenGrid?.pointerMove(e))return;
    if(window.KrakenRegions?.pointerMove(e))return;
    if(window.KrakenWeather?.pointerMove(e))return;
    if(window.KrakenPlay?.pointerMove(e))return;
    if(window.KrakenLighting?.pointerMove(e))return;
    if(window.KrakenLOS?.pointerMove(e)){let a=pt(e);$("#coordReadout").textContent=`X ${Math.round(a.x)} | Y ${Math.round(a.y)}`;return;}
    if(window.KrakenWallArt?.pointerMove(e))return;
    if(window.KrakenBeta02?.pointerMove(e))return;
    let a = pt(e);
    $("#coordReadout").textContent =
      `X ${Math.round(a.x)} | Y ${Math.round(a.y)}`;
    if (!drag) return;
    if (drag.k === "pan") {
      pan = { x: e.clientX - drag.x, y: e.clientY - drag.y };
      draw();
    }
    if (drag.k === "move") {
      drag.o.x = grid(a.x - drag.dx, "x");
      drag.o.y = grid(a.y - drag.dy, "y");
      store();
      draw();
    }
  };
  c.onpointerup = (e) => {
    if(window.KrakenGrid?.pointerUp(e))return;
    if(window.KrakenRegions?.pointerUp(e))return;
    if(window.KrakenWeather?.pointerUp(e))return;
    if(window.KrakenPlay?.pointerUp(e))return;
    if(window.KrakenLighting?.pointerUp(e))return;
    if(window.KrakenLOS?.pointerUp(e))return;
    if(window.KrakenWallArt?.pointerUp(e))return;
    if(window.KrakenBeta02?.pointerUp(e))return;
    if (!drag) return;
    let a = pt(e);
    if (drag.k === "draw") {
      if (Math.abs(grid(a.x, "x") - drag.a.x) + Math.abs(grid(a.y, "y") - drag.a.y) < 2) {
        drag = null;
        return;
      }
      if (
        !["wall", "door", "window"].includes(tool) &&
        (!Math.abs(grid(a.x, "x") - drag.a.x) || !Math.abs(grid(a.y, "y") - drag.a.y))
      ) {
        drag = null;
        return;
      }
      snap();
      let s = drag.a;
      if (["wall", "door", "window"].includes(tool)) {
        let w = {
          id: id("wall"),
          kind: tool,
          x1: s.x,
          y1: s.y,
          x2: grid(a.x, "x"),
          y2: grid(a.y, "y"),
        };
        p.walls.push(w);
        sel = w.id;
      } else {
        let f = {
          id: id("fx"),
          type: tool,
          x: Math.min(s.x, grid(a.x, "x")),
          y: Math.min(s.y, grid(a.y, "y")),
          width: Math.abs(grid(a.x, "x") - s.x),
          height: Math.abs(grid(a.y, "y") - s.y),
        };
        p.effects.push(f);
        sel = f.id;
      }
      store();
      draw();
    }
    drag = null;
  };
  $("#viewport").onwheel = (e) => {
    e.preventDefault();
    let r = $("#viewport").getBoundingClientRect(),
      a = {
        x: (e.clientX - r.left - pan.x) / z,
        y: (e.clientY - r.top - pan.y) / z,
      };
    z = Math.max(0.2, Math.min(3, z * (e.deltaY < 0 ? 1.12 : 0.89)));
    pan = { x: e.clientX - r.left - a.x * z, y: e.clientY - r.top - a.y * z };
    draw();
  };
  function back() {
    if (!undo.length) return;
    redo.push(JSON.stringify(p));
    p = JSON.parse(undo.pop());
    sel = null;
    store();
    draw();
  }
  function forward() {
    if (!redo.length) return;
    undo.push(JSON.stringify(p));
    p = JSON.parse(redo.pop());
    sel = null;
    store();
    draw();
  }
  window.onkeydown = (e) => {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
    if(window.KrakenGrid?.keyDown(e))return;
    if(window.KrakenRegions?.keyDown(e))return;
    if(window.KrakenWeather?.keyDown(e))return;
    if(window.KrakenPlay?.keyDown(e))return;
    if(window.KrakenLighting?.keyDown(e))return;
    if(window.KrakenLOS?.keyDown(e))return;
    if(window.KrakenWallArt?.keyDown(e))return;
    if(window.KrakenBeta02?.keyDown(e))return;
    if (e.code === "Space") {
      space = true;
      e.preventDefault();
    }
    if (e.key === "Escape") {
      asset = sel = null;
      active("select");
      draw();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "z") {
      e.preventDefault();
      back();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "y") {
      e.preventDefault();
      forward();
    }
  };
  window.onkeyup = (e) => {
    if (e.code === "Space") space = false;
  };
  async function getAssets() {
    try {
      let r = await fetch("/api/assets");
      if (!r.ok) throw Error(r.status);
      assets = (await r.json()).assets || [];
      $("#assetStatus").textContent = `${assets.length} assets available`;
      showAssets();
    } catch (e) {
      $("#assetStatus").textContent = "Asset service unavailable";
      toast("Could not load assets: " + e.message, true);
    }
  }
  function showAssets() {
    // Two filters: the source (a kit, Battle Map Forge, a Dungeondraft pack...) and the kind of art,
    // sorted the same way for every source (see library-sort.js).
    const L = window.KrakenLibrarySort, box = $("#categories"), pick = $("#assetSource");
    const sources = new Map();
    for (const v of assets) { const k = L.sourceOf(v); sources.set(k, (sources.get(k) || 0) + 1); }
    let source = box.dataset.source || "";
    if (source && !sources.has(source)) source = box.dataset.source = "";
    pick.replaceChildren(new Option(`All sources (${assets.length})`, ""),
      ...[...sources].sort((x, y) => L.sourceLabel(x[0]).localeCompare(L.sourceLabel(y[0]))).map(([k, n]) => new Option(`${L.sourceLabel(k)} (${n})`, k)));
    pick.value = source;
    const pool = assets.filter((v) => !source || L.sourceOf(v) === source), counts = new Map();
    for (const v of pool) { const k = L.kindOf(v); counts.set(k, (counts.get(k) || 0) + 1); }
    let q = $("#assetSearch").value.toLowerCase(),
      cat = box.dataset.active || "All";
    if (cat !== "All" && !counts.has(cat)) cat = box.dataset.active = "All";
    const cats = ["All", ...L.KINDS.filter((k) => counts.has(k))];
    box.innerHTML = cats
      .map(
        (v) =>
          `<button data-c="${esc(v)}" class="${v === cat ? "active" : ""}">${esc(v)} <small>${v === "All" ? pool.length : counts.get(v)}</small></button>`,
      )
      .join("");
    $("#categories")
      .querySelectorAll("button")
      .forEach(
        (b) =>
          (b.onclick = () => {
            $("#categories").dataset.active = b.dataset.c;
            showAssets();
          }),
      );
    let a = pool.filter(v=>window.KrakenBeta02?.assetVisible(v)!==false).filter(
      (v) =>
        (cat === "All" || L.kindOf(v) === cat) &&
        (v.name+" "+(v.tags||[]).join(" ")).toLowerCase().includes(q),
    ).sort(L.byName);
    $("#assetStatus").textContent = a.length === assets.length ? `${assets.length} assets available` : `${a.length} of ${assets.length} assets shown`;
    $("#assetGrid").innerHTML = a
      .map(
        (v) =>
          `<button class="asset ${v.id === asset ? "selected" : ""}" data-id="${esc(v.id)}"><img loading="lazy" src="/api/asset/${encodeURIComponent(v.id)}?thumb=1"><span>${esc(v.name)}</span></button>`,
      )
      .join("");
    $("#assetGrid")
      .querySelectorAll(".asset")
      .forEach(
        (b) =>
          (b.onclick = () => {
            asset = b.dataset.id;
            im(asset);
            window.KrakenBeta02?.assetPicked(asset);
            switchMode("paint", false);
            active("select");
            showAssets();
            window.KrakenWallArt?.assetPicked(asset);
          }),
      );
  }
  $("#assetSource").onchange = (e) => {
    $("#categories").dataset.source = e.target.value;
    showAssets();
  };
  async function post(url, body) {
    let r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw Error((await r.text()) || r.status);
    return r;
  }
  function down(b, n) {
    let a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = n;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function flat() {
    let os = p.objects.filter((o) => o.visible !== false && !window.KrakenLayers?.hidden(o));
    await Promise.all(
      os.map(
        (o) =>
          new Promise((yes, no) => {
            let q = im(o.assetId);
            if (q.complete)
              return q.naturalWidth
                ? yes()
                : no(Error("Image failed: " + o.name));
            q.onload = yes;
            q.onerror = () => no(Error("Image failed: " + o.name));
          }),
      ),
    );
    let q = document.createElement("canvas"),
      g = q.getContext("2d");
    q.width = p.width;
    q.height = p.height;
    g.fillStyle = p.background;
    g.fillRect(0, 0, q.width, q.height);
    os.forEach((o) => {
      let a = im(o.assetId);
      g.save();
      g.translate(o.x + o.width / 2, o.y + o.height / 2);
      g.rotate(((o.rotation || 0) * Math.PI) / 180);
      g.globalAlpha = o.opacity ?? 1;
      g.drawImage(a, -o.width / 2, -o.height / 2, o.width, o.height);
      g.restore();
    });
    return q.toDataURL("image/png");
  }

  function validProject(value) {
    if (
      !value ||
      value.version !== 1 ||
      !Array.isArray(value.objects) ||
      !Array.isArray(value.walls)
    )
      throw Error("Not a supported Kraken map project.");
    const v = JSON.parse(JSON.stringify(value));
    function check(obj, key, lo = -1000000, hi = 1000000, def) {
      if (obj[key] === undefined && def !== undefined) obj[key] = def;
      if (
        typeof obj[key] !== "number" ||
        !Number.isFinite(obj[key]) ||
        obj[key] < lo ||
        obj[key] > hi
      )
        throw Error(key + " must be between " + lo + " and " + hi + ".");
    }
    check(v, "width", 100, 16384);
    check(v, "height", 100, 16384);
    check(v, "grid", 5, 1000);
    if (
      !Number.isInteger(v.width) ||
      !Number.isInteger(v.height) ||
      v.width * v.height > 120000000
    )
      throw Error("Use whole-pixel map dimensions up to 120 million pixels.");
    if (!/^#[0-9a-f]{6}$/i.test(v.background))
      throw Error("Choose a valid background color.");
    v.name = String(v.name || "Untitled Map").slice(0, 120);
    for (const key of ["objects", "walls", "lights", "effects"]) {
      v[key] ??= [];
      if (!Array.isArray(v[key]) || v[key].length > (key === "walls" ? 50000 : 5000))
        throw Error("Invalid or too many " + key + ".");
      v[key].forEach((o) => {
        if (!o || typeof o !== "object") throw Error("Invalid map item.");
        o.id = String(o.id || id("item"));
      });
    }
    for (const o of v.objects) {
      if (typeof o.assetId !== "string")
        throw Error("An artwork reference is missing.");
      o.name = String(o.name || "Artwork");
      check(o, "x");
      check(o, "y");
      check(o, "width", 1, 100000);
      check(o, "height", 1, 100000);
      check(o, "rotation", -1000000, 1000000, 0);
    }
    v.walls = v.walls.map((o) => window.KrakenLOS.normalizeWall(o));
    v.regions ??= [];
    if (!Array.isArray(v.regions) || v.regions.length > 2000) throw Error("Invalid or too many traps and regions.");
    v.regions = v.regions.map((r) => window.KrakenRegions.normalize(r));
    if (v.gridOffset) v.gridOffset = { x: Number(v.gridOffset.x) || 0, y: Number(v.gridOffset.y) || 0 };
    for (const o of v.lights) {
      check(o, "x");
      check(o, "y");
      check(o, "bright", 0, 10000);
      check(o, "dim", 0.01, 10000);
      if (o.dim < o.bright)
        throw Error("Dim radius must be at least the bright radius.");
      if (!/^#[0-9a-f]{6}$/i.test(o.color)) throw Error("Invalid light color.");
    }
    if (window.KrakenLighting) {
      v.lights = v.lights.map((o) => window.KrakenLighting.normalizeLight(o));
      const ambient = window.KrakenLighting.normalizeAmbient(v.ambient);
      if (ambient) v.ambient = ambient; else delete v.ambient;
    }
    v.effects = v.effects.map((o) => window.KrakenWeather.normalize(o, v.width, v.height));
    return v;
  }
  function deleteSelected() {
    if(window.KrakenBeta02?.deleteSelection())return;
    const f = found();
    if (!f[0]) return;
    snap();
    p[f[1]].splice(p[f[1]].indexOf(f[0]), 1);
    sel = null;
    store();
    draw();
  }
  function switchMode(next, resetAsset = true) {
    mode = next;
    window.KrakenBeta02?.modeChanged(next);
    window.KrakenWallArt?.modeChanged(next);
    window.KrakenLOS?.modeChanged(next);
    window.KrakenGrid?.modeChanged(next);
    window.KrakenRegions?.modeChanged(next);
    window.KrakenWeather?.modeChanged(next);
    window.KrakenPlay?.modeChanged(next);
    window.KrakenLighting?.modeChanged(next);
    if (resetAsset) asset = null;
    document
      .querySelectorAll("[data-mode]")
      .forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    document
      .querySelectorAll("[data-panel]")
      .forEach((panel) => (panel.hidden = panel.dataset.panel !== mode));
    $("#modeLabel").textContent = {
      view: "VIEW",
      layers: "LAYERS",
      paint: "PAINT · ARTWORK",
      fx: "EFFECTS",
      los: "WALLS & DOORS · LINE OF SIGHT",
      lighting: "LIGHTING",
      grid: "GRID & MAP SIZE",
      regions: "TRAPS & REGIONS",
      play: "PLAY TEST",
      vision: "PLAYER VISION",
    }[mode];
    active(
      mode === "lighting"
            ? "light"
            : "select",
    );
    if (mode === "grid" || mode === "view") sel = null;
    if (mode === "paint") document.body.classList.remove("library-hidden");
    showAssets();
    draw();
  }
  $("#refreshAssets").onclick = getAssets;
  $("#assetSearch").oninput = showAssets;
  document.querySelectorAll("[data-tool]").forEach(
    (b) =>
      (b.onclick = () => {
        asset = null;
        active(b.dataset.tool);
        showAssets();
      }),
  );
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) => (b.onclick = () => switchMode(b.dataset.mode)));
  $("#railFit").onclick = fit;
  $("#railDelete").onclick = deleteSelected;
  $("#eraseTool").onclick = deleteSelected;
  $("#panTool").onclick = () => {
    asset = null;
    active("pan");
  };
  $("#drawTool").onclick = () => switchMode(mode === "fx" ? "fx" : "los");
  $("#addAsset").onclick = () => switchMode("paint");
  $("#libraryBtn").onclick = () => {
    document.body.classList.toggle("library-hidden");
    fit();
  };
  $("#previewLighting").onchange = draw;
  $("#snapToggle").onchange = draw;
  $("#undoBtn").onclick = back;
  $("#redoBtn").onclick = forward;
  $("#newBtn").onclick = () => {
    if (window.KrakenShell) return window.KrakenShell.newBlank();
    if (
      dirty &&
      !confirm(
        "Start a new map? Save JSON or Portable ZIP first to keep your changes.",
      )
    )
      return;
    p = blank();
    asset = sel = null;
    undo = [];
    redo = [];
    $("#projectName").value = p.name;
    store();
    switchMode("view");
    fit();
  };
  $("#projectName").onchange = () => {
    snap();
    p.name = $("#projectName").value || "Untitled Map";
    store();
  };
  function filename(ext) {
    return (p.name || "Kraken Map").replace(/[<>:"/\\|?*]/g, "-") + ext;
  }
  $("#saveBtn").onclick = () => {
    p.name = $("#projectName").value || "Untitled Map";
    down(
      new Blob([JSON.stringify(p, null, 2)], { type: "application/json" }),
      filename(".json"),
    );
    dirty = false;
    $("#savedState").textContent = "SAVED";
    window.KrakenShell?.markSaved();
  };
  $("#openBtn").onclick = () => $("#fileInput").click();
  $("#fileInput").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      let candidate;
      if (f.name.toLowerCase().endsWith(".zip")) {
        const r = await fetch("/api/import", { method: "POST", body: f });
        if (!r.ok) throw Error((await r.json()).error);
        const data = await r.json();
        candidate = validProject(data.project || data);
        await getAssets();
      } else candidate = validProject(JSON.parse(await f.text()));
      if (window.KrakenShell) {
        window.KrakenShell.openDocument(candidate);
        toast("Opened " + candidate.name);
        e.target.value = "";
        return;
      }
      p = candidate;
      asset = sel = null;
      undo = [];
      redo = [];
      imgs.clear();
      $("#projectName").value = p.name;
      store();
      switchMode("view");
      fit();
      toast("Project opened");
    } catch (error) {
      toast("Could not open project: " + error.message, true);
    }
    e.target.value = "";
  };
  $("#portableBtn").onclick = async () => {
    try {
      const r = await post("/api/portable", { project: validProject(p) });
      down(await r.blob(), filename(".kraken.zip"));
      toast("Portable project saved with its artwork");
    } catch (e) {
      toast("Portable export failed: " + e.message, true);
    }
  };

  window.addEventListener("keydown", (e) => {
    if (
      e.key === "Delete" && !e.defaultPrevented &&
      !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
    )
      deleteSelected();
  });
  window.KrakenStudio={
    get project(){return p},get assets(){return assets},get selected(){return sel},set selected(value){sel=value},
    get asset(){return asset},set asset(value){asset=value},get tool(){return tool},get zoom(){return z},get mode(){return mode},
    snapshot:snap,save:store,draw,fit,point:pt,snap:grid,image:im,toast,active,switchMode,refreshAssets:getAssets,
    addAsset(value){if(!assets.some(a=>a.id===value.id))assets.push(value);showAssets()},
    showAssets,flat,validate:validProject,
    replace(value){const next=validProject(value);snap();p=next;sel=asset=null;$('#projectName').value=p.name;store();draw()},
    blank,
    getDocument(){return {project:p,undo,redo,dirty,view:{z,pan:{...pan}}}},
    setDocument(doc){p=doc.project;undo=doc.undo||[];redo=doc.redo||[];dirty=!!doc.dirty;sel=asset=null;
      $('#projectName').value=p.name;$('#savedState').textContent=dirty?'UNSAVED':'SAVED';
      if(doc.view){z=doc.view.z;pan={...doc.view.pan};draw()}else fit();layers()},
    openDocument(value){if(window.KrakenShell)return window.KrakenShell.openDocument(value);this.replace(value);fit()},
    markSaved(){dirty=false;$('#savedState').textContent='SAVED';window.KrakenShell?.markSaved()},
    get dirty(){return dirty},
    select(value){sel=value;asset=null;active('select');draw()},
  };
  try {
    const saved = JSON.parse(localStorage.getItem("kraken-map-autosave"));
    if (saved) {
      p = validProject(saved);
      dirty = true;
    }
  } catch {
    toast("Previous autosave could not be restored.", true);
  }
  $("#projectName").value = p.name;
  draw();
  getAssets();
  switchMode("view");
  requestAnimationFrame(fit);
})();
