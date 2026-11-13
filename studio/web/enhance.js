/* Small integration additions kept separate from the canvas editor. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const say = (m, bad = false) => {
    const t = $("#toast");
    t.textContent = m;
    t.style.borderColor = bad ? "#bd6057" : "";
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2800);
  };
  async function updatePackNote() {
    try {
      const r = await fetch("/api/assets");
      if (!r.ok) return;
      const data = await r.json(),
        count = Number(data.subscriptionPacks) || 0,
        note = document.querySelector(".pack-note");
      if (note)
        note.innerHTML = `<b>Starter pack</b><br>${count ? `${count} subscription packs detected` : "No subscription packs available"}<br><span>${count ? "Subscription art access is being prepared." : "Portable bundle uses its included starter art."}</span>`;
    } catch {}
  }
  updatePackNote();
  document.querySelectorAll("button[title]").forEach((b) => {
    if (!b.hasAttribute("aria-label")) b.setAttribute("aria-label", b.title);
  });
  $("#artBtn").addEventListener("click", () => $("#artInput").click());
  $("#artInput").addEventListener("change", async (ev) => {
    const files = [...ev.target.files];
    if (!files.length) return;
    try {
      for (const file of files) {
        const r = await fetch(
          "/api/upload?name=" + encodeURIComponent(file.name),
          {
            method: "POST",
            headers: {
              "Content-Type": file.type || "application/octet-stream",
            },
            body: file,
          },
        );
        if (!r.ok) throw Error((await r.text()) || r.status);
      }
      await window.KrakenStudio.refreshAssets();
      $("#categories").dataset.active = "Imported artwork";
      window.KrakenStudio.showAssets();
      window.KrakenStudio.toast(
        `Added ${files.length} picture${files.length === 1 ? "" : "s"} to the library (shown now under "Imported artwork"). Click one, then click the map to place it. To open a picture as a whole map, use New > Map from a picture.`,
      );
    } catch (e) {
      say("Artwork import failed: " + e.message, true);
    }
    ev.target.value = "";
  });
  $("#demoBtn").addEventListener("click", async () => {
    try {
      const r = await fetch("/api/demo");
      if (!r.ok) throw Error((await r.text()) || r.status);
      const data = await r.json(),
        project = data.project || data;
      const file = new File([JSON.stringify(project)], "kraken-demo.json", {
          type: "application/json",
        }),
        dt = new DataTransfer();
      dt.items.add(file);
      const input = $("#fileInput");
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      say("Demo map loaded");
    } catch (e) {
      say("Could not load demo: " + e.message, true);
    }
  });
})();
