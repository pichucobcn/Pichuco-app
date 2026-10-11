"""Genera ornamentos de fileteado porteño (SVG) en ocre y azul marino."""
import math, sys
OCHRE, OCHRE_L, NAVY, CREAM = "#d4a03c", "#f0cf7f", "#1c2c55", "#fcf0d6"

def f(v): return f"{v:.1f}"

def spiral(cx, cy, r0, a0, turns, k, w0, sign=1):
    """Voluta afinada: espiral logarítmica rellena, del radio r0 hacia adentro.
    Devuelve (path relleno, punto/tangente de arranque)."""
    n = 90; th_max = turns * 2 * math.pi
    left, right, center = [], [], []
    for i in range(n + 1):
        t = th_max * i / n
        r = r0 * math.exp(-k * t)
        a = a0 + sign * t
        x, y = cx + r * math.cos(a), cy + r * math.sin(a)
        # tangente aproximada
        t2 = t + 0.01; r2 = r0 * math.exp(-k * t2); a2 = a0 + sign * t2
        dx, dy = cx + r2 * math.cos(a2) - x, cy + r2 * math.sin(a2) - y
        L = math.hypot(dx, dy) or 1; nx, ny = -dy / L, dx / L
        u = i / n
        w = 2.4 * (1 - u) + 0.5 * u + w0 * math.sin(math.pi * min(u * 1.15, 1)) ** 1.4
        left.append((x + nx * w / 2, y + ny * w / 2)); right.append((x - nx * w / 2, y - ny * w / 2)); center.append((x, y))
    pts = left + right[::-1]
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + "Z"
    cline = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in center[int(n * 0.25): int(n * 0.85)])
    return d, cline, center[0]

def leaf(x, y, ang, length, width):
    """Hoja de acanto simple: dos curvas con punta, más nervio."""
    ca, sa = math.cos(ang), math.sin(ang)
    P = lambda u, v: (x + u * ca - v * sa, y + u * sa + v * ca)
    tip = P(length, 0); c1 = P(length * .35, width); c2 = P(length * .8, width * .55)
    c3 = P(length * .8, -width * .25); c4 = P(length * .35, -width * .45)
    d = (f"M{f(x)} {f(y)} C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(tip[0])} {f(tip[1])} "
         f"C{f(c3[0])} {f(c3[1])} {f(c4[0])} {f(c4[1])} {f(x)} {f(y)}Z")
    v1 = P(length * .15, width * .05); v2 = P(length * .75, width * .12)
    vein = f"M{f(v1[0])} {f(v1[1])} Q{f(P(length*.45, width*.2)[0])} {f(P(length*.45, width*.2)[1])} {f(v2[0])} {f(v2[1])}"
    return d, vein

def group_scroll(cx, cy, r0, a0, turns, sign, w0, shadow=(1.6, 1.6), k=0.3):
    d, cl, _ = spiral(cx, cy, r0, a0, turns, k, w0, sign)
    sx, sy = shadow
    return (f'<path d="{d}" fill="{NAVY}" transform="translate({sx} {sy})"/>'
            f'<path d="{d}" fill="{OCHRE}"/>'
            f'<path d="{cl}" fill="none" stroke="{OCHRE_L}" stroke-width=".7" stroke-linecap="round" opacity=".9"/>')

def group_leaf(x, y, ang, L, W):
    d, vein = leaf(x, y, ang, L, W)
    return (f'<path d="{d}" fill="{NAVY}" transform="translate(1.4 1.4)"/>'
            f'<path d="{d}" fill="{OCHRE}"/>'
            f'<path d="{vein}" fill="none" stroke="{OCHRE_L}" stroke-width=".8" stroke-linecap="round"/>')

def stem(x1, y1, x2, y2):
    return (f'<path d="M{f(x1)} {f(y1)} L{f(x2)} {f(y2)}" stroke="{NAVY}" stroke-width="2.4" transform="translate(1.6 1.6)"/>'
            f'<path d="M{f(x1)} {f(y1)} L{f(x2)} {f(y2)}" stroke="{OCHRE}" stroke-width="2.4"/>')

def ribbon():
    """Guarda: dos tallos en S que nacen de una flor central y terminan en volutas."""
    W, H = 400, 56; cx, cy = W / 2, H / 2
    g = []
    for s in (-1, 1):
        xi, xo = cx + s * 30, cx + s * 150
        g.append(group_scroll(xo, cy - 13, 13, math.pi / 2, 1.5, -s, 4.2))   # voluta exterior, sube
        g.append(group_scroll(xi, cy + 9, 9, -math.pi / 2, 1.4, -s, 3.2))     # contravoluta, baja
        g.append(stem(xi, cy, xo, cy))
        g.append(group_leaf(cx + s * 62, cy - 1, (-0.6 if s > 0 else math.pi + 0.6), 30, 8))
        g.append(group_leaf(cx + s * 104, cy + 1, (0.55 if s > 0 else math.pi - 0.55), 24, 6.5))
        for px in (126, 134):
            g.append(f'<circle cx="{f(cx + s*px)}" cy="{f(cy-6)}" r="1.5" fill="{OCHRE_L}"/>')
    for a, L, Wd in ((-math.pi / 2, 14, 7), (math.pi / 2, 14, 7), (0, 11, 5), (math.pi, 11, 5)):
        g.append(group_leaf(cx, cy, a, L, Wd))
    g.append(f'<circle cx="{cx+1.2}" cy="{cy+1.2}" r="6" fill="{NAVY}"/><circle cx="{cx}" cy="{cy}" r="6" fill="{OCHRE}"/><circle cx="{cx}" cy="{cy}" r="2.6" fill="{NAVY}"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{"".join(g)}</svg>'

def corner():
    """Esquinero (arriba a la izquierda): los dos filetes se enroscan en volutas enfrentadas."""
    S = 80; g = []
    g.append(group_scroll(31, 17, 10, -math.pi / 2, 1.5, -1, 3.6))   # del filete de arriba
    g.append(group_scroll(17, 31, 10, math.pi, 1.5, 1, 3.6))          # del filete de la izquierda
    g.append(stem(31, 7, 78, 7)); g.append(stem(7, 31, 7, 78))
    g.append(group_leaf(30, 30, math.pi / 4, 32, 8.5))
    g.append(f'<circle cx="56" cy="16" r="1.6" fill="{OCHRE_L}"/><circle cx="16" cy="56" r="1.6" fill="{OCHRE_L}"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}" width="{S}" height="{S}">{"".join(g)}</svg>'

def punta():
    """Remate de filete (derecha): el filete termina enroscándose hacia arriba."""
    W, H = 30, 26; g = [stem(0, 18, 16, 18), group_scroll(16, 7, 11, math.pi / 2, 1.5, -1, 3.4)]
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{"".join(g)}</svg>'

out = sys.argv[1]
open(f"{out}/filete-guarda.svg", "w").write(ribbon())
open(f"{out}/filete-punta.svg", "w").write(punta())
c = corner()
inner = c[c.index(">") + 1 : c.rindex("</svg>")]
for name, tr in (("tl", ""), ("tr", "translate(80 0) scale(-1 1)"), ("bl", "translate(0 80) scale(1 -1)"), ("br", "translate(80 80) scale(-1 -1)")):
    open(f"{out}/filete-esquina-{name}.svg", "w").write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80"><g transform="{tr}">{inner}</g></svg>')
print("ok")
