"""Reader for GRAFIS model files (.mdl, "GRAFIS-ModelldateiVA").

The layout was worked out from real model files; only the parts listed below
are decoded. Everything is little-endian.

File = text-ish header, then a sequence of blocks. Each block starts with the
magic ``BLO5kenn`` followed by four uint32: ``(level, part, kind, sub)``.

Level 2 blocks hold model-wide data (the first one carries the text header with
#GRDTAB / #TLIST / #TFLIST tables). Level 3 blocks belong to one part
(``part`` = position in #TLIST) and ``kind`` selects the content:

    kind 1  part header (name)
    kind 2  native construction protocol, 32-byte records
    kind 3  sub 1: X variables (measurements); sub >= 2: one macro step each
    kind 4  preview images (PNG) of the macro steps
    kind 6  sub 34: Z variables (formulas); other subs: misc settings
    kind 7  sub 1: evaluated geometry of the part for the active size
"""

from __future__ import annotations

import re
import struct
from dataclasses import dataclass, field

MAGIC = b"BLO5kenn"
FILE_SIGNATURE = b"GRAFIS-Modelldatei"
TEXT_ENCODING = "cp1256"  # Arabic Windows code page used for descriptions


def _txt(b: bytes) -> str:
    return b.decode(TEXT_ENCODING, "replace")


@dataclass
class Block:
    offset: int
    level: int
    part: int
    kind: int
    sub: int
    data: bytes  # full block including the 24-byte header


@dataclass
class PartInfo:
    number: int
    name: str
    steps: int
    objects: int
    active: bool
    flag: str
    ident: str


@dataclass
class Variable:
    """An X variable (measurement) with its default and per-size values."""

    number: int
    label: str
    default: float
    sizes: dict[str, float] = field(default_factory=dict)

    @property
    def name(self) -> str:
        return f"X{self.number}"

    def value(self, size: str | None) -> float:
        if size and size in self.sizes:
            return self.sizes[size]
        return self.default


@dataclass
class ZVariable:
    number: int
    formula: str
    description: str
    history: list[tuple[str, str]]  # (date, formula), newest first

    @property
    def name(self) -> str:
        return f"Z{self.number}"


@dataclass
class StepParam:
    index: int
    label: str
    default: float
    sizes: dict[str, float] = field(default_factory=dict)


@dataclass
class MacroStep:
    number: int
    library: str
    program: str
    title: str
    size_key: str
    params: list[StepParam]
    links: list[tuple[int, int]]  # (param index, reference) pairs from record -12


@dataclass
class ProtocolRecord:
    index: int
    code: int
    category: int
    raw: bytes

    @property
    def words(self) -> tuple[int, ...]:
        return struct.unpack_from("<16H", self.raw)

    @property
    def program(self) -> str | None:
        if self.code == 101 and self.category == 104:
            return self.raw[12:32].split(b"\0")[0].decode("latin1")
        return None


@dataclass
class GeoObject:
    """One evaluated object. kind: 1 point, 2 line/polyline, 4 text, 6 other."""

    ident: int
    kind: int
    bbox: tuple[float, float, float, float]
    points: list[tuple[float, float]]


class GrafisModel:
    def __init__(self, data: bytes):
        if FILE_SIGNATURE not in data[:64]:
            raise ValueError("not a GRAFIS model file")
        self.data = data
        self.blocks = self._split_blocks()
        self.header_text = self._header_text()
        self.parts = self._parse_tlist()
        self.size_keys = self._parse_grdtab()
        self.t_tables = self._parse_tflists()

    @classmethod
    def open(cls, path: str) -> "GrafisModel":
        with open(path, "rb") as f:
            return cls(f.read())

    # ------------------------------------------------------------------ blocks
    def _split_blocks(self) -> list[Block]:
        d = self.data
        starts = [m.start() for m in re.finditer(re.escape(MAGIC), d)] + [len(d)]
        blocks = []
        for a, b in zip(starts, starts[1:]):
            level, part, kind, sub = struct.unpack_from("<4I", d, a + 8)
            blocks.append(Block(a, level, part, kind, sub, d[a:b]))
        return blocks

    def block(self, part: int, kind: int, sub: int = 0) -> Block | None:
        for b in self.blocks:
            if (b.level, b.part, b.kind, b.sub) == (3, part, kind, sub):
                return b
        return None

    def part_blocks(self, part: int, kind: int) -> list[Block]:
        return [b for b in self.blocks if b.level == 3 and b.part == part and b.kind == kind]

    # ------------------------------------------------------------------ header
    def _header_text(self) -> str:
        for b in self.blocks:
            if b.level == 2 and b"#VERSION" in b.data:
                body = b.data[24:]
                end = body.find(b"#ENDINFO")
                return _txt(body[: end + 8 if end >= 0 else len(body)])
        return ""

    def _section(self, name: str) -> list[str]:
        lines = self.header_text.splitlines()
        out, on = [], False
        for ln in lines:
            if ln.startswith("#"):
                on = ln.strip() == name
                continue
            if on:
                out.append(ln)
        return out

    def _parse_grdtab(self) -> list[str]:
        keys = []
        for ln in self._section("#GRDTAB"):
            parts = ln.split()
            if parts:
                keys.append(parts[-1])
        return keys

    def _parse_tlist(self) -> list[PartInfo]:
        parts = []
        rx = re.compile(r"^ (.) (\d{3}) (.) (.*?)\s+(\d+)\s+(\d+)\s+ID=(\w+)")
        for ln in self._section("#TLIST"):
            m = rx.match(ln)
            if not m:
                continue
            parts.append(
                PartInfo(
                    number=int(m.group(2)),
                    name=m.group(4).strip(),
                    steps=int(m.group(5)),
                    objects=int(m.group(6)),
                    active=m.group(1) == "*",
                    flag=m.group(3).strip(),
                    ident=m.group(7),
                )
            )
        return parts

    def _parse_tflists(self) -> dict[int, dict[str, float]]:
        """#TFLISTnnn tables: per-part lettered constants (A, B, ...) in mm."""
        tables: dict[int, dict[str, float]] = {}
        cur = None
        for ln in self.header_text.splitlines():
            m = re.match(r"#TFLIST(\d+)", ln)
            if m:
                cur = tables.setdefault(int(m.group(1)), {})
                continue
            if ln.startswith("#"):
                cur = None
                continue
            if cur is not None and not ln.startswith("*"):
                cols = [c.strip() for c in ln.split("\t")]
                if len(cols) >= 5 and cols[2]:
                    cur[cols[2]] = float(cols[4])
        return tables

    def part(self, number: int) -> PartInfo:
        for p in self.parts:
            if p.number == number:
                return p
        raise KeyError(number)

    # ------------------------------------------------------- step records
    @staticmethod
    def _records(b: bytes, start: int = 24):
        """Records inside a step block (kind 3).

        Header records have a negative id and a length-prefixed payload;
        parameter rows have id >= 0 and carry (float value, raw label bytes).
        """
        p = start
        while p + 16 <= len(b):
            kind, rid = struct.unpack_from("<Ih", b, p)
            if kind == 0 or kind > 64:
                break
            key = b[p + 6 : p + 14].decode("latin1").strip()
            if rid < 0:
                (ln,) = struct.unpack_from("<I", b, p + 20)
                yield kind, rid, key, None, b[p + 24 : p + 24 + ln]
                p += 24 + ((ln + 7) // 8) * 8
            else:
                slen = b[p + 15]
                (val,) = struct.unpack_from("<f", b, p + 16)
                yield kind, rid, key, val, b[p + 24 : p + 24 + slen]
                p += ((24 + slen + 7) // 8) * 8

    def variables(self, part: int) -> list[Variable]:
        blk = self.block(part, 3, 1)
        if blk is None:
            return []
        out: dict[int, Variable] = {}
        for _kind, rid, key, val, label in self._records(blk.data):
            if val is None:
                continue
            if key == "":
                out[rid] = Variable(rid, _txt(label).strip(), round(val, 4))
            elif rid in out:
                out[rid].sizes[key] = round(val, 4)
            else:
                out[rid] = Variable(rid, "", 0.0, {key: round(val, 4)})
        return [out[k] for k in sorted(out)]

    def macro_steps(self, part: int) -> list[MacroStep]:
        steps = []
        for blk in sorted(self.part_blocks(part, 3), key=lambda b: b.sub):
            if blk.sub < 2:
                continue
            params: dict[int, StepParam] = {}
            library = program = size_key = ""
            links: list[tuple[int, int]] = []
            for _kind, rid, key, val, payload in self._records(blk.data):
                if val is None:
                    if rid == -1:
                        raw = payload.split(b"\0")[1].decode("latin1")
                        m = re.match(r"(.*?)(_{2,3}[A-Z]*\d+_\d)(GraPrg_\w+)", raw)
                        if m:
                            library, size_key, program = m.group(1), m.group(2), m.group(3)
                        else:
                            program = raw
                    elif rid == -12:
                        nums = struct.unpack_from(f"<{len(payload)//4}I", payload)
                        links = [(nums[i], nums[i + 1]) for i in range(0, len(nums) - 1, 2) if nums[i + 1]]
                    continue
                if key == "":
                    # labels come from the (German) GRAFIS program, not the user
                    params[rid] = StepParam(rid, payload.decode("latin1").strip(), round(val, 5))
                elif rid in params:
                    params[rid].sizes[key] = round(val, 5)
            title = params.pop(0).label if 0 in params else ""
            steps.append(
                MacroStep(blk.sub, library, program, title, size_key, [params[k] for k in sorted(params)], links)
            )
        return steps

    # ------------------------------------------------------------ Z formulas
    def z_variables(self, part: int) -> list[ZVariable]:
        blk = self.block(part, 6, 34)
        if blk is None:
            return []
        b = blk.data
        heads = []
        # header: u16 number, u16 ?, u16 formula length, u16 ?, 12 zero bytes, formula, NUL
        for m in re.finditer(rb"(?s)(?=(..)(..)(..)(..)\x00{12})", b):
            h = m.start()
            if h < 28:
                continue
            num, _t, flen, _x = struct.unpack_from("<4H", b, h)
            if not (0 < num < 1000 and 0 < flen < 200):
                continue
            f = b[h + 20 : h + 20 + flen]
            if len(f) != flen or not re.fullmatch(rb"[0-9A-Za-z(\-][ -~]*", f):
                continue
            if any(num == n for _, n, _ in heads):
                continue
            heads.append((h, num, flen))
        out = []
        for i, (h, num, flen) in enumerate(heads):
            end = heads[i + 1][0] - 4 if i + 1 < len(heads) else len(b)
            formula = b[h + 20 : h + 20 + flen].decode("latin1").strip()
            rest = b[h + 20 + flen : end].lstrip(b"\0").split(b"\0")[0]
            lines = _txt(rest).split("\r\n")
            desc = lines[0].strip()
            hist = []
            for ln in lines[1:]:
                m = re.match(r"#F:(\d\d-\d\d-\d\d)=(.*)", ln)
                if m:
                    hist.append((m.group(1), m.group(2).strip()))
            out.append(ZVariable(num, formula, desc, hist))
        return out

    # ------------------------------------------------- construction protocol
    def protocol(self, part: int) -> list[ProtocolRecord]:
        blk = self.block(part, 2, 0)
        if blk is None:
            return []
        b = blk.data
        recs = []
        for i in range((len(b) - 24) // 32):
            raw = b[24 + i * 32 : 56 + i * 32]
            code, cat = struct.unpack_from("<HH", raw)
            recs.append(ProtocolRecord(i, code, cat, raw))
        return recs

    # --------------------------------------------------------------- geometry
    def geometry(self, part: int) -> list[GeoObject]:
        blk = self.block(part, 7, 1)
        if blk is None:
            return []
        b = blk.data
        (count,) = struct.unpack_from("<I", b, 24)
        fp = 32 + count * 40
        objs = []
        for i in range(count):
            q = 32 + i * 40
            ident, _, _, npts, _attr, kind = struct.unpack_from("<IIIIIB", b, q)
            bbox = struct.unpack_from("<4f", b, q + 24)
            pts = [struct.unpack_from("<2f", b, fp + 8 * k) for k in range(npts)]
            fp += 8 * npts
            objs.append(GeoObject(ident, kind, tuple(round(v, 4) for v in bbox), [(round(x, 4), round(y, 4)) for x, y in pts]))
        return objs
