"""Animated portraits and tokens for Kraken (looping WebM), made through ComfyUI.

The GM's Wan 2.2 first/last-frame loop workflow (ComfyUI's API copy of
"Kraken i2v wan22 14b LOOP FAST": lightx2v 4 steps, 16 fps) is given the same
portrait as its first and its last frame, so the clip ends where it began and
loops with no jump. The square portrait is animated at 512 x 512; then
  <name>.webm        the portrait, VP9, 512 px
  <name> token.webm  the round token, VP9 with transparency (yuva420p), 256 px,
                     cut to a circle with a gold ring, as make-token.py's
are written beside the still ones in Kraken's assets folder.

python scripts/animate-portrait.py <portrait.png> "<what moves>" [seconds] [seed]
ComfyUI must be running (http://127.0.0.1:8188).
"""
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
import uuid
import urllib.parse

COMFY = "http://127.0.0.1:8188"
WORKFLOW = r"E:\AI_Art\ComfyUI\user\default\workflows\_last_loop_fast_api_prompt.json"
SIZE = 512
FPS = 16


def call(path, body=None, method=None):
    request = urllib.request.Request(COMFY + path, data=body, method=method or ("POST" if body is not None else "GET"))
    if body is not None and not isinstance(body, (bytes, bytearray)):
        request.data = json.dumps(body).encode()
        request.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(request, timeout=600) as response:
        raw = response.read()
    try:
        return json.loads(raw)
    except ValueError:
        return raw


def upload(path):
    boundary = uuid.uuid4().hex
    name = f"kraken-{uuid.uuid4().hex[:8]}.png"
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{name}\"\r\nContent-Type: image/png\r\n\r\n").encode() + open(path, "rb").read() + f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n--{boundary}--\r\n".encode()
    request = urllib.request.Request(COMFY + "/upload/image", data=body, method="POST")
    request.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read())["name"]


def animate(portrait, motion, seconds=3.0, seed=None):
    graph = json.load(open(WORKFLOW, encoding="utf-8"))
    graph = graph.get("prompt", graph)
    image = upload(portrait)
    # The picture, square, as both frames.
    graph["900"] = {"class_type": "LoadImage", "inputs": {"image": image}}
    graph["901"] = {"class_type": "ImageScale", "inputs": {"image": ["900", 0], "upscale_method": "lanczos", "width": SIZE, "height": SIZE, "crop": "center"}}
    loop = graph["1098"]["inputs"]
    loop.update({"start_image": ["901", 0], "end_image": ["901", 0], "width": SIZE, "height": SIZE})
    graph.pop("166", None)
    graph["1161"]["inputs"]["value"] = float(seconds)
    graph["1162"]["inputs"]["value"] = float(FPS)
    graph["1093"]["inputs"]["text"] = (
        "A painted fantasy character portrait that comes gently alive, a seamless loop. "
        f"{motion} The character keeps the same pose, face and size, centred, for the whole shot; "
        "fixed camera with the same framing throughout; the last frame matches the first."
    )
    graph["1086"]["inputs"]["noise_seed"] = int(seed if seed is not None else int(time.time()))
    graph["108"]["inputs"]["filename_prefix"] = "video/kraken-anim"
    queued = call("/prompt", {"prompt": graph, "client_id": "kraken"})
    if "prompt_id" not in queued:
        raise SystemExit(f"ComfyUI refused the workflow: {json.dumps(queued)[:800]}")
    prompt_id = queued["prompt_id"]
    started = time.time()
    while True:
        time.sleep(4)
        history = call(f"/history/{prompt_id}")
        if prompt_id in history:
            entry = history[prompt_id]
            status = entry.get("status", {})
            if status.get("status_str") == "error":
                raise SystemExit(f"ComfyUI failed: {json.dumps(status)[:1500]}")
            for output in entry.get("outputs", {}).values():
                for item in output.get("images", []) + output.get("videos", []) + output.get("gifs", []):
                    query = f"filename={urllib.parse.quote(item['filename'])}&subfolder={urllib.parse.quote(item.get('subfolder', ''))}&type={item.get('type', 'output')}"
                    data = call(f"/view?{query}")
                    target = os.path.join(tempfile.gettempdir(), item["filename"])
                    open(target, "wb").write(data)
                    return target, time.time() - started
        if time.time() - started > 1800:
            raise SystemExit("ComfyUI took more than 30 minutes")


def encode(clip, portrait):
    portrait = os.path.normpath(portrait)
    folder = os.path.dirname(portrait)
    name = os.path.splitext(os.path.basename(portrait))[0]
    still = os.path.join(folder, f"{name}.webm")
    # The portrait: VP9, 512, a constant quality that keeps it small; the loop's
    # duplicate last frame (it equals the first) dropped so the loop does not stutter.
    frames = int(subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", clip], capture_output=True, text=True).stdout.strip() or 0)
    trim = f"trim=end_frame={max(1, frames - 1)}," if frames > 2 else ""
    subprocess.run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-i", clip, "-vf", f"{trim}scale={SIZE}:{SIZE}:flags=lanczos,format=yuv420p", "-an", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "34", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", still], check=True)
    # The token: the face from the upper middle (as make-token.py), cut to a
    # circle with a gold ring, transparent outside, 256 px.
    parts = folder.split(os.sep)
    if "portraits" not in parts:
        raise SystemExit("The portrait must be in a portraits folder (its token goes in the tokens folder beside it).")
    parts[len(parts) - 1 - parts[::-1].index("portraits")] = "tokens"
    tokens = os.sep.join(parts)
    os.makedirs(tokens, exist_ok=True)
    token = os.path.join(tokens, f"{name}.webm")
    ring, mask = make_ring(256)
    crop = int(SIZE * 0.72)
    top = int(SIZE * 0.06)
    graph = (
        f"[0:v]{trim}crop={crop}:{crop}:{(SIZE - crop) // 2}:{top},scale=256:256:flags=lanczos,format=rgba[face];"
        "[2:v]format=gray[mask];"
        "[face][mask]alphamerge[cut];"
        "[cut][1:v]overlay=format=auto:shortest=1,format=yuva420p[out]"
    )
    subprocess.run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-i", clip, "-loop", "1", "-t", "60", "-i", ring, "-loop", "1", "-t", "60", "-i", mask, "-filter_complex", graph, "-map", "[out]", "-an", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "36", "-row-mt", "1", "-auto-alt-ref", "0", token], check=True)
    return still, token


def make_ring(size):
    """Two pictures for the token: the ring (transparent inside and out) and the
    mask (white disc: what of the face shows). Returns (ring, mask) paths."""
    from PIL import Image, ImageDraw
    big = size * 4
    ring = int(big * 0.035)
    rim = int(big * 0.012)
    art = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(art)
    draw.ellipse((rim, rim, big - rim, big - rim), outline=(28, 20, 12, 255), width=ring)
    draw.ellipse((ring - rim, ring - rim, big - ring + rim, big - ring + rim), outline=(201, 158, 82, 255), width=int(ring * 0.75))
    draw.ellipse((ring, ring, big - ring, big - ring), outline=(244, 214, 150, 255), width=max(2, rim // 2))
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).ellipse((rim, rim, big - rim, big - rim), fill=255)
    ring_path = os.path.join(tempfile.gettempdir(), f"kraken-ring-{size}.png")
    mask_path = os.path.join(tempfile.gettempdir(), f"kraken-mask-{size}.png")
    art.resize((size, size), Image.LANCZOS).save(ring_path)
    mask.resize((size, size), Image.LANCZOS).save(mask_path)
    return ring_path, mask_path


if __name__ == "__main__":
    import urllib.parse  # noqa: F401  (used above)

    portrait, motion = sys.argv[1], sys.argv[2]
    seconds = float(sys.argv[3]) if len(sys.argv) > 3 else 3.0
    seed = int(sys.argv[4]) if len(sys.argv) > 4 else None
    clip, took = animate(portrait, motion, seconds, seed)
    print(f"rendered {clip} in {took:.0f}s")
    still, token = encode(clip, portrait)
    print(f"portrait {still} {os.path.getsize(still) // 1024} KB")
    print(f"token {token} {os.path.getsize(token) // 1024} KB")
