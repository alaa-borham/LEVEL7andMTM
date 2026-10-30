"""Replay a part's construction protocol to rebuild its geometry.

Status: experimental. Commands whose meaning is not known yet are reported
and, so later commands can still be checked, their result is taken from the
geometry GRAFIS stored in the file ("seeded"). ``compare`` tells which
objects we rebuilt ourselves and how far they are from GRAFIS.

Protocol records are 32 bytes: u16 code, u16 category, then payload. Records
of one command are numbered by the hundreds digit of the code (1xx, 2xx, ...);
the low two digits give the record role. Roles decoded so far:

    x97/x00  value: u16 mode, u16 variable ref (200+n = Zn), f32 cached value
    x96/x01  pick:  u16 type, u16 0, u16 object, ..., u16 18/19 (from start/end),
                    f32 parameter t at byte 28
    x94/x01  output: u16 kind (1 point, 2 line, 4 line), u16 at byte 12 = new id
    x04/x04  parallel copy: object at byte 6, new id at byte 10, f32 side at 16
    x06/x00  set length of the object at byte 6 to the preceding value
    x19      mirror: 1st record axis (object, point, direction),
             then one record per object: src, dst (dst == src: mirror in place)
    101/104  macro call (LINE 10 / CURVE 10); its picks live in block kind 4
"""

from __future__ import annotations

import math
import struct
from dataclasses import dataclass, field

from .formula import FormulaError, evaluate
from .reader import GrafisModel, MeasurePick

Point = tuple[float, float]

# value record modes (u16 after the code)
MODE_PERCENT = 0x2583
MODE_MM = 0x2584


@dataclass
class Obj:
    ident: int
    kind: int  # 1 point, 2 line/polyline
    points: list[Point]
    source: str = ""  # how we got it: "built", "seeded", ...


# ------------------------------------------------------------------ geometry
def seg_len(a: Point, b: Point) -> float:
    return math.hypot(b[0] - a[0], b[1] - a[1])


def poly_len(pts: list[Point]) -> float:
    return sum(seg_len(a, b) for a, b in zip(pts, pts[1:]))


def point_along(pts: list[Point], dist: float, from_end: bool = False) -> Point:
    """Point at arc length ``dist`` from the start (or end); extrapolates past the ends."""
    if len(pts) == 1:
        return pts[0]
    if from_end:
        pts = pts[::-1]
    segs = list(zip(pts, pts[1:]))
    if dist <= 0:
        a, b = segs[0]
    else:
        acc = 0.0
        for k, (a, b) in enumerate(segs):
            L = seg_len(a, b)
            if acc + L >= dist or k == len(segs) - 1:
                break
            acc += L
        dist -= acc
    L = seg_len(a, b) or 1.0
    return (a[0] + (b[0] - a[0]) * dist / L, a[1] + (b[1] - a[1]) * dist / L)


def direction_at(pts: list[Point], dist: float) -> Point | None:
    """Unit tangent of a polyline at arc length ``dist``."""
    if len(pts) < 2:
        return None
    acc = 0.0
    a, b = pts[0], pts[1]
    for a, b in zip(pts, pts[1:]):
        L = seg_len(a, b)
        if acc + L >= dist - 1e-9:
            break
        acc += L
    L = seg_len(a, b) or 1.0
    return ((b[0] - a[0]) / L, (b[1] - a[1]) / L)


def mirror_point(p: Point, origin: Point, d: Point) -> Point:
    dx, dy = d
    n = math.hypot(dx, dy) or 1.0
    dx, dy = dx / n, dy / n
    vx, vy = p[0] - origin[0], p[1] - origin[1]
    t = vx * dx + vy * dy
    fx, fy = origin[0] + t * dx, origin[1] + t * dy
    return (2 * fx - p[0], 2 * fy - p[1])


def line_intersection(a1: Point, a2: Point, b1: Point, b2: Point) -> Point | None:
    d = (a2[0] - a1[0]) * (b2[1] - b1[1]) - (a2[1] - a1[1]) * (b2[0] - b1[0])
    if abs(d) < 1e-12:
        return None
    t = ((b1[0] - a1[0]) * (b2[1] - b1[1]) - (b1[1] - a1[1]) * (b2[0] - b1[0])) / d
    return (a1[0] + t * (a2[0] - a1[0]), a1[1] + t * (a2[1] - a1[1]))


def poly_intersections(p: list[Point], q: list[Point]) -> list[tuple[Point, float]]:
    """Intersections of polyline p with the infinite extension of q's segments
    (q treated as a line when it has 2 points). Returns (point, arc position on p)."""
    out = []
    qs = list(zip(q, q[1:]))
    acc = 0.0
    for a, b in zip(p, p[1:]):
        L = seg_len(a, b)
        for c, d in qs:
            x = line_intersection(a, b, c, d)
            if x is None:
                continue
            # on segment a-b (with tolerance) and, for polylines, on c-d
            t = ((x[0] - a[0]) * (b[0] - a[0]) + (x[1] - a[1]) * (b[1] - a[1])) / (L * L or 1)
            if len(q) > 2:
                Lq = seg_len(c, d) or 1
                u = ((x[0] - c[0]) * (d[0] - c[0]) + (x[1] - c[1]) * (d[1] - c[1])) / (Lq * Lq)
                if not -1e-6 <= u <= 1 + 1e-6:
                    continue
            out.append((x, acc + t * L))
        acc += L
    return out


def cut_candidates(p: list[Point], b: list[Point]) -> list[float]:
    """Arc positions on polyline p where it meets b. p's end segments are
    extended; b is treated as an infinite line when it has two points."""
    out = []
    n = len(p) - 1
    acc = 0.0
    for i, (a1, a2) in enumerate(zip(p, p[1:])):
        L = seg_len(a1, a2)
        if L == 0:
            continue
        m = len(b) - 1
        for j, (c1, c2) in enumerate(zip(b, b[1:])):
            x = line_intersection(a1, a2, c1, c2)
            if x is None:
                continue
            t = ((x[0] - a1[0]) * (a2[0] - a1[0]) + (x[1] - a1[1]) * (a2[1] - a1[1])) / (L * L)
            if (t < -1e-9 and i > 0) or (t > 1 + 1e-9 and i < n - 1):
                continue
            # b's own end segments are extended too
            Lb = seg_len(c1, c2) or 1.0
            u = ((x[0] - c1[0]) * (c2[0] - c1[0]) + (x[1] - c1[1]) * (c2[1] - c1[1])) / (Lb * Lb)
            if (u < -1e-9 and j > 0) or (u > 1 + 1e-9 and j < m - 1):
                continue
            out.append(acc + t * L)
        # an end of b lying on this segment (b may run along p there)
        for e in (b[0], b[-1]):
            t = ((e[0] - a1[0]) * (a2[0] - a1[0]) + (e[1] - a1[1]) * (a2[1] - a1[1])) / (L * L)
            if (t < -1e-9 and i > 0) or (t > 1 + 1e-9 and i < n - 1):
                continue
            q = (a1[0] + t * (a2[0] - a1[0]), a1[1] + t * (a2[1] - a1[1]))
            if seg_len(q, e) < 1e-3:
                out.append(acc + t * L)
        acc += L
    return out


def sub_polyline(p: list[Point], s0: float, s1: float) -> list[Point]:
    """Part of p between arc positions s0 < s1 (positions may lie outside p: extends)."""
    out = [point_along(p, s0)]
    acc = 0.0
    for a, b in zip(p, p[1:]):
        acc += seg_len(a, b)
        if s0 < acc < s1:
            out.append(b)
    out.append(point_along(p, s1) if s1 <= poly_len(p) else _extend_end(p, s1))
    return out


def _extend_end(p: list[Point], s: float) -> Point:
    L = poly_len(p)
    return point_along(p[::-1], L - s)  # negative distance from the end extrapolates


# ------------------------------------------------------------------- replay
@dataclass
class ReplayResult:
    objects: dict[int, Obj]
    unknown: list[tuple[int, str]] = field(default_factory=list)  # (record index, signature)
    log: list[str] = field(default_factory=list)


class Replayer:
    def __init__(self, model: GrafisModel, part: int, size: str | None = None):
        self.m = model
        self.part = part
        self.size = size or (model.size_keys[0] if model.size_keys else None)
        self.x = {v.number: v.value(self.size) for v in model.variables(part)}
        self.zdefs = {z.number: z for z in model.z_variables(part)}
        # measured variables are taken once, as soon as everything they pick exists
        self.measured: dict[int, float] = {}
        self.stored = {o.ident: o for o in model.geometry(part)}
        self.objs: dict[int, Obj] = {}
        self.res = ReplayResult(self.objs)

    # ---------------------------------------------------------- helpers
    def zval(self, n: int, depth: int = 0) -> float:
        if n in self.measured:
            return self.measured[n]
        z = self.zdefs.get(n)
        if z is None:
            raise FormulaError(f"Z{n} not defined")
        if z.measured:
            raise FormulaError(f"Z{n} not measurable yet")
        if depth > 50:
            raise FormulaError(f"Z{n} recursion")

        def lookup(kind, k):
            if kind == "X":
                if k not in self.x:
                    raise FormulaError(f"X{k} not defined")
                return self.x[k]
            return self.zval(k, depth + 1)

        return evaluate(z.formula, lookup)

    def var(self, ref: int, cached: float) -> float:
        if ref == 0:
            return cached
        if 0 < ref < 200:
            if ref in self.x:
                return self.x[ref]
        if 200 < ref < 1200:
            try:
                return self.zval(ref - 200)
            except FormulaError as e:
                self.res.log.append(f"Z{ref - 200}: {e}; using cached {cached:g}")
                return cached
        self.res.log.append(f"variable ref {ref} not resolved, using cached {cached:g}")
        return cached

    def measure_point(self, pk: MeasurePick) -> Point:
        o = self.objs[pk.obj]
        if pk.type == 1:
            return o.points[0]
        if pk.type == 2:
            return o.points[-1] if pk.param > 0.5 else o.points[0]
        if pk.type == 6:
            other = self.objs[pk.obj2]
            hits = poly_intersections(o.points, other.points)
            if not hits:
                raise FormulaError("no intersection")
            target = pk.param * poly_len(o.points)
            return min(hits, key=lambda h: abs(h[1] - target))[0]
        raise FormulaError(f"measure pick type {pk.type}")

    def try_measure(self) -> None:
        for n, z in self.zdefs.items():
            if not z.measured or n in self.measured:
                continue
            need = {pk.obj for pk in z.picks} | {pk.obj2 for pk in z.picks if pk.type == 6}
            if not need <= self.objs.keys():
                continue
            try:
                if z.formula == "GL":
                    self.measured[n] = poly_len(self.objs[z.picks[0].obj].points)
                elif z.formula == "AB":
                    self.measured[n] = seg_len(*(self.measure_point(pk) for pk in z.picks))
                else:
                    raise FormulaError(f"measurement {z.formula}")
            except FormulaError as e:
                self.res.log.append(f"Z{n}: {e}")
                self.measured[n] = float("nan")

    def seed(self, ident: int, why: str) -> Obj | None:
        s = self.stored.get(ident)
        if s is None:
            return None
        o = Obj(ident, s.kind, list(s.points), "seeded:" + why)
        self.objs[ident] = o
        return o

    def get(self, ident: int) -> Obj:
        if ident not in self.objs:
            self.seed(ident, "missing input")
        return self.objs[ident]

    def put(self, ident: int, kind: int, pts: list[Point]) -> None:
        self.objs[ident] = Obj(ident, kind, pts, "built")

    # ---------------------------------------------------------- picks
    def pick_point(self, rec: bytes, pending: tuple[int, float] | None) -> Point:
        typ, = struct.unpack_from("<H", rec, 4)
        obj = struct.unpack_from("<H", rec, 8)[0]
        from_start = struct.unpack_from("<H", rec, 18)[0] == 0xFFFF
        t = struct.unpack_from("<f", rec, 28)[0]
        o = self.get(obj)
        pts = o.points
        if typ == 2:  # point object
            return pts[0]
        if typ == 3:  # end point picked by t (0 start, 1 end)
            return pts[-1] if t > 0.5 else pts[0]
        if typ == 5:  # intersection with a second object; t picks the nearest crossing
            other = self.get(struct.unpack_from("<H", rec, 12)[0]).points
            hits = poly_intersections(pts, other)
            if not hits:
                raise NotImplementedError("pick: no intersection")
            target = t * poly_len(pts)
            return min(hits, key=lambda h: abs(h[1] - target))[0]
        if typ in (8, 10):  # point on object at a distance (mm or %) from start or end
            mode, d = pending or (MODE_MM, 0.0)
            if mode == MODE_PERCENT:
                d = poly_len(pts) * d / 100.0
            return point_along(pts, d, from_end=not from_start)
        raise NotImplementedError(f"pick type {typ}")

    # ---------------------------------------------------------- macros
    def macro_picks(self) -> dict[int, dict]:
        """Picks of macro steps from block kind 4, keyed by protocol index."""
        blk = self.m.block(self.part, 4, 0)
        out: dict[int, dict] = {}
        if blk is None:
            return out
        b = blk.data
        p = 24
        while p + 12 <= len(b):
            n, z, kind, typ, idx = struct.unpack_from("<IHHHH", b, p)
            if z != 0 or kind not in (1, 2):
                p += 8
                continue
            if kind == 2:
                s = b.find(b"\x89PNG", p)
                e = b.find(b"IEND", s) + 8
                p = (e + 7) // 8 * 8
                continue
            q = p + 16
            while q + 12 <= len(b):
                n2, z2, k2, t2, i2 = struct.unpack_from("<IHHHH", b, q)
                if z2 == 0 and k2 in (1, 2) and t2 < 64 and i2 < 10000 and (k2 == 2 or n2 < 200):
                    break
                q += 8
            payload = b[p + 12 : q]
            entry = out.setdefault(idx - 1, {"picks": [], "angle": None})
            if typ == 6:
                ptype = struct.unpack_from("<H", payload, 4)[0]
                from_start = payload[6] == 0xFF
                obj, ref = struct.unpack_from("<HH", payload, 12)
                val = struct.unpack_from("<f", payload, 16)[0]
                entry["picks"].append(
                    {"type": ptype, "obj": obj, "ref": ref, "value": val, "from_start": from_start}
                )
            elif typ == 7 and len(payload) >= 4:
                entry["angle"] = struct.unpack_from("<f", payload, len(payload) - 4)[0]
            p = q
        return out

    def macro_point(self, pk: dict) -> tuple[Point, Point | None]:
        """Picked point and the unit direction of the picked object there (if any)."""
        t, obj = pk["type"], pk["obj"]
        if t == 7:
            return (0.0, 0.0), None
        o = self.get(obj)
        pts = o.points
        if t == 1:
            return pts[0], None
        if t == 2:
            at_end = pk["value"] > 0.5
            return (pts[-1] if at_end else pts[0]), direction_at(pts, poly_len(pts) if at_end else 0.0)
        if t == 4:
            d = self.var(pk["ref"], pk["value"])
            if not pk["from_start"]:
                d = poly_len(pts) - d
            return point_along(pts, d), direction_at(pts, d)
        if t == 5:
            d = poly_len(pts) * pk["value"]
            if not pk["from_start"]:
                d = poly_len(pts) - d
            return point_along(pts, d), direction_at(pts, d)
        if t == 6:
            hits = poly_intersections(pts, self.get(pk["ref"]).points)
            if not hits:
                raise NotImplementedError("macro pick: no intersection")
            target = pk["value"] * poly_len(pts)
            x, at = min(hits, key=lambda h: abs(h[1] - target))
            return x, direction_at(pts, at)
        raise NotImplementedError(f"macro pick type {t}")

    @staticmethod
    def step_value(st, index: int, var) -> float:
        v = next((p.default for p in st.params if p.index == index), 0.0)
        for pi, ref in st.links:
            if pi == index:
                v = var(ref, v)
        return v

    def run_macro(self, rec, step_no: int, out_id: int, picks: dict) -> None:
        steps = {s.number: s for s in self.m.macro_steps(self.part)}
        st = steps.get(step_no)
        if st is None or st.title != "LINE 10":
            raise NotImplementedError(f"macro {st.title if st else step_no}")
        info = picks.get(rec.index, {"picks": [], "angle": 0.0})
        start, along = self.macro_point(info["picks"][0]) if info["picks"] else ((0.0, 0.0), None)
        length = self.step_value(st, 7, self.var)
        shift = self.step_value(st, 9, self.var)  # "Verschiebewert": move start along the picked object
        if shift and along:
            start = (start[0] + along[0] * shift, start[1] + along[1] * shift)
        start = (start[0] + self.step_value(st, 12, self.var), start[1] + self.step_value(st, 13, self.var))
        ang = math.radians(info["angle"] or 0.0)
        end = (start[0] + length * math.cos(ang), start[1] + length * math.sin(ang))
        self.put(out_id, 2, [start, end])

    # ---------------------------------------------------------- main loop
    def run(self) -> ReplayResult:
        recs = self.m.protocol(self.part)
        picks = self.macro_picks()
        i = 0
        while i < len(recs):
            r = recs[i]
            role = r.code % 100
            if r.program:  # macro call
                step_no, out_id = r.words[2], r.words[3]
                if out_id < 2000:
                    out_id = 2000 + out_id
                try:
                    self.run_macro(r, step_no, out_id, picks)
                except NotImplementedError as e:
                    self.res.unknown.append((r.index, str(e)))
                    self.seed(out_id, str(e))
                self.try_measure()
                i += 1
                continue
            # collect one command: records until the hundreds digit restarts at 1
            j = i + 1
            while j < len(recs) and not recs[j].program and not (
                recs[j].code // 100 == 1 and recs[j].category // 100 == 1
            ):
                j += 1
            if all((c.code % 100, c.category % 100) == (97, 0) for c in recs[i:j]) and j < len(recs):
                # lone value records belong to the command that follows
                k = j + 1
                while k < len(recs) and not recs[k].program and not (
                    recs[k].code // 100 == 1 and recs[k].category // 100 == 1
                ):
                    k += 1
                j = k
            cmd = recs[i:j]
            try:
                self.command(cmd)
            except NotImplementedError as e:
                sig = " ".join(f"{c.code % 100}/{c.category % 100}" for c in cmd)
                self.res.unknown.append((r.index, f"{sig}: {e}"))
                for ident in self.outputs_of(cmd):
                    if ident not in self.objs or self.objs[ident].source == "built":
                        self.seed(ident, sig)
            self.try_measure()
            i = j
        return self.res

    @staticmethod
    def outputs_of(cmd) -> list[int]:
        ids = []
        for c in cmd:
            role, cat = c.code % 100, c.category % 100
            w = c.words
            if role == 94 or role == 95:
                ids.append(w[6] if w[6] >= 2000 else w[6])
            elif role == 4 and cat == 4:
                ids.append(w[5])
            elif role == 19 and cat in (40, 140 % 100):
                if w[4] >= 2000:
                    ids.append(w[4])
        return [x for x in ids if x >= 2000]

    def command(self, cmd) -> None:
        roles = [(c.code % 100, c.category % 100) for c in cmd]
        # ---- mirror
        if roles[0] == (19, 28):
            self.cmd_mirror(cmd)
            return
        # ---- parallel copies
        if all(r == (4, 4) or r == (97, 0) for r in roles) and (4, 4) in roles:
            value = None
            for c in cmd:
                if c.code % 100 == 97:
                    value = self.var(c.words[3], struct.unpack_from("<f", c.raw, 8)[0])
                else:
                    src, dst = c.words[3], c.words[5]
                    side = struct.unpack_from("<f", c.raw, 16)[0]
                    pts = self.get(src).points
                    a, b = pts[0], pts[-1]
                    L = seg_len(a, b) or 1
                    nx, ny = -(b[1] - a[1]) / L, (b[0] - a[0]) / L  # left normal
                    k = -side * (value or 0.0)
                    self.put(dst, 2, [(x + nx * k, y + ny * k) for x, y in pts])
            return
        # ---- set length
        if roles == [(97, 0), (6, 0)]:
            v = self.var(cmd[0].words[3], struct.unpack_from("<f", cmd[0].raw, 8)[0])
            o = self.get(cmd[1].words[3])
            a = o.points[0]
            self.put(o.ident, 2, [a, point_along(o.points, v)])
            return
        # ---- construct from values and picks
        if roles[-1] in ((94, 1),) and all(r in ((97, 0), (96, 1)) for r in roles[:-1]):
            pts, value = [], None
            for c in cmd[:-1]:
                if c.code % 100 == 97:
                    value = (c.words[2], self.var(c.words[3], struct.unpack_from("<f", c.raw, 8)[0]))
                else:
                    pts.append(self.pick_point(c.raw, value))
                    if struct.unpack_from("<H", c.raw, 4)[0] in (8, 10):
                        value = None
            out = cmd[-1]
            kind, ident = out.words[2], out.words[6]
            if kind == 14 and len(pts) == 1:  # point moved along an object's direction
                mode, d = value or (MODE_MM, 0.0)
                along = self.get(out.words[4]).points
                ux, uy = direction_at(along, 0.0)
                if out.words[7] != 0xFFFF:
                    ux, uy = -ux, -uy
                self.put(ident, 1, [(pts[0][0] + ux * d, pts[0][1] + uy * d)])
                return
            if kind == 1 and len(pts) == 1:
                self.put(ident, 1, pts)
                return
            if kind in (2, 4) and len(pts) == 2:
                self.put(ident, 2, pts)
                return
            raise NotImplementedError(f"output kind {kind} from {len(pts)} points")
        # ---- trim / extend objects to boundaries
        if roles[0] == (3, 5) and all(r in ((3, 5), (3, 19), (3, 18)) for r in roles):
            self.cmd_trim(cmd)
            return
        raise NotImplementedError("command not decoded")

    def cmd_trim(self, cmd) -> None:
        boundary = None
        for c in cmd:
            cat = c.category % 100
            if cat == 5:
                boundary = self.get(c.words[3]).points
                continue
            ident, which = c.words[3], c.words[4]
            o = self.get(ident)
            if o.source.startswith("seeded"):
                continue  # seeded geometry is already in its final, trimmed state
            pts = o.points
            L = poly_len(pts)
            cands = cut_candidates(pts, boundary)
            if not cands:
                self.res.log.append(f"record {c.index}: {ident} does not meet the boundary, left as is")
                continue
            # which: 1 = move the end, 2 = move the start, to the nearest crossing
            if which == 1:
                new = sub_polyline(pts, 0.0, min(cands, key=lambda x: abs(x - L)))
            else:
                new = sub_polyline(pts, min(cands, key=abs), L)
            self.put(ident, o.kind, new)

    def cmd_mirror(self, cmd) -> None:
        axis = None
        for c in cmd:
            if c.code % 100 != 19:
                raise NotImplementedError("mirror list")
            if c.category % 100 == 28:  # (new) axis: object, point, direction
                ox, oy, dx, dy = struct.unpack_from("<4f", c.raw, 8)
                axis = ((ox, oy), (dx, dy))
                continue
            w = c.words
            src, dst = w[2], w[4]
            o = self.get(src)
            if dst == src and o.source.startswith("seeded"):
                continue  # seeded geometry is already the final, mirrored state
            pts = [mirror_point(p, axis[0], axis[1]) for p in o.points]
            self.put(dst, o.kind, pts)


def replay(model: GrafisModel, part: int, size: str | None = None) -> ReplayResult:
    return Replayer(model, part, size).run()


def compare(model: GrafisModel, part: int, result: ReplayResult, tol: float = 0.05):
    """Per object: (ident, source, max point distance to GRAFIS or None)."""
    stored = {o.ident: o for o in model.geometry(part)}
    rows = []
    for ident, o in sorted(result.objects.items()):
        s = stored.get(ident)
        if s is None:
            rows.append((ident, o.source, None))
            continue
        if len(s.points) != len(o.points):
            # compare end points only for different resolutions
            pa, pb = [s.points[0], s.points[-1]], [o.points[0], o.points[-1]]
        else:
            pa, pb = s.points, o.points
        rows.append((ident, o.source, max(seg_len(a, b) for a, b in zip(pa, pb))))
    return rows
