import { describe, expect, it } from "vitest";
import { evaluate } from "./formula";

const X: Record<number, number> = { 1: 1500, 2: 480, 3: 60 };
const Z: Record<number, number> = { 1: 240 };
const look = (k: "X" | "Z", n: number) => {
  const v = (k === "X" ? X : Z)[n];
  if (v === undefined) throw new Error(`${k}${n} غير موجود`);
  return v;
};
const ev = (s: string) => evaluate(s, look);

describe("Excel-style formulas", () => {
  it("IF with nesting, both separators", () => {
    expect(ev("IF(X1>1000; Z1+10; 0)")).toBe(250);
    expect(ev("if(X2>1000, 1, IF(X2>400, 2, 3))")).toBe(2);
    expect(ev("IF(X3>100; 1)")).toBe(0);
  });
  it("IFS: any number of conditions, first true wins", () => {
    expect(ev("IFS(X2<100; 1; X2<300; 2; X2<500; 3; 1=1; 4)")).toBe(3);
    expect(() => ev("IFS(X2<1; 1)")).toThrow(/لم يتحقق/);
  });
  it("AND / OR / NOT and comparisons as 1 / 0", () => {
    expect(ev("IF(AND(X1>1000; X2<500); 7; 8)")).toBe(7);
    expect(ev("IF(OR(X1<0; NOT(X3=60)); 7; 8)")).toBe(8);
    expect(ev("(X1>X2)*10")).toBe(10);
  });
  it("math functions and ^", () => {
    expect(ev("MAX(X2; X3; Z1)")).toBe(480);
    expect(ev("MIN(X2; X3)")).toBe(60);
    expect(ev("ROUND(X2/7; 1)")).toBe(68.6);
    expect(ev("ROUNDUP(X2/7)")).toBe(69);
    expect(ev("ABS(X3-X2)")).toBe(420);
    expect(ev("SQRT(X3^2+80^2)")).toBe(100);
    expect(ev("MOD(X2; 7)")).toBe(4);
    expect(ev("AVERAGE(X2; X3)")).toBe(270);
    expect(ev("ROUND(SIN(30); 6)")).toBe(0.5);
  });
  it("the branch not taken is not evaluated (no error from it)", () => {
    expect(ev("IF(X3>0; X3; X99/0)")).toBe(60);
    expect(ev("IFS(1=1; 5; X99>0; Z77)")).toBe(5);
  });
  it("old CMDIF still works", () => {
    expect(ev("CMDIF[X1>1000]{Z1+10}{0}")).toBe(250);
  });
  it("clear errors", () => {
    expect(() => ev("FOO(1)")).toThrow(/دالة غير معروفة/);
    expect(() => ev("SQRT(1; 2)")).toThrow(/عدد المعاملات/);
  });
});
