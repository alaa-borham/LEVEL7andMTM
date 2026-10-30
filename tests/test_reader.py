"""Tests against a real GRAFIS model.

The sample model is not committed. Put it at samples/ALAA2026.mdl or point
GRAFIS_SAMPLE at it; otherwise the model tests are skipped.
"""

import math
import os
import unittest

from grafis_mdl.export import to_dxf, to_svg
from grafis_mdl.formula import FormulaError, evaluate, evaluate_all
from grafis_mdl.reader import GrafisModel

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLE = os.environ.get("GRAFIS_SAMPLE", os.path.join(ROOT, "samples", "ALAA2026.mdl"))
THOBE = 2


class FormulaTests(unittest.TestCase):
    def ev(self, src, x=None, z=None):
        x, z = x or {}, z or {}
        return evaluate(src, lambda k, n: (x if k == "X" else z)[n])

    def test_arithmetic(self):
        self.assertAlmostEqual(self.ev("(X23+Z7)-70", {23: 370}, {7: 66}), 366)
        self.assertAlmostEqual(self.ev("X7/6.7+Z1", {7: 350}, {1: 0}), 350 / 6.7)
        self.assertEqual(self.ev("-5+2*3"), 1)

    def test_cmdif(self):
        f = "CMDIF[X4>=64]{61}[X4<64]{50}{55}"
        self.assertEqual(self.ev(f, {4: 70}), 61)
        self.assertEqual(self.ev(f, {4: 50}), 50)
        self.assertEqual(self.ev("CMDIF[X4>50]{X4/20}{0}", {4: 50}), 0)
        self.assertEqual(self.ev("CMDIF[X4>50]{X4/20}{0}", {4: 60}), 3)

    def test_errors(self):
        with self.assertRaises(FormulaError):
            self.ev("X35/", {35: 300})
        values, errors = evaluate_all({1: 10}, {1: "X1*2", 2: "Z1+Z3", 3: "Z2"})
        self.assertEqual(values[1], 20)
        self.assertIn(2, errors)
        self.assertIn(3, errors)


@unittest.skipUnless(os.path.exists(SAMPLE), "sample GRAFIS model not available")
class ModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = GrafisModel.open(SAMPLE)

    def test_parts(self):
        self.assertEqual(len(self.m.parts), 102)
        thobe = self.m.part(THOBE)
        self.assertEqual((thobe.name, thobe.steps, thobe.objects), ("basic thobe", 286, 187))
        self.assertEqual(self.m.size_keys, ["__HN40_0"])

    def test_variables(self):
        xs = {v.number: v for v in self.m.variables(THOBE)}
        self.assertEqual(len(xs), 50)
        self.assertEqual(xs[3].label, "shoulder--B")
        self.assertEqual(xs[3].value("__HN40_0"), 370)
        self.assertEqual(xs[5].value("__HN40_0"), 70)  # no size override -> default

    def test_protocol_and_steps(self):
        self.assertEqual(len(self.m.protocol(THOBE)), 286)
        steps = self.m.macro_steps(THOBE)
        self.assertEqual(len(steps), 64)
        self.assertTrue(all(s.library == "basis_d" for s in steps))

    def test_geometry_decodes_whole_block(self):
        geo = self.m.geometry(THOBE)
        self.assertEqual(len(geo), 187)
        for o in geo:
            if o.kind in (1, 2):
                xs = [p[0] for p in o.points]
                ys = [p[1] for p in o.points]
                x0, y0, x1, y1 = o.bbox
                self.assertAlmostEqual(min(xs), x0, places=2, msg=o.ident)
                self.assertAlmostEqual(max(ys), y1, places=2, msg=o.ident)
        self.assertIn("POLYLINE", to_dxf(geo))
        self.assertTrue(to_svg(geo).startswith("<svg"))

    def test_formulas_match_grafis_geometry(self):
        """Z values computed by us must equal what GRAFIS drew for this size."""
        size = self.m.size_keys[0]
        x = {v.number: v.value(size) for v in self.m.variables(THOBE)}
        z, _ = evaluate_all(x, {v.number: v.formula for v in self.m.z_variables(THOBE)})
        geo = {o.ident: o for o in self.m.geometry(THOBE)}

        def length(ident):
            (ax, ay), (bx, by) = geo[ident].points[:2]
            return math.hypot(bx - ax, by - ay)

        self.assertAlmostEqual(length(2001), z[18], places=2)  # thobe length
        self.assertAlmostEqual(length(2002), z[9], places=2)  # half shoulder
        self.assertAlmostEqual(geo[2005].points[0][0], z[6], places=2)  # neck width
        self.assertAlmostEqual(-geo[2006].points[0][1], z[7], places=2)  # neck depth
        self.assertAlmostEqual(-geo[2004].points[0][1], z[11], places=2)  # front shoulder drop R
        self.assertAlmostEqual(-geo[2003].points[0][1], z[12], places=2)  # front shoulder drop L
        self.assertAlmostEqual(length(2003), z[15], places=2)


if __name__ == "__main__":
    unittest.main()
