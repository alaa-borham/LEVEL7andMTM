// Formula evaluator with GRAFIS syntax:
//   numbers, X<n> / Z<n> references, + - * / and parentheses,
//   CMDIF[cond]{expr}[cond]{expr}...{else}, cond = expr (< <= > >= = <>) expr

export class FormulaError extends Error {}

export type Lookup = (kind: "X" | "Z", n: number) => number;

const TOKEN = /\s*(CMDIF|[XZ]\d+|\d+(?:\.\d*)?|\.\d+|<=|>=|<>|[-+*/()[\]{}<>=])/y;

export function tokenize(src: string): string[] {
  const out: string[] = [];
  const s = src.trim();
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < s.length) {
    const at = TOKEN.lastIndex;
    const m = TOKEN.exec(s);
    if (!m) throw new FormulaError(`نص غير مفهوم عند الموضع ${at}: «${s.slice(at)}»`);
    out.push(m[1]);
  }
  return out;
}

class Parser {
  private i = 0;
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
    let v = this.factor();
    while (this.peek() === "*" || this.peek() === "/") {
      const op = this.take();
      const r = this.factor();
      if (op === "*") v *= r;
      else {
        if (r === 0) throw new FormulaError("قسمة على صفر");
        v /= r;
      }
    }
    return v;
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
      const v = this.expr();
      this.take(")");
      return v;
    }
    if (tok === "CMDIF") return this.cmdif();
    const t = this.take();
    if (t[0] === "X" || t[0] === "Z") return this.lookup(t[0], parseInt(t.slice(1), 10));
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
  const v = p.expr();
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
