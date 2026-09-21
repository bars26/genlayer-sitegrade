from PIL import Image, ImageDraw, ImageFont
import math

S, OUT = 4096, 1024
lerp = lambda a, b, t: a + (b - a) * t

bg = Image.new("RGB", (S, S))
px = bg.load()
c1, c2 = (8, 22, 30), (14, 70, 82)
for y in range(S):
    for x in range(S):
        t = (x + y) / (2 * S)
        px[x, y] = tuple(int(lerp(c1[i], c2[i], t)) for i in range(3))
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * 0.22), fill=255)
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
img.paste(bg, (0, 0), mask)
d = ImageDraw.Draw(img)

# gauge: 270-degree arc, coloured F -> A (red, orange, yellow, lime, green)
cx = cy = S / 2
r_out, r_in = S * 0.36, S * 0.28
stops = [(239, 68, 68), (249, 115, 22), (250, 204, 21), (163, 230, 53), (34, 197, 94)]
start, sweep = 135, 270
segs = 200
for i in range(segs):
    t = i / segs
    k = t * (len(stops) - 1)
    a, b = stops[int(k)], stops[min(int(k) + 1, len(stops) - 1)]
    f = k - int(k)
    col = tuple(int(lerp(a[j], b[j], f)) for j in range(3)) + (255,)
    a0 = start + sweep * t
    a1 = start + sweep * (i + 1.6) / segs
    d.pieslice((cx - r_out, cy - r_out, cx + r_out, cy + r_out), a0, a1, fill=col)
d.ellipse((cx - r_in, cy - r_in, cx + r_in, cy + r_in), fill=(10, 30, 40, 255))
# cut the bottom gap flat so the arc reads as a gauge
for ang in (start, start + sweep):
    rad = math.radians(ang)
    for rr in (r_out, r_in):
        x, y = cx + rr * math.cos(rad), cy + rr * math.sin(rad)
    mid = (r_out + r_in) / 2
    x, y = cx + mid * math.cos(rad), cy + mid * math.sin(rad)
    d.ellipse((x - (r_out - r_in) / 2, y - (r_out - r_in) / 2, x + (r_out - r_in) / 2, y + (r_out - r_in) / 2),
              fill=stops[0] if ang == start else stops[-1])

font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", int(S * 0.34), index=1)
d.text((cx, cy - S * 0.01), "A", font=font, fill=(240, 253, 250, 255), anchor="mm")

img = img.resize((OUT, OUT), Image.LANCZOS)
img.save("assets/sitegrade-logo.png")
