// Formula evaluator with GRAFIS syntax:
//   numbers, X<n> / Z<n> references, + - * / and parentheses,
//   CMDIF[cond]{expr}[cond]{expr}...{else}, cond = expr (< <= > >= = <>) expr

export class FormulaError extends Error {}

export type Lookup = (kind: "X" | "Z", n: number) => number;

// CMDIF, X/Z references, numbers, Excel-style function names (followed by "("),
// comparisons, operators and argument separators (, or ;)
const TOKEN = /\s*(CMDIF|[XZ]\d+|[A-Z_][A-Z0-9_]*(?=\s*\()|\d+(?:\.\d*)?|\.\d+|<=|>=|<>|[-+*/^()[\]{}<>=,;])/y;

/** Accept lower-case x/z/cmdif and Arabic-Indic digits as typed on an Arabic keyboard. */
export function normalizeFormula(src: string): string {
  return src
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u066b\u060c]/g, ".")
    .replace(/cmdif/gi, "CMDIF")
    .replace(/[a-z_][a-z0-9_]*(?=\s*\()/gi, (f) => f.toUpperCase())
    .replace(/[xz](?=\s*\d)/g, (c) => c.toUpperCase());
}

export function tokenize(src: string): string[] {
  const out: string[] = [];
  const s = normalizeFormula(src).trim();
  const bare = s.match(/(?:^|[^A-Za-z])([XxZz])(?!\s*\d)/);
  if (bare) throw new FormulaError(`اكتب رقم ${bare[1].toUpperCase() === "X" ? "القياس" : "المتغير"} بعد ${bare[1].toUpperCase()}، مثل ${bare[1].toUpperCase()}1`);
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < s.length) {
    const at = TOKEN.lastIndex;
    const m = TOKEN.exec(s);
    if (!m) throw new FormulaError(`نص غير مفهوم عند الموضع ${at}: «${s.slice(at)}»`);
    out.push(m[1]);
  }
  return out;
}

const RAD = Math.PI / 180;
/** Excel-style functions. Arguments arrive evaluated; IF / IFS are handled lazily in the parser. */
const FUNCS: Record<string, { min: number; max: number; f: (a: number[]) => number }> = {
  AND: { min: 1, max: 99, f: (a) => (a.every((x) => x !== 0) ? 1 : 0) },
  OR: { min: 1, max: 99, f: (a) => (a.some((x) => x !== 0) ? 1 : 0) },
  NOT: { min: 1, max: 1, f: (a) => (a[0] === 0 ? 1 : 0) },
  MIN: { min: 1, max: 99, f: (a) => Math.min(...a) },
  MAX: { min: 1, max: 99, f: (a) => Math.max(...a) },
  SUM: { min: 1, max: 99, f: (a) => a.reduce((s, x) => s + x, 0) },
  AVERAGE: { min: 1, max: 99, f: (a) => a.reduce((s, x) => s + x, 0) / a.length },
  ABS: { min: 1, max: 1, f: (a) => Math.abs(a[0]) },
  ROUND: { min: 1, max: 2, f: (a) => { const k = 10 ** (a[1] ?? 0); return Math.round(a[0] * k) / k; } },
  ROUNDUP: { min: 1, max: 2, f: (a) => { const k = 10 ** (a[1] ?? 0); return Math.sign(a[0]) * Math.ceil(Math.abs(a[0]) * k) / k; } },
  ROUNDDOWN: { min: 1, max: 2, f: (a) => { const k = 10 ** (a[1] ?? 0); return Math.sign(a[0]) * Math.floor(Math.abs(a[0]) * k) / k; } },
  INT: { min: 1, max: 1, f: (a) => Math.floor(a[0]) },
  SQRT: { min: 1, max: 1, f: (a) => { if (a[0] < 0) throw new FormulaError("جذر عدد سالب"); return Math.sqrt(a[0]); } },
  POWER: { min: 2, max: 2, f: (a) => a[0] ** a[1] },
  MOD: { min: 2, max: 2, f: (a) => { if (a[1] === 0) throw new FormulaError("قسمة على صفر"); return a[0] - a[1] * Math.floor(a[0] / a[1]); } },
  PI: { min: 0, max: 0, f: () => Math.PI },
  SIN: { min: 1, max: 1, f: (a) => Math.sin(a[0] * RAD) },
  COS: { min: 1, max: 1, f: (a) => Math.cos(a[0] * RAD) },
  TAN: { min: 1, max: 1, f: (a) => Math.tan(a[0] * RAD) },
  ASIN: { min: 1, max: 1, f: (a) => Math.asin(a[0]) / RAD },
  ACOS: { min: 1, max: 1, f: (a) => Math.acos(a[0]) / RAD },
  ATAN: { min: 1, max: 1, f: (a) => Math.atan(a[0]) / RAD },
};
export const FUNCTION_NAMES = ["IF", "IFS", ...Object.keys(FUNCS)];

class Parser {
  private i = 0;
  /** > 0 while parsing a branch that is not taken: no lookups, no errors (as Excel). */
  private skip = 0;
  constructor(
    private t: string[],
    private lookup: Lookup,
  ) {}

  peek(): string | undefined {
    return this.t[this.i];
  }

  take(expected?: string): string {
    const tok = this.peek();
    if (tok === undefined || (expected && tok !== expected)) {
      throw new FormulaError(`متوقع ${expected ?? "قيمة"} لكن وُجد ${tok ?? "نهاية المعادلة"}`);
    }
    this.i++;
    return tok;
  }

  done(): boolean {
    return this.i >= this.t.length;
  }

  expr(): number {
    let v = this.term();
    while (this.peek() === "+" || this.peek() === "-") {
      const op = this.take();
      const r = this.term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }

  term(): number {
    let v = this.power();
    while (this.peek() === "*" || this.peek() === "/") {
      const op = this.take();
      const r = this.power();
      if (op === "*") v *= r;
      else {
        if (r === 0) {
          if (this.skip) return 0;
          throw new FormulaError("قسمة على صفر");
        }
        v /= r;
      }
    }
    return v;
  }

  power(): number {
    const v = this.factor();
    if (this.peek() !== "^") return v;
    this.take();
    return v ** this.power();
  }

  /** An expression, optionally compared with another one: true = 1, false = 0 (as Excel). */
  logic(): number {
    const a = this.expr();
    const op = this.peek();
    if (op === undefined || !["<", "<=", ">", ">=", "=", "<>"].includes(op)) return a;
    this.take();
    const b = this.expr();
    const r = op === "<" ? a < b : op === "<=" ? a <= b : op === ">" ? a > b : op === ">=" ? a >= b : op === "=" ? Math.abs(a - b) < 1e-9 : Math.abs(a - b) >= 1e-9;
    return r ? 1 : 0;
  }

  private sep(): boolean {
    if (this.peek() === "," || this.peek() === ";") {
      this.take();
      return true;
    }
    return false;
  }

  /** Evaluate the next argument, or only parse it when `run` is false. */
  private arg(run: boolean): number {
    if (run) return this.logic();
    this.skip++;
    try {
      this.logic();
    } finally {
      this.skip--;
    }
    return 0;
  }

  call(name: string): number {
    this.take("(");
    if (name === "IF") {
      const c = this.logic() !== 0;
      if (!this.sep()) throw new FormulaError("IF يحتاج: IF(شرط; قيمة إذا تحقق; قيمة إذا لم يتحقق)");
      const a = this.arg(c);
      const b = this.sep() ? this.arg(!c) : 0;
      this.take(")");
      return c ? a : b;
    }
    if (name === "IFS") {
      // IFS(cond1; value1; cond2; value2; ...): the first true condition wins, any number of conditions
      let result: number | undefined;
      do {
        const c = this.arg(result === undefined) !== 0 && result === undefined;
        if (!this.sep()) throw new FormulaError("IFS يحتاج أزواجاً: IFS(شرط; قيمة; شرط; قيمة …)");
        const v = this.arg(c);
        if (c) result = v;
      } while (this.sep());
      this.take(")");
      if (result === undefined) {
        if (this.skip) return 0;
        throw new FormulaError("IFS: لم يتحقق أي شرط؛ أضف في الآخر شرطاً دائماً مثل 1=1");
      }
      return result;
    }
    const fn = FUNCS[name];
    if (!fn) throw new FormulaError(`دالة غير معروفة: ${name}`);
    const args: number[] = [];
    if (this.peek() !== ")") {
      do args.push(this.logic());
      while (this.sep());
    }
    this.take(")");
    if (args.length < fn.min || args.length > fn.max) throw new FormulaError(`${name}: عدد المعاملات غير صحيح`);
    if (this.skip) return 0;
    return fn.f(args);
  }

  factor(): number {
    const tok = this.peek();
    if (tok === "-") {
      this.take();
      return -this.factor();
    }
    if (tok === "+") {
      this.take();
      return this.factor();
    }
    if (tok === "(") {
      this.take();
      const v = this.logic();
      this.take(")");
      return v;
    }
    if (tok === "CMDIF") return this.cmdif();
    const t = this.take();
    if (/^[XZ]\d+$/.test(t)) {
      if (this.skip) return 0;
      return this.lookup(t[0] as "X" | "Z", parseInt(t.slice(1), 10));
    }
    if (/^[A-Z_][A-Z0-9_]*$/.test(t) && this.peek() === "(") return this.call(t);
    const v = Number(t);
    if (Number.isNaN(v)) throw new FormulaError(`غير متوقع: ${t}`);
    return v;
  }

  cond(): boolean {
    const a = this.expr();
    const op = this.take();
    const b = this.expr();
    switch (op) {
      case "<": return a < b;
      case "<=": return a <= b;
      case ">": return a > b;
      case ">=": return a >= b;
      case "=": return a === b;
      case "<>": return a !== b;
    }
    throw new FormulaError(`مقارنة غير معروفة: ${op}`);
  }

  braced(): number {
    this.take("{");
    const v = this.expr();
    this.take("}");
    return v;
  }

  cmdif(): number {
    this.take("CMDIF");
    let result: number | undefined;
    while (this.peek() === "[") {
      this.take("[");
      const ok = this.cond();
      this.take("]");
      const v = this.braced();
      if (result === undefined && ok) result = v;
    }
    const elseV = this.braced();
    return result === undefined ? elseV : result;
  }
}

export function evaluate(src: string, lookup: Lookup): number {
  const tokens = tokenize(src);
  // like GRAFIS, a dangling operator at the end is ignored ("X35/" -> X35)
  while (tokens.length && "+-*/".includes(tokens[tokens.length - 1])) tokens.pop();
  if (!tokens.length) throw new FormulaError("المعادلة فارغة");
  const p = new Parser(tokens, lookup);
  const v = p.logic();
  if (!p.done()) throw new FormulaError(`غير متوقع: ${p.peek()}`);
  return v;
}

/** X and Z references used by a formula, for dependency display. */
export function references(src: string): string[] {
  try {
    return tokenize(src).filter((t) => /^[XZ]\d+$/.test(t));
  } catch {
    return [];
  }
}
