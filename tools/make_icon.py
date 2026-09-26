"""
Icon generator for Mirai RPG.

Replaces the flat gold "M" with a faceted 3D crystal — the character's
stat core. The cut is a real brilliant-cut construction (table, crown
facets, girdle, pavilion converging on a culet) so the facets shade
consistently and the mark reads as a solid object rather than a flat
glyph, at every size a launcher will render it.

Rendered at 4x and downsampled with LANCZOS: Pillow has no GPU path, and
supersampling is what keeps the facet edges from looking chewed.

Outputs
  assets/icon.png                 1024 legacy square, composition baked in
  assets/icon-round.png           1024 legacy round
  assets/adaptive-icon.png        1024 foreground, art inside the 66% safe zone
  assets/adaptive-icon-round.png  1024 foreground for the round variant
  assets/adaptive-icon-background.png  1024 full-bleed gradient
  assets/splash-icon.png          1024 transparent, mark centred
  assets/favicon.png              64

Usage:  python tools/make_icon.py
"""

from __future__ import annotations

import math
import os

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")

SS = 4  # supersampling factor
SIZE = 1024

# --- palette -----------------------------------------------------------------
# Taken from the app's own theme so the icon, the radar chart and the
# accent colour are literally the same values.
VOID_TOP = (23, 26, 43)
VOID_BOTTOM = (9, 10, 18)
GLOW = (124, 58, 237)      # catDiscipline / violet
GLOW_SOFT = (167, 139, 250)
CORE = (245, 165, 36)      # accent amber
RIM = (56, 189, 248)       # catKnowledge blue

TABLE_LIGHT = (221, 214, 254)
TABLE = (196, 181, 253)
CROWN_LIGHT = (167, 139, 250)
CROWN = (139, 92, 246)
CROWN_DARK = (109, 40, 217)
PAVILION = (76, 29, 149)
PAVILION_DARK = (46, 16, 101)
PAVILION_DEEP = (30, 10, 70)
SPECULAR = (255, 255, 255)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def vertical_gradient(size, top, bottom):
    img = Image.new("RGB", (1, size))
    px = img.load()
    for y in range(size):
        px[0, y] = lerp(top, bottom, y / max(1, size - 1))
    return img.resize((size, size), Image.BILINEAR)


def radial_glow(size, center, radius, color, strength=1.0):
    """Soft radial light, drawn small and upscaled: cheap and smooth."""
    small = max(8, size // 8)
    layer = Image.new("L", (small, small), 0)
    d = ImageDraw.Draw(layer)
    steps = 42
    for i in range(steps, 0, -1):
        t = i / steps
        r = radius * small * t / size
        alpha = int(255 * strength * (1 - t) ** 2.1)
        d.ellipse(
            [center[0] * small / size - r, center[1] * small / size - r,
             center[0] * small / size + r, center[1] * small / size + r],
            fill=alpha,
        )
    layer = layer.filter(ImageFilter.GaussianBlur(small / 22)).resize((size, size), Image.BICUBIC)
    out = Image.new("RGB", (size, size), color)
    return out, layer


def octagon(cx, cy, rx, ry, rotate=0.0):
    pts = []
    for i in range(8):
        a = rotate + i * math.pi / 4
        pts.append((cx + rx * math.cos(a), cy + ry * math.sin(a)))
    return pts


def crystal(canvas_size, scale, cx, cy, tilt=0.0):
    """
    Faceted crystal shard, drawn straight on.

    A brilliant cut seen from the side reads as a white blob with a dot in
    it once it is down to launcher size. A vertical shard with wedge facets
    radiating from the top point and converging on the bottom one keeps its
    silhouette and its internal structure at 48px, which is the only size
    that actually matters. Coordinates are normalised to a -1..1 box and
    scaled, so one definition serves the 1024px icon and the 64px favicon.

    `tilt` rotates the light direction, which is what makes the left/right
    facet pairs read as different planes instead of one flat colour.
    """
    s = canvas_size
    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer, "RGBA")

    def P(x, y):
        """Normalised shard space -> canvas pixels."""
        px = cx + x * 250 * scale
        py = cy + y * 300 * scale
        if tilt:
            ca, sa = math.cos(tilt), math.sin(tilt)
            dx, dy = px - cx, py - cy
            px, py = cx + dx * ca - dy * sa, cy + dx * sa + dy * ca
        return (px, py)

    # Silhouette
    T = (0.00, -1.00)   # top point
    UR = (0.54, -0.60)
    R = (1.00, -0.06)
    LR = (0.60, 0.56)
    B = (0.00, 1.00)    # bottom point
    LL = (-0.60, 0.56)
    L = (-1.00, -0.06)
    UL = (-0.54, -0.60)
    # Shoulder ring and the two internal splits
    mL, mR = (-0.33, -0.02), (0.33, -0.02)
    nL, nR = (-0.26, 0.50), (0.26, 0.50)

    def shade(base, amount):
        t = abs(amount)
        target = SPECULAR if amount > 0 else (0, 0, 0)
        return lerp(base, target, t * 0.8)

    # --- contact shadow, tight and directly under the point
    shadow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow, "RGBA")
    sw, sh = 150 * scale, 22 * scale
    py = cy + 300 * scale
    sd.ellipse([cx - sw, py - sh * 0.3, cx + sw, py + sh * 1.6], fill=(0, 0, 0, 165))
    shadow = shadow.filter(ImageFilter.GaussianBlur(20 * scale))
    layer.alpha_composite(shadow)

    # --- lower half first: converges on the bottom point
    lower = [
        ([B, LL, nL], shade(PAVILION_DARK, -0.06)),
        ([B, nL, nR], shade(PAVILION, 0.10)),
        ([B, nR, LR], shade(PAVILION, 0.26)),
        ([B, LR, R], shade(PAVILION_DARK, 0.10)),
    ]
    for pts, col in lower:
        d.polygon([P(*p) for p in pts], fill=col + (255,))

    # --- side shoulders: the wedges between the mL/nL spine and the
    # silhouette. The upper, middle and lower groups all stop at that spine,
    # so without these the gem has two transparent holes down its sides.
    for pts, col in (
        ([mL, UL, LL, nL], shade(PAVILION_DARK, 0.04)),
        ([UL, L, LL], shade(PAVILION_DEEP, 0.10)),
        ([mR, UR, LR, nR], shade(CROWN_DARK, 0.14)),
        ([UR, R, LR], shade(CROWN, 0.20)),
    ):
        d.polygon([P(*p) for p in pts], fill=col + (255,))

    # --- middle band between the shoulder and the lower split. Without it
    # the region between mL/mR and nL/nR is a transparent wedge, which is
    # what made the gem look like it had two holes punched through it.
    mid = (0.0, 0.26)
    for pts, col in (
        ([mL, mR, mid], shade(CROWN, 0.02)),
        ([mL, mid, nL], shade(PAVILION, -0.02)),
        ([mR, mid, nR], shade(PAVILION, 0.16)),
        # The keel between the lower split and the band above it; the
        # lower group's triangle only reaches nL/nR, so this closes the
        # last gap on the vertical axis.
        ([nL, nR, mid], shade(PAVILION_DARK, 0.14)),
    ):
        d.polygon([P(*p) for p in pts], fill=col + (255,))

    # --- upper half: radiates from the top point
    upper = [
        ([T, UL, mL], shade(CROWN_DARK, 0.04)),
        ([T, mL, (0.0, -0.02)], shade(CROWN, 0.10)),
        ([T, (0.0, -0.02), mR], shade(CROWN_LIGHT, 0.20)),
        ([T, mR, UR], shade(CROWN_LIGHT, 0.38)),
        ([T, UR, R], shade(GLOW_SOFT, 0.14)),
    ]
    for pts, col in upper:
        d.polygon([P(*p) for p in pts], fill=col + (255,))

    # --- internal edges: a hairline of light where two facets meet is what
    # sells the cut. Without it the facets read as one blob.
    edges = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ed = ImageDraw.Draw(edges, "RGBA")
    lw = max(1, int(1.8 * scale))
    for a, b in [(T, mL), (T, mR), (mL, mR), (mL, nL), (mR, nR), (nL, nR), (nL, B), (nR, B), (mL, B), (mR, B), (mL, (0.0, 0.50)), (mR, (0.0, 0.50))]:
        ed.line([P(*a), P(*b)], fill=TABLE_LIGHT + (70,), width=lw)
    layer.alpha_composite(edges)

    # --- silhouette rim: bright along the lit side, dark along the other
    outline = [T, UR, R, LR, B, LL, L, UL, T]
    rim = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rim, "RGBA")
    rd.line([P(*p) for p in outline], fill=RIM + (165,), width=max(1, int(3.0 * scale)), joint="curve")
    rim = rim.filter(ImageFilter.GaussianBlur(1.6 * scale))
    layer.alpha_composite(rim)

    # --- specular streak on the lit upper-left edge
    spec = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    sp = ImageDraw.Draw(spec, "RGBA")
    sp.line([P(*UL), P(*L)], fill=SPECULAR + (135,), width=max(1, int(3.4 * scale)))
    sp.line([P(*T), P(*UL)], fill=SPECULAR + (110,), width=max(1, int(2.6 * scale)))
    spec = spec.filter(ImageFilter.GaussianBlur(2.4 * scale))
    layer.alpha_composite(spec)

    # --- core: a small amber spark at the widest point, the "power" of the gem
    core_r = 26 * scale
    core_c = P(0.0, -0.02)
    core = octagon(core_c[0], core_c[1], core_r, core_r * 1.15, tilt)
    d.polygon(core, fill=CORE + (255,))
    halo, halo_mask = radial_glow(s, core_c, core_r * 5.0, CORE, 0.5)
    tinted = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    tinted.paste(halo, (0, 0), halo_mask)
    combined = Image.alpha_composite(tinted, layer)
    layer.paste(combined, (0, 0))

    return layer


def build_legacy(path, round_shape=False, scale=0.92, plate=True, tilt=0.0):
    s = SIZE * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))

    if plate:
        plate_img = vertical_gradient(s, VOID_TOP, VOID_BOTTOM).convert("RGBA")
        mask = Image.new("L", (s, s), 0)
        md = ImageDraw.Draw(mask)
        if round_shape:
            md.ellipse([0, 0, s - 1, s - 1], fill=255)
        else:
            md.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.225), fill=255)
        img.paste(plate_img, (0, 0), mask)

    # Ambient violet light behind the mark.
    glow, glow_mask = radial_glow(s, (s / 2, s * 0.46), s * 0.52, GLOW, 0.5)
    tint = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    tint.paste(glow, (0, 0), glow_mask)
    base_mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(base_mask).rounded_rectangle(
        [0, 0, s - 1, s - 1], radius=int(s * (0.5 if round_shape else 0.225)), fill=255
    ) if plate else ImageDraw.Draw(base_mask).ellipse([0, 0, s - 1, s - 1], fill=255)
    img.paste(tint, (0, 0), Image.composite(glow_mask, Image.new("L", (s, s), 0), base_mask))

    gem = crystal(s, scale * SS, s / 2, s * 0.5, tilt)
    img.alpha_composite(gem)

    out = img.resize((SIZE, SIZE), Image.LANCZOS)
    out.save(path, "PNG", optimize=True)
    return out


def build_foreground(path, scale=0.80, tilt=0.0):
    """Adaptive foreground: transparent, art inside the 66% safe zone."""
    s = SIZE * SS
    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gem = crystal(s, scale * SS, s / 2, s / 2, tilt)
    layer.alpha_composite(gem)
    out = layer.resize((SIZE, SIZE), Image.LANCZOS)
    out.save(path, "PNG", optimize=True)
    return out


def build_background(path):
    s = SIZE * SS
    img = vertical_gradient(s, (26, 29, 48), (8, 9, 16)).convert("RGBA")
    glow, mask = radial_glow(s, (s / 2, s * 0.46), s * 0.62, GLOW, 0.55)
    img.paste(glow, (0, 0), mask)
    out = img.resize((SIZE, SIZE), Image.LANCZOS).convert("RGB")
    out.save(path, "PNG", optimize=True)
    return out


def build_splash(path, scale=0.58, tilt=0.0):
    s = SIZE * SS
    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gem = crystal(s, scale * SS, s / 2, s * 0.5, tilt)
    layer.alpha_composite(gem)
    out = layer.resize((SIZE, SIZE), Image.LANCZOS)
    out.save(path, "PNG", optimize=True)
    return out


def build_favicon(path):
    base = build_favicon_source()
    out = base.resize((64, 64), Image.LANCZOS)
    out.save(path, "PNG", optimize=True)


def build_favicon_source():
    s = SIZE * SS
    img = vertical_gradient(s, VOID_TOP, VOID_BOTTOM).convert("RGBA")
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.225), fill=255)
    img.paste(vertical_gradient(s, VOID_TOP, VOID_BOTTOM).convert("RGBA"), (0, 0), mask)
    img.alpha_composite(crystal(s, 0.36 * SS, s / 2, s / 2))
    return img.resize((SIZE, SIZE), Image.LANCZOS)


def main():
    os.makedirs(ASSETS, exist_ok=True)
    build_legacy(os.path.join(ASSETS, "icon.png"), tilt=0.0)
    build_legacy(os.path.join(ASSETS, "icon-round.png"), round_shape=True, tilt=0.0)
    build_foreground(os.path.join(ASSETS, "adaptive-icon.png"), tilt=0.0)
    build_foreground(os.path.join(ASSETS, "adaptive-icon-round.png"), tilt=0.0)
    build_background(os.path.join(ASSETS, "adaptive-icon-background.png"))
    build_splash(os.path.join(ASSETS, "splash-icon.png"), tilt=0.0)
    build_favicon(os.path.join(ASSETS, "favicon.png"))
    for name in sorted(os.listdir(ASSETS)):
        p = os.path.join(ASSETS, name)
        if os.path.isfile(p):
            print(f"{name:34} {os.path.getsize(p):>8} bytes")


if __name__ == "__main__":
    main()
