import type { Grammar, Production } from "./types";

const EPSILON_TOKENS = new Set(["ε", "epsilon", "λ", "eps", "#"]);

function tokenizeRhs(rhs: string, nonTerminals: Set<string>): string[] {
  const t = rhs.trim();
  if (t === "" || EPSILON_TOKENS.has(t.toLowerCase())) return [];

  // Spaced notation: `A b C`
  if (/\s/.test(t)) return t.split(/\s+/).filter(Boolean);

  // Compact notation fallback: `aSb` => ["a", "S", "b"].
  // We greedily match known non-terminals first, then consume one char.
  const orderedNTs = [...nonTerminals].sort((a, b) => b.length - a.length);
  const out: string[] = [];
  let i = 0;
  while (i < t.length) {
    let matched: string | null = null;
    for (const nt of orderedNTs) {
      if (nt && t.startsWith(nt, i)) {
        matched = nt;
        break;
      }
    }
    if (matched) {
      out.push(matched);
      i += matched.length;
    } else {
      out.push(t[i]!);
      i += 1;
    }
  }
  return out;
}

/** Split alternatives on | not inside (unused) — simple split. */
function splitAlternatives(s: string): string[] {
  const parts: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "|") {
      parts.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  parts.push(cur.trim());
  return parts.filter((p) => p.length > 0);
}

/**
 * Parse lines like `S -> a A | B c` or `S->a`.
 * Lines starting with # are comments.
 */
export function parseGrammar(text: string, startOverride?: string): Grammar {
  const productions: Production[] = [];
  const lhsOrder: string[] = [];
  const rawRows: { left: string; alt: string }[] = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const arrowMatch = trimmed.match(/^(.+?)\s*->\s*(.+)$/);
    if (!arrowMatch) continue;

    const left = arrowMatch[1].trim();
    if (!lhsOrder.includes(left)) lhsOrder.push(left);

    const alts = splitAlternatives(arrowMatch[2]);
    for (const alt of alts) {
      rawRows.push({ left, alt });
    }
  }

  const nonTerminals = new Set(lhsOrder);
  for (const row of rawRows) {
    productions.push({
      left: row.left,
      right: tokenizeRhs(row.alt, nonTerminals),
    });
  }

  if (productions.length === 0) {
    throw new Error("No productions found. Use lines like: S -> a A | b");
  }

  const start = startOverride ?? lhsOrder[0]!;
  return { start, productions };
}

export function formatProduction(p: Production): string {
  const r =
    p.right.length === 0 ? "ε" : p.right.map((s) => (s === "" ? "ε" : s)).join(" ");
  return `${p.left} → ${r}`;
}

export function formatGrammar(g: Grammar): string {
  const byLeft = new Map<string, Production[]>();
  for (const p of g.productions) {
    if (!byLeft.has(p.left)) byLeft.set(p.left, []);
    byLeft.get(p.left)!.push(p);
  }
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const p of g.productions) {
    if (seen.has(p.left)) continue;
    seen.add(p.left);
    const group = byLeft.get(p.left) ?? [];
    const rhs = group.map((q) =>
      q.right.length === 0 ? "ε" : q.right.join(" ")
    );
    lines.push(`${p.left} -> ${rhs.join(" | ")}`);
  }
  return lines.join("\n");
}

export function getNonTerminals(g: Grammar): Set<string> {
  const nt = new Set<string>();
  for (const p of g.productions) {
    nt.add(p.left);
    for (const sym of p.right) {
      if (isNonTerminal(sym, g)) nt.add(sym);
    }
  }
  return nt;
}

export function isNonTerminal(sym: string, g: Grammar): boolean {
  return g.productions.some((p) => p.left === sym);
}
