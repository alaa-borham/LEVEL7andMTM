import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { readCsv, readXlsx, writeCsv, writeXlsx } from "./xlsx";
import { importXTable, xTableRows } from "./xtable";
import { emptyModel } from "./model";

/** A deflated xlsx, as Excel writes it, with shared strings. */
function excelLike(): Uint8Array {
  const files: [string, string][] = [
    ["xl/workbook.xml", `<workbook xmlns:r="r"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/></Relationships>`],
    ["xl/sharedStrings.xml", `<sst><si><t>X</t></si><si><t>Name</t></si><si><t>Standard</t></si><si><t>_KO176</t></si><si><t>X21</t></si><si><t>buttom girth</t></si><si><r><t>Chest</t></r><r><t xml:space="preserve"> pocket</t></r></si></sst>`],
    ["xl/worksheets/sheet1.xml", `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row><row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2" t="s"><v>5</v></c><c r="C2"><v>1450</v></c><c r="D2"><v>1500</v></c></row><row r="3"><c r="A3"><v>23</v></c><c r="B3" t="s"><v>6</v></c><c r="C3"><v>150</v></c></row></sheetData></worksheet>`],
  ];
  const enc = new TextEncoder(), parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let off = 0;
  for (const [name, xml] of files) {
    const n = enc.encode(name), raw = enc.encode(xml), d = new Uint8Array(deflateRawSync(raw));
    const l = new Uint8Array(30 + n.length), lv = new DataView(l.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(8, 8, true); lv.setUint32(18, d.length, true); lv.setUint32(22, raw.length, true); lv.setUint16(26, n.length, true); l.set(n, 30);
    const c = new Uint8Array(46 + n.length), cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(10, 8, true); cv.setUint32(20, d.length, true); cv.setUint32(24, raw.length, true); cv.setUint16(28, n.length, true); cv.setUint32(42, off, true); c.set(n, 46);
    parts.push(l, d); central.push(c); off += l.length + d.length;
  }
  const cd = central.reduce((s, c) => s + c.length, 0), e = new Uint8Array(22), ev = new DataView(e.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, cd, true); ev.setUint32(16, off, true);
  const all = [...parts, ...central, e], out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let at = 0; for (const p of all) (out.set(p, at), (at += p.length));
  return out;
}

describe("Excel and CSV for X values", () => {
  it("writes an xlsx that reads back the same (numbers stay numbers)", async () => {
    const rows = [["X", "Name", "Standard"], ["X1", "front length", 1500], ["X2", "طول & <عرض>", 48.5]];
    expect(await readXlsx(writeXlsx(rows))).toEqual(rows);
  });
  it("reads a deflated Excel file with shared strings and rich text", async () => {
    const rows = await readXlsx(excelLike());
    expect(rows[0]).toEqual(["X", "Name", "Standard", "_KO176"]);
    expect(rows[1]).toEqual(["X21", "buttom girth", 1450, 1500]);
    expect(rows[2]).toEqual([23, "Chest pocket", 150]);
  });
  it("imports the table into X values and sizes", async () => {
    const m = emptyModel();
    m.measurements.push({ id: 21, name: "", value: 0 });
    const r = importXTable(m, await readXlsx(excelLike()));
    expect(r).toEqual({ added: 1, updated: 1, sizes: ["_KO176"] });
    expect(m.measurements.map((x) => [x.id, x.name, x.value])).toEqual([[21, "buttom girth", 1450], [23, "Chest pocket", 150]]);
    expect(m.sizes?.[0].values[21]).toBe(1500);
  });
  it("round trip: export then import gives the same values", async () => {
    const a = emptyModel();
    a.measurements.push({ id: 1, name: "front", value: 1500, code: "FL" }, { id: 4, name: "hip", value: 1140 });
    a.sizes = [{ name: "L", step: 1, values: { 1: 1550 } }];
    const b = emptyModel();
    importXTable(b, await readXlsx(writeXlsx(xTableRows(a))));
    expect(b.measurements).toEqual(a.measurements);
    expect(b.sizes?.[0].values).toEqual({ 1: 1550 });
  });
  it("CSV from Excel (semicolon, BOM, quotes) and without a header", () => {
    expect(readCsv('﻿X;Name;Standard\r\nX1;"front; length";1500\r\nX2;hip;1140,5\r\n')).toEqual([["X", "Name", "Standard"], ["X1", "front; length", 1500], ["X2", "hip", 1140.5]]);
    const m = emptyModel();
    importXTable(m, readCsv("chest,1100\nwaist,900\n"));
    expect(m.measurements.map((x) => [x.id, x.name, x.value])).toEqual([[1, "chest", 1100], [2, "waist", 900]]);
    expect(readCsv(writeCsv([["a,b", 1]]))).toEqual([["a,b", 1]]);
  });
});

import { importXTable as importX2 } from "./xtable";
import { emptyModel as empty2 } from "./model";
describe("X table with numeric size names", () => {
  it("sizes named 52 / 54 are read as size columns", () => {
    const m = empty2("t");
    const r = importX2(m, [["X", "Name", "MTM", "Standard", 52, 54], ["X1", "length", "", 1500, 1450, 1520], ["X3", "collar", "", 400, "", 410]]);
    expect(r.sizes).toEqual(["52", "54"]);
    expect(m.sizes!.map((s) => s.name)).toEqual(["52", "54"]);
    expect(m.sizes![1].values[3]).toBe(410);
    expect(m.sizes![0].values[3]).toBeUndefined();
  });
});
