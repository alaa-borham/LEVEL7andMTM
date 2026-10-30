"""Command line: python -m grafis_mdl <command> <file.mdl> ...

    info    <file>                         list the parts in the model
    extract <file> --part N --out DIR      write JSON, SVG and DXF for one part
    replay  <file> --part N [--size KEY]   rebuild a part from its protocol and
                                           compare with the geometry GRAFIS stored
"""

from __future__ import annotations

import argparse
import os
import sys

from .export import part_summary, to_dxf, to_svg, write_json
from .reader import GrafisModel
from .replay import compare, replay


def cmd_info(model: GrafisModel) -> None:
    print("size keys:", ", ".join(model.size_keys) or "-")
    print(f"{'#':>4}  {'name':<26}{'steps':>6}{'objects':>8}")
    for p in model.parts:
        mark = "*" if p.active else " "
        print(f"{p.number:>4}{mark} {p.name:<26}{p.steps:>6}{p.objects:>8}")


def cmd_extract(model: GrafisModel, part: int, out: str, size: str | None) -> None:
    os.makedirs(out, exist_ok=True)
    summary = part_summary(model, part, size)
    base = os.path.join(out, f"part{part:03d}")
    write_json(summary, base + ".json")
    geo = model.geometry(part)
    if geo:
        with open(base + ".svg", "w", encoding="utf-8") as f:
            f.write(to_svg(geo, summary["part"]["name"]))
        with open(base + ".dxf", "w", encoding="ascii") as f:
            f.write(to_dxf(geo))
    print(f"wrote {base}.json" + (", .svg, .dxf" if geo else " (no geometry stored)"))


def cmd_replay(model: GrafisModel, part: int, size: str | None, tol: float = 0.05) -> None:
    res = replay(model, part, size)
    rows = compare(model, part, res)
    built = [r for r in rows if r[1] == "built" and r[2] is not None]
    ok = [r for r in built if r[2] < tol]
    seeded = [r for r in rows if r[1].startswith("seeded")]
    print(f"objects rebuilt: {len(built)}, matching GRAFIS (< {tol} mm): {len(ok)}")
    for ident, _src, d in built:
        if d >= tol:
            print(f"  differs: {ident}  max {d:.3f} mm")
    print(f"taken from the file (not decoded yet): {len(seeded)}")
    for idx, why in res.unknown:
        print(f"  record {idx}: {why}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="grafis_mdl")
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("info")
    a.add_argument("file")
    b = sub.add_parser("extract")
    b.add_argument("file")
    b.add_argument("--part", type=int, required=True)
    b.add_argument("--out", default="out")
    b.add_argument("--size", help="size key, default: first in #GRDTAB")
    c = sub.add_parser("replay")
    c.add_argument("file")
    c.add_argument("--part", type=int, required=True)
    c.add_argument("--size")
    args = ap.parse_args(argv)
    model = GrafisModel.open(args.file)
    if args.cmd == "info":
        cmd_info(model)
    elif args.cmd == "replay":
        cmd_replay(model, args.part, args.size)
    else:
        cmd_extract(model, args.part, args.out, args.size)
    return 0


if __name__ == "__main__":
    sys.exit(main())
