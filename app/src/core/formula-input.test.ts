import { describe, expect, it } from "vitest";
import { tokenize, normalizeFormula } from "./formula";

describe("formula input as typed", () => {
  it("accepts lower-case x and Arabic digits", () => {
    expect(normalizeFormula("x1/٢+١٠")).toBe("X1/2+10");
    expect(tokenize("x1 + z2")).toEqual(["X1", "+", "Z2"]);
  });
  it("explains a bare X", () => {
    expect(() => tokenize("X")).toThrow(/اكتب رقم القياس بعد X، مثل X1/);
  });
});
