"""Draws the Next Step icon (a staircase on a sage tile) as PNGs and a Windows .ico, no dependencies."""
import struct, sys, zlib, os

BG = (0x58, 0x80, 0x6a); FG = (0xff, 0xff, 0xff)

def inside_tile(x, y, r=0.22):
    # rounded square covering 0..1
    cx = min(max(x, r), 1 - r); cy = min(max(y, r), 1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r

def on_stairs(x, y):
    # three steps rising to the right, plus a dot "you are here" on the top step
    steps = [(0.20, 0.62, 0.40, 0.80), (0.40, 0.46, 0.60, 0.80), (0.60, 0.30, 0.80, 0.80)]
    if any(x0 <= x <= x1 and y0 <= y <= y1 for x0, y0, x1, y1 in steps):
        return True
    return False

def render(n, ss=4):
    rows = []
    for py in range(n):
        row = bytearray()
        for px in range(n):
            a = f = 0
            for sy in range(ss):
                for sx in range(ss):
                    x = (px + (sx + .5) / ss) / n; y = (py + (sy + .5) / ss) / n
                    if inside_tile(x, y):
                        a += 1
                        if on_stairs(x, y): f += 1
            t = ss * ss
            if a == 0: row += bytes(4); continue
            k = f / a
            col = [round(BG[i] * (1 - k) + FG[i] * k) for i in range(3)]
            row += bytes(col + [round(255 * a / t)])
        rows.append(bytes(row))
    return rows

def png(rows, n):
    raw = b"".join(b"\0" + r for r in rows)
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", n, n, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")

out = sys.argv[1]; os.makedirs(out, exist_ok=True)
pngs = {}
for n in (16, 32, 48, 128, 192, 256, 512):
    pngs[n] = png(render(n, 4 if n <= 256 else 2), n)
    open(os.path.join(out, f"icon-{n}.png"), "wb").write(pngs[n])
sizes = (16, 32, 48, 256)
hdr = struct.pack("<HHH", 0, 1, len(sizes)); off = 6 + 16 * len(sizes); ents = b""; data = b""
for n in sizes:
    d = pngs[n]; ents += struct.pack("<BBBBHHII", n % 256, n % 256, 0, 0, 1, 32, len(d), off + len(data)); data += d
open(os.path.join(out, "icon.ico"), "wb").write(hdr + ents + data)
