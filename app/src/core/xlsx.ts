// Minimal Excel (.xlsx) writer and reader, plus CSV, for the X / Z tables.
// Writing uses a stored (uncompressed) zip; reading accepts stored and deflated entries
// (deflate through the platform's DecompressionStream). Only the first worksheet is read.

export type Cell = string | number;

// ---------------------------------------------------------------- zip
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStored(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), n = f.data.length;
    const local = new Uint8Array(30 + name.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(8, 0, true); // stored
    v.setUint32(14, crc, true);
    v.setUint32(18, n, true);
    v.setUint32(22, n, true);
    v.setUint16(26, name.length, true);
    local.set(name, 30);
    parts.push(local, f.data);
    const c = new Uint8Array(46 + name.length);
    const w = new DataView(c.buffer);
    w.setUint32(0, 0x02014b50, true);
    w.setUint16(4, 20, true);
    w.setUint16(6, 20, true);
    w.setUint32(16, crc, true);
    w.setUint32(20, n, true);
    w.setUint32(24, n, true);
    w.setUint16(28, name.length, true);
    w.setUint32(42, offset, true);
    c.set(name, 46);
    central.push(c);
    offset += local.length + n;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true);
  e.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of all) (out.set(p, at), (at += p.length));
  return out;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as unknown as { DecompressionStream?: new (f: string) => TransformStream }).DecompressionStream;
  if (!DS) throw new Error("فك ضغط ملف إكسل غير متاح هنا");
  const stream = new Blob([data]).stream().pipeThrough(new DS("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (v.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error("الملف ليس ملف إكسل (.xlsx) صالحاً");
  const count = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  const dec = new TextDecoder();
  const out = new Map<string, Uint8Array>();
  for (let k = 0; k < count; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error("فهرس ملف إكسل تالف");
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), comment = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extra + comment;
    if (!/^xl\/(worksheets\/sheet\d+\.xml|sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels)$/.test(name)) continue;
    const ln = v.getUint16(local + 26, true), le = v.getUint16(local + 28, true);
    const data = bytes.subarray(local + 30 + ln + le, local + 30 + ln + le + size);
    out.set(name, method === 0 ? data : method === 8 ? await inflateRaw(data) : new Uint8Array());
  }
  return out;
}

// ---------------------------------------------------------------- xlsx
const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colName = (i: number) => {
  let s = "";
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};

/** An .xlsx workbook with one sheet; numbers stay numbers, the first row is bold. */
export function writeXlsx(rows: Cell[][], sheet = "X values"): Uint8Array {
  const enc = new TextEncoder();
  const body = rows
    .map(
      (r, ri) =>
        `<row r="${ri + 1}">` +
        r
          .map((c, ci) => {
            const ref = colName(ci) + (ri + 1), st = ri === 0 ? ' s="1"' : "";
            return typeof c === "number" && Number.isFinite(c) ? `<c r="${ref}"${st}><v>${c}</v></c>` : `<c r="${ref}" t="inlineStr"${st}><is><t>${xmlEsc(String(c))}</t></is></c>`;
          })
          .join("") +
        `</row>`,
    )
    .join("");
  const f = (name: string, xml: string) => ({ name, data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${xml}`) });
  return zipStored([
    f("[Content_Types].xml", `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    f("_rels/.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    f("xl/workbook.xml", `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(sheet.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    f("xl/_rels/workbook.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    f("xl/styles.xml", `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`),
    f("xl/worksheets/sheet1.xml", `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`),
  ]);
}

const colIndex = (ref: string) => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};
const unxml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d))).replace(/&amp;/g, "&");
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unxml(m[1])).join("");

/** The first worksheet of an .xlsx file as rows of cells (numbers as numbers). */
export async function readXlsx(bytes: Uint8Array): Promise<Cell[][]> {
  const files = await unzip(bytes);
  const dec = new TextDecoder();
  const shared = files.has("xl/sharedStrings.xml") ? [...dec.decode(files.get("xl/sharedStrings.xml")).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1])) : [];
  let sheet = "xl/worksheets/sheet1.xml";
  const wb = files.get("xl/workbook.xml"), rels = files.get("xl/_rels/workbook.xml.rels");
  if (wb && rels) {
    const rid = /<sheet\b[^>]*r:id="([^"]+)"/.exec(dec.decode(wb))?.[1];
    const target = rid && new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(dec.decode(rels))?.[1];
    if (target) sheet = "xl/" + target.replace(/^\/?(xl\/)?/, "");
  }
  const xml = files.get(sheet) ?? [...files.entries()].find(([k]) => k.startsWith("xl/worksheets/"))?.[1];
  if (!xml) throw new Error("لا توجد ورقة في ملف إكسل");
  const rows: Cell[][] = [];
  for (const rm of dec.decode(xml).matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const r = Number(/\br="(\d+)"/.exec(rm[1])?.[1] ?? rows.length + 1) - 1;
    const row: Cell[] = [];
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], inner = cm[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const t = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let val: Cell = "";
      if (t === "s") val = shared[Number(v)] ?? "";
      else if (t === "inlineStr") val = texts(inner);
      else if (t === "str" || t === "e") val = v !== undefined ? unxml(v) : "";
      else if (t === "b") val = v === "1" ? 1 : 0;
      else if (v !== undefined) val = Number(v);
      row[ref ? colIndex(ref) : row.length] = val;
    }
    rows[r] = Array.from(row, (c) => c ?? "");
  }
  return Array.from(rows, (r) => r ?? []);
}

// ---------------------------------------------------------------- csv
/** CSV / tab text (as saved or copied from Excel); the separator is detected. */
export function readCsv(text: string): Cell[][] {
  const t = text.replace(/^﻿/, "");
  const first = t.split(/\r?\n/)[0] ?? "";
  const sep = [..."\t;,"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows: Cell[][] = [];
  let row: Cell[] = [], cell = "", q = false;
  const push = () => {
    const s = cell.trim();
    row.push(s !== "" && /^-?\d+([.,]\d+)?$/.test(s) ? Number(s.replace(",", ".")) : s);
    cell = "";
  };
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"' && t[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) push();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      push();
      rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) (push(), rows.push(row));
  return rows;
}

export function writeCsv(rows: Cell[][]): string {
  return "﻿" + rows.map((r) => r.map((c) => (typeof c === "number" ? String(c) : /[",;\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n");
}

export function toBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
