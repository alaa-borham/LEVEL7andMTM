import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toGradedAama } from "../src/core/aama-graded";
import { evaluateModel, fillGrading, withSize } from "../src/core/model";
import { addCustomer, matchKey, parseCsv, parseOrders } from "../src/core/mtm";
import { thobeSample } from "../src/core/sample";
import { run } from "../src/cli";

function model() {
  const { m, ids } = thobeSample();
  m.name = "thobe";
  m.size = "50";
  m.measurements.find((x) => x.id === 3)!.code = "shoulder";
  return { m, ids };
}

describe("MTM input", () => {
  it("matches keys by MTM code, X number and name", () => {
    const { m } = model();
    expect(matchKey(m, "Shoulder")).toBe(3);
    expect(matchKey(m, "x7")).toBe(7);
    expect(matchKey(m, "collar--E1")).toBe(7);
    expect(matchKey(m, "waist")).toBeUndefined();
  });

  it("adds a customer column and converts units", () => {
    const { m, ids } = model();
    const [o] = parseOrders('{"customer":"Ahmed","order":"A1","unit":"cm","measurements":{"shoulder":"42","waist":90}}');
    const { index, applied } = addCustomer(m, o);
    expect(applied.values[3]).toBe(420);
    expect(applied.unknown).toEqual(["waist"]);
    expect(m.sizes![index]).toMatchObject({ name: "Ahmed (A1)", kind: "customer" });
    expect(evaluateModel(withSize(m, index)).objects.get(ids.sh)!.pts[1][0]).toBeCloseTo(210);
    // importing the same order again replaces the column
    addCustomer(m, o);
    expect(m.sizes!.length).toBe(1);
  });

  it("reads CSV with ; and quotes", () => {
    const rows = parseCsv('﻿الزبون;order;shoulder;X1\n"Ali, Jr";7;40,5;140\nسالم;8;38;135\n', "cm");
    expect(rows).toEqual([
      { customer: "Ali, Jr", order: "7", unit: "cm", measurements: { shoulder: 40.5, X1: 140 } },
      { customer: "سالم", order: "8", unit: "cm", measurements: { shoulder: 38, X1: 135 } },
    ]);
  });

  it("customers are not graded", () => {
    const { m } = model();
    m.grading = { 3: 10 };
    m.sizes = [{ name: "52", step: 1, values: {} }];
    addCustomer(m, { customer: "c", measurements: { shoulder: 500 } });
    fillGrading(m);
    expect(m.sizes[1].values[3]).toBe(500);
    expect(toGradedAama(m).sizes).toEqual(["50", "52"]);
  });
});

describe("command line", () => {
  const dir = mkdtempSync(join(tmpdir(), "level7-"));
  const { m } = model();
  writeFileSync(join(dir, "m.json"), JSON.stringify(m));
  const quiet = () => {};

  it("exports an order", () => {
    writeFileSync(join(dir, "o.json"), JSON.stringify({ customer: "Ahmed", order: "A1", measurements: { shoulder: 400 } }));
    const out = join(dir, "out1");
    expect(run(["--model", join(dir, "m.json"), "--order", join(dir, "o.json"), "--format", "aama,plt", "--out", out], quiet)).toBe(0);
    expect(existsSync(join(out, "A1_Ahmed.dxf"))).toBe(true);
    expect(existsSync(join(out, "A1_Ahmed.plt"))).toBe(true);
    const rep = JSON.parse(readFileSync(join(out, "level7-report.json"), "utf8"));
    expect(rep.ok).toBe(true);
    expect(rep.customers[0].missing.length).toBeGreaterThan(0);
  });

  it("exports a CSV batch and reports bad input", () => {
    writeFileSync(join(dir, "c.csv"), "customer,shoulder\nA,40\nB,42\n");
    const out = join(dir, "out2");
    expect(run(["--model", join(dir, "m.json"), "--csv", join(dir, "c.csv"), "--unit", "cm", "--out", out], quiet)).toBe(0);
    expect(JSON.parse(readFileSync(join(out, "level7-report.json"), "utf8")).customers.length).toBe(2);
    expect(run(["--model", join(dir, "missing.json"), "--out", join(dir, "out3")], quiet)).toBe(2);
    expect(run(["--bogus"], quiet)).toBe(2);
  });
});
