// The download buttons point at the newest release's files, and the hero names its version.
// Without the GitHub API (offline, rate limit) they stay on the releases page.
(async () => {
  try {
    const r = await fetch("https://api.github.com/repos/krakenunbound/maelstrom-vtt/releases?per_page=1");
    if (!r.ok) return;
    const [release] = await r.json();
    if (!release) return;
    for (const a of document.querySelectorAll("[data-asset]")) {
      const asset = release.assets.find((x) => x.name.endsWith(a.dataset.asset));
      if (asset) a.href = asset.browser_download_url;
    }
    const v = document.querySelector("[data-version]");
    v.textContent = "";
    v.append("Latest: ");
    const link = document.createElement("a");
    link.href = release.html_url;
    link.textContent = release.name || release.tag_name;
    v.append(link);
  } catch {}
})();

// Screenshots open full size in a dialog (Esc, the × or a click outside closes it).
const box = document.querySelector(".lightbox");
for (const b of document.querySelectorAll("[data-full]")) {
  b.addEventListener("click", () => {
    box.querySelector("img").src = b.dataset.full;
    box.querySelector("img").alt = b.querySelector("img").alt;
    box.querySelector("p").textContent = b.dataset.caption;
    box.showModal();
  });
}
// closedby="any" is not in every browser yet: close on a backdrop click by hand there.
if (!("closedBy" in HTMLDialogElement.prototype)) {
  box.addEventListener("click", (e) => {
    if (e.target !== box) return;
    const r = box.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) box.close();
  });
}
