"""Talk to the Kraken Agent Bridge (Fantasy Grounds) and capture FG's window.

Shared by export_book.py. The bridge's own MCP server module (fgu_mcp) sends
the commands; FG must be running a campaign with the bridge connected."""
import ctypes
import json
import os
import sys
from ctypes import wintypes
from pathlib import Path

FG_DATA = Path(os.environ.get("KRAKEN_FG_DATA") or Path(os.environ["APPDATA"]) / "SmiteWorks" / "Fantasy Grounds")
sys.path.insert(0, str(FG_DATA / "extensions" / "KrakenAgentBridge" / "server"))
import fgu_mcp  # noqa: E402

from PIL import Image  # noqa: E402  (pip install pillow)


def tool(name, args):
    """One bridge tool call, as an agent would make it (fgu_db_list, fgu_batch...)."""
    return fgu_mcp.call_tool(name, args)


def batch(steps, timeout=600):
    """Bridge commands in order, in one round trip; each step's data."""
    r = tool("fgu_batch", {"steps": steps, "timeout": timeout})
    if not r.get("ok"):
        raise RuntimeError(json.dumps(r)[:800])
    return [step["data"] for step in r["data"]["steps"]]


user32, gdi32 = ctypes.windll.user32, ctypes.windll.gdi32
user32.SetProcessDPIAware()


class _BIH(ctypes.Structure):
    _fields_ = [("biSize", wintypes.DWORD), ("biWidth", wintypes.LONG), ("biHeight", wintypes.LONG),
                ("biPlanes", wintypes.WORD), ("biBitCount", wintypes.WORD), ("biCompression", wintypes.DWORD),
                ("biSizeImage", wintypes.DWORD), ("biXPelsPerMeter", wintypes.LONG), ("biYPelsPerMeter", wintypes.LONG),
                ("biClrUsed", wintypes.DWORD), ("biClrImportant", wintypes.DWORD)]


def client_shot():
    """FG's client area as an image, in FG's own window coordinates. PrintWindow
    reads FG's own drawing, so other windows on top do not matter."""
    h = fgu_mcp.find_fg_window("host")
    if not h:
        raise RuntimeError("Fantasy Grounds window not found")
    r = wintypes.RECT()
    user32.GetWindowRect(h, ctypes.byref(r))
    w, hg = r.right - r.left, r.bottom - r.top
    hdc = user32.GetWindowDC(h)
    mdc = gdi32.CreateCompatibleDC(hdc)
    bmp = gdi32.CreateCompatibleBitmap(hdc, w, hg)
    gdi32.SelectObject(mdc, bmp)
    user32.PrintWindow(h, mdc, 2)
    bi = _BIH(ctypes.sizeof(_BIH), w, -hg, 1, 32, 0, 0, 0, 0, 0, 0)
    buf = ctypes.create_string_buffer(w * hg * 4)
    gdi32.GetDIBits(mdc, bmp, 0, hg, buf, ctypes.byref(bi), 0)
    img = Image.frombuffer("RGB", (w, hg), buf, "raw", "BGRX", 0, 1)
    gdi32.DeleteObject(bmp)
    gdi32.DeleteDC(mdc)
    user32.ReleaseDC(h, hdc)
    p = wintypes.POINT(0, 0)
    user32.ClientToScreen(h, ctypes.byref(p))
    cr = wintypes.RECT()
    user32.GetClientRect(h, ctypes.byref(cr))
    ox, oy = p.x - r.left, p.y - r.top
    return img.crop((ox, oy, ox + cr.right, oy + cr.bottom))
