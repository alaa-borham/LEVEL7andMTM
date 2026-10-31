// Designs saved by 0.9.143 must keep opening, with the same results, in every later version.
// The fixture is written once (when missing) and never regenerated: if this test fails after a
// change, the change broke old files and needs a migration.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { evaluateModel, withSize, type Model } from "./model";
import { thobeSample } from "./sample";

const file = path.join(__dirname, "fixtures", "design-0.9.143.level7.json");

describe("design file format", () => {
  it("a 0.9.143 design opens and evaluates the same", () => {
    if (!fs.existsSync(file)) {
      const { m } = thobeSample();
      m.sizes = [{ name: "L", step: 1, values: {} }];
      const res = evaluateModel(m);
      const pts = [...res.objects].map(([id, o]) => [id, o.pts.flat().map((v) => Math.round(v * 1000) / 1000)]);
      fs.writeFileSync(file, JSON.stringify({ model: m, expect: { points: pts, pieces: res.pieces.size } }, null, 1));
    }
    const { model, expect: want } = JSON.parse(fs.readFileSync(file, "utf8")) as { model: Model; expect: { points: [number, number[]][]; pieces: number } };
    const res = evaluateModel(model);
    expect([...res.stepErrors.values()]).toEqual([]);
    expect(res.pieces.size).toBe(want.pieces);
    for (const [id, p] of want.points) expect(res.objects.get(id)?.pts.flat().map((v) => Math.round(v * 1000) / 1000 || 0)).toEqual(p);
    for (let i = 0; i < (model.sizes?.length ?? 0); i++) expect([...evaluateModel(withSize(model, i)).stepErrors.values()]).toEqual([]);
  });
});
