"""Evaluator for GRAFIS variable formulas.

Supported syntax (as found in model files):
    numbers, X<n> / Z<n> references, + - * / and parentheses,
    CMDIF[cond]{expr}[cond]{expr}...{else}
where cond is ``expr op expr`` with op in < <= > >= = <> .
"""

from __future__ import annotations

import re

TOKEN = re.compile(r"\s*(CMDIF|[XZ]\d+|\d+(?:\.\d*)?|\.\d+|<=|>=|<>|[-+*/()\[\]{}<>=])")


class FormulaError(ValueError):
    pass


def tokenize(src: str) -> list[str]:
    pos, out = 0, []
    src = src.strip()
    while pos < len(src):
        m = TOKEN.match(src, pos)
        if not m:
            raise FormulaError(f"unexpected text at {pos}: {src[pos:]!r}")
        out.append(m.group(1))
        pos = m.end()
    return out


class _Parser:
    def __init__(self, tokens: list[str], lookup):
        self.t = tokens
        self.i = 0
        self.lookup = lookup

    def peek(self):
        return self.t[self.i] if self.i < len(self.t) else None

    def take(self, expected=None):
        tok = self.peek()
        if tok is None or (expected and tok != expected):
            raise FormulaError(f"expected {expected or 'value'}, got {tok!r}")
        self.i += 1
        return tok

    def expr(self):
        v = self.term()
        while self.peek() in ("+", "-"):
            op = self.take()
            r = self.term()
            v = v + r if op == "+" else v - r
        return v

    def term(self):
        v = self.factor()
        while self.peek() in ("*", "/"):
            op = self.take()
            r = self.factor()
            if op == "*":
                v *= r
            else:
                if r == 0:
                    raise FormulaError("division by zero")
                v /= r
        return v

    def factor(self):
        tok = self.peek()
        if tok == "-":
            self.take()
            return -self.factor()
        if tok == "+":
            self.take()
            return self.factor()
        if tok == "(":
            self.take()
            v = self.expr()
            self.take(")")
            return v
        if tok == "CMDIF":
            return self.cmdif()
        tok = self.take()
        if tok[0] in "XZ":
            return self.lookup(tok[0], int(tok[1:]))
        try:
            return float(tok)
        except ValueError:
            raise FormulaError(f"unexpected {tok!r}") from None

    def cond(self):
        a = self.expr()
        op = self.take()
        b = self.expr()
        return {"<": a < b, "<=": a <= b, ">": a > b, ">=": a >= b, "=": a == b, "<>": a != b}[op]

    def braced(self):
        self.take("{")
        v = self.expr()
        self.take("}")
        return v

    def cmdif(self):
        self.take("CMDIF")
        result = None
        while self.peek() == "[":
            self.take("[")
            ok = self.cond()
            self.take("]")
            v = self.braced()
            if result is None and ok:
                result = v
        else_v = self.braced()
        return else_v if result is None else result


def evaluate(src: str, lookup) -> float:
    p = _Parser(tokenize(src), lookup)
    v = p.expr()
    if p.peek() is not None:
        raise FormulaError(f"unexpected {p.peek()!r}")
    return v


def evaluate_all(x_values: dict[int, float], z_formulas: dict[int, str]):
    """Evaluate every Z formula, resolving Z->Z references recursively.

    Returns (values, errors): values maps Z number to float, errors maps Z
    number to a message for formulas that could not be evaluated.
    """
    values: dict[int, float] = {}
    errors: dict[int, str] = {}
    active: set[int] = set()

    def lookup(kind: str, n: int) -> float:
        if kind == "X":
            if n not in x_values:
                raise FormulaError(f"X{n} not defined")
            return x_values[n]
        return z(n)

    def z(n: int) -> float:
        if n in values:
            return values[n]
        if n in errors:
            raise FormulaError(f"Z{n}: {errors[n]}")
        if n not in z_formulas:
            raise FormulaError(f"Z{n} has no formula (value set from the drawing?)")
        if n in active:
            raise FormulaError(f"Z{n} refers to itself")
        active.add(n)
        try:
            values[n] = evaluate(z_formulas[n], lookup)
        except FormulaError as e:
            errors[n] = str(e)
            raise
        finally:
            active.discard(n)
        return values[n]

    for n in sorted(z_formulas):
        try:
            z(n)
        except FormulaError as e:
            errors.setdefault(n, str(e))
    return values, errors
