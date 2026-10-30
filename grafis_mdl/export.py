"""Exporters for data read from a GRAFIS model: JSON, SVG and DXF (R12)."""

from __future__ import annotations

import json
from dataclasses import asdict

from .formula import evaluate_all
from .reader import GeoObject, GrafisModel

DRAWABLE = (1, 2)  # points and lines/polylines; other kinds are not decoded yet


def drawable(objs: list[GeoObject]) -> list[GeoObject]:
    return [o for o in objs if o.kind in DRAWABLE and o.points]


def part_summary(model: GrafisModel, part: int, size: str | None = None) -> dict:
    info = model.part(part)
    size = size or (model.size_keys[0] if model.size_keys else None)
    xs = model.variables(part)
    zs = model.z_variables(part)
    x_values = {v.number: v.value(size) for v in xs}
    z_values, z_errors = evaluate_all(x_values, {z.number: z.formula for z in zs})
    geo = model.geometry(part)
    return {
        "part": asdict(info),
        "size": size,
        "x_variables": [asdict(v) | {"name": v.name, "value": v.value(size)} for v in xs],
        "z_variables": [
            asdict(z) | {"name": z.name, "value": z_values.get(z.number), "error": z_errors.get(z.number)}
            for z in sorted(zs, key=lambda z: z.number)
        ],
        "t_constants": model.t_tables.get(part, {}),
        "macro_steps": [asdict(s) for s in model.macro_steps(part)],
        "protocol": [
            {"index": r.index, "code": r.code, "category": r.category, "program": r.program, "words": r.words}
            for r in model.protocol(part)
        ],
        "geometry": [asdict(o) for o in geo],
    }


def write_json(summary: dict, path: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=1)


def _bounds(objs: list[GeoObject]):
    xs = [x for o in objs for x, _ in o.points]
    ys = [y for o in objs for _, y in o.points]
    return min(xs), min(ys), max(xs), max(ys)


def to_svg(objs: list[GeoObject], title: str = "") -> str:
    objs = drawable(objs)
    x0, y0, x1, y1 = _bounds(objs)
    pad = 40
    w, h = x1 - x0 + 2 * pad, y1 - y0 + 2 * pad
    # GRAFIS y points up, SVG y points down: flip y.
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0 - pad:.2f} {-y1 - pad:.2f} {w:.2f} {h:.2f}" '
        f'width="{w:.0f}mm" height="{h:.0f}mm">',
        f"<title>{title}</title>",
        '<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" fill="#fff"/>' % (x0 - pad, -y1 - pad, w, h),
    ]
    for o in objs:
        if o.kind == 1:
            x, y = o.points[0]
            out.append(f'<circle cx="{x:.2f}" cy="{-y:.2f}" r="3" fill="#c00"><title>{o.ident}</title></circle>')
        else:
            pts = " ".join(f"{x:.2f},{-y:.2f}" for x, y in o.points)
            out.append(
                f'<polyline fill="none" stroke="#000" stroke-width="1.5" points="{pts}"><title>{o.ident}</title></polyline>'
            )
    out.append("</svg>")
    return "\n".join(out)


def to_dxf(objs: list[GeoObject]) -> str:
    """Minimal AutoCAD R12 DXF, units mm, readable by almost every CAD/plotter tool."""
    lines = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"]

    def add(*pairs):
        for code, val in pairs:
            lines.extend([str(code), str(val)])

    for o in drawable(objs):
        layer = f"OBJ{o.ident}"
        if o.kind == 1:
            x, y = o.points[0]
            add((0, "POINT"), (8, layer), (10, f"{x:.4f}"), (20, f"{y:.4f}"), (30, "0"))
        elif len(o.points) == 2:
            (ax, ay), (bx, by) = o.points
            add((0, "LINE"), (8, layer), (10, f"{ax:.4f}"), (20, f"{ay:.4f}"), (30, "0"),
                (11, f"{bx:.4f}"), (21, f"{by:.4f}"), (31, "0"))
        else:
            add((0, "POLYLINE"), (8, layer), (66, 1), (10, "0"), (20, "0"), (30, "0"), (70, 0))
            for x, y in o.points:
                add((0, "VERTEX"), (8, layer), (10, f"{x:.4f}"), (20, f"{y:.4f}"), (30, "0"))
            add((0, "SEQEND"), (8, layer))
    add((0, "ENDSEC"), (0, "EOF"))
    return "\n".join(lines) + "\n"
