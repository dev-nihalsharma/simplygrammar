import type { Grammar, GrammarStep, Production } from "./types";
import { formatProduction, getNonTerminals, isNonTerminal } from "./parse";

function cloneGrammar(g: Grammar): Grammar {
  return {
    start: g.start,
    productions: g.productions.map((p) => ({
      left: p.left,
      right: [...p.right],
    })),
  };
}

function productionKey(p: Production): string {
  return `${p.left}::${p.right.join("\0")}`;
}

function dedupeProductions(prods: Production[]): Production[] {
  const seen = new Set<string>();
  const out: Production[] = [];
  for (const p of prods) {
    const k = productionKey(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

function allNonTerminalsFromGrammar(g: Grammar): string[] {
  const s = getNonTerminals(g);
  return [...s].sort();
}

/** --- Nullable (ε) --- */

function computeNullableIteration(
  g: Grammar,
  nullable: Set<string>
): { next: Set<string>; added: string[] } {
  const next = new Set(nullable);
  const added: string[] = [];
  for (const p of g.productions) {
    if (p.right.length === 0) {
      if (!next.has(p.left)) {
        next.add(p.left);
        added.push(p.left);
      }
      continue;
    }
    const allNullable = p.right.every(
      (sym) => isNonTerminal(sym, g) && nullable.has(sym)
    );
    if (allNullable) {
      if (!next.has(p.left)) {
        next.add(p.left);
        added.push(p.left);
      }
    }
  }
  return { next, added };
}

function expandProductionForEpsilon(p: Production, nullable: Set<string>, g: Grammar): Production[] {
  const indices: number[] = [];
  p.right.forEach((sym, i) => {
    if (isNonTerminal(sym, g) && nullable.has(sym)) indices.push(i);
  });
  if (indices.length === 0) {
    return [p];
  }
  const out: Production[] = [];
  const n = indices.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    const keep = new Set<number>();
    for (let b = 0; b < n; b++) {
      if ((mask & (1 << b)) === 0) keep.add(indices[b]!);
    }
    const newRight = p.right.filter((_, i) => keep.has(i) || !indices.includes(i));
    out.push({ left: p.left, right: newRight });
  }
  return dedupeProductions(out);
}

/** --- Unit productions --- */

function isUnitProduction(p: Production, g: Grammar): boolean {
  return p.right.length === 1 && isNonTerminal(p.right[0]!, g);
}

function unitClosure(g: Grammar): Map<string, Set<string>> {
  const nts = allNonTerminalsFromGrammar(g);
  const pairs = new Map<string, Set<string>>();
  for (const a of nts) {
    pairs.set(a, new Set([a]));
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of g.productions) {
      if (!isUnitProduction(p, g)) continue;
      const b = p.right[0]!;
      const setA = pairs.get(p.left);
      const setB = pairs.get(b);
      if (!setA || !setB) continue;
      for (const c of setB) {
        if (!setA.has(c)) {
          setA.add(c);
          changed = true;
        }
      }
    }
  }
  return pairs;
}

/** --- Useless symbols --- */

function computeGenerating(g: Grammar): { set: Set<string>; iterations: string[][] } {
  const iterations: string[][] = [];
  const gen = new Set<string>();
  for (const p of g.productions) {
    for (const sym of p.right) {
      if (!isNonTerminal(sym, g)) gen.add(sym);
    }
  }
  iterations.push([...gen].sort());

  let changed = true;
  while (changed) {
    changed = false;
    const added: string[] = [];
    for (const p of g.productions) {
      if (gen.has(p.left)) continue;
      const ok = p.right.every((sym) => gen.has(sym));
      if (ok) {
        gen.add(p.left);
        added.push(p.left);
        changed = true;
      }
    }
    if (added.length) iterations.push([...added].sort());
  }
  return { set: gen, iterations };
}

function filterGenerating(g: Grammar, gen: Set<string>): Grammar {
  const productions = g.productions.filter(
    (p) =>
      gen.has(p.left) && p.right.every((sym) => gen.has(sym) || !isNonTerminal(sym, g))
  );
  return { ...g, productions: dedupeProductions(productions) };
}

function computeReachable(g: Grammar): { set: Set<string>; iterations: string[][] } {
  const iterations: string[][] = [];
  const reach = new Set<string>([g.start]);
  iterations.push([g.start]);

  let changed = true;
  while (changed) {
    changed = false;
    const added: string[] = [];
    for (const p of g.productions) {
      if (!reach.has(p.left)) continue;
      for (const sym of p.right) {
        if (isNonTerminal(sym, g) && !reach.has(sym)) {
          reach.add(sym);
          added.push(sym);
          changed = true;
        }
      }
    }
    if (added.length) iterations.push([...added].sort());
  }
  return { set: reach, iterations };
}

function filterReachable(g: Grammar, reach: Set<string>): Grammar {
  const productions = g.productions.filter(
    (p) => reach.has(p.left) && p.right.every((sym) => !isNonTerminal(sym, g) || reach.has(sym))
  );
  return { ...g, productions: dedupeProductions(productions) };
}

/** --- Public: full pipeline with steps --- */

export function eliminateEpsilonWithSteps(g: Grammar): GrammarStep[] {
  const steps: GrammarStep[] = [];
  const working = cloneGrammar(g);

  steps.push({
    phase: "epsilon",
    label: "Starting grammar",
    grammar: cloneGrammar(working),
    explanation:
      "We find all nullable non-terminals (those that can derive ε), then add productions that omit nullable symbols. Finally we remove ε-productions (keeping S → ε only if ε was in the language).",
  });

  let nullable = new Set<string>();
  let round = 0;
  while (true) {
    const { next, added } = computeNullableIteration(working, nullable);
    nullable = next;
    round++;
    steps.push({
      phase: "epsilon",
      label:
        round === 1
          ? "Nullable non-terminals — discovery"
          : `Nullable non-terminals — round ${round}`,
      grammar: cloneGrammar(working),
      blocks: [
        {
          title: "Current nullable set",
          items: [...nullable].sort(),
        },
        ...(added.length
          ? [
              {
                title: "Newly marked nullable in this round",
                items: added.sort(),
              },
            ]
          : []),
      ],
      explanation:
        round === 1
          ? "Any A with A → ε is nullable. If A → B₁…Bₖ and every Bᵢ is a nullable non-terminal, then A is nullable."
          : "Repeat until no new nullable symbols appear.",
    });
    if (added.length === 0) break;
    if (round > 200) break;
  }

  const startNullable = nullable.has(working.start);
  const expanded: Production[] = [];
  const expansionNotes: string[] = [];

  for (const p of working.productions) {
    const variants = expandProductionForEpsilon(p, nullable, working);
    const toAdd = variants.length ? variants : [p];
    for (const q of toAdd) expanded.push(q);
    if (variants.length > 1 || (p.right.length > 0 && variants.some((v) => v.right.length === 0))) {
      expansionNotes.push(
        `${formatProduction(p)} ⇒ { ${toAdd.map(formatProduction).join(" ; ")} }`
      );
    }
  }

  let withoutEpsilon = dedupeProductions(expanded.filter((p) => p.right.length > 0));
  if (startNullable) {
    const hasStartEps = withoutEpsilon.some(
      (p) => p.left === working.start && p.right.length === 0
    );
    if (!hasStartEps) {
      withoutEpsilon = dedupeProductions([
        ...withoutEpsilon,
        { left: working.start, right: [] },
      ]);
    }
  }

  steps.push({
    phase: "epsilon",
    label: "Expand productions (omit nullable symbols)",
    grammar: { ...working, productions: dedupeProductions(expanded) },
    blocks: expansionNotes.length
      ? [{ title: "Examples of expansion", items: expansionNotes.slice(0, 12) }]
      : undefined,
    explanation:
      "For each production, every subset of nullable non-terminals on the right may be dropped in a new production.",
  });

  steps.push({
    phase: "epsilon",
    label: "Remove ε-productions (preserve empty word if needed)",
    grammar: { ...working, productions: withoutEpsilon },
    explanation: startNullable
      ? `The start symbol ${working.start} was nullable, so ε remains in the language. A single ${working.start} → ε is kept if required.`
      : "All productions with an empty right-hand side are removed.",
  });

  return steps;
}

export function eliminateUnitsWithSteps(g: Grammar): GrammarStep[] {
  const steps: GrammarStep[] = [];
  const working = cloneGrammar(g);

  steps.push({
    phase: "unit",
    label: "Starting grammar (after ε-removal)",
    grammar: cloneGrammar(working),
    explanation:
      "A unit production has the form A → B with B a single non-terminal. We compute all unit pairs (A, B) where A ⇒* B using only unit steps, then replace unit steps with real productions.",
  });

  const closure = unitClosure(working);
  const pairLines: string[] = [];
  for (const a of [...closure.keys()].sort()) {
    const bs = [...closure.get(a)!].sort().filter((b) => b !== a);
    if (bs.length) pairLines.push(`${a} derives (via units): ${bs.join(", ")}`);
  }

  steps.push({
    phase: "unit",
    label: "Unit pairs (A, B) with A ⇒* B using only unit productions",
    grammar: cloneGrammar(working),
    blocks: pairLines.length ? [{ title: "Non-trivial unit derivations", items: pairLines }] : [],
    explanation:
      "Reflexive transitive closure: start with A → A; whenever A → B is a unit production and B derives C, add A derives C.",
  });

  const newProds: Production[] = [];
  for (const p of working.productions) {
    if (!isUnitProduction(p, working)) newProds.push(p);
  }

  for (const a of closure.keys()) {
    const targets = closure.get(a)!;
    for (const b of targets) {
      for (const p of working.productions) {
        if (p.left !== b) continue;
        if (isUnitProduction(p, working)) continue;
        newProds.push({ left: a, right: [...p.right] });
      }
    }
  }

  const finalG = { ...working, productions: dedupeProductions(newProds) };

  steps.push({
    phase: "unit",
    label: "Grammar without unit productions",
    grammar: finalG,
    explanation:
      "For each unit pair (A, B) and each non-unit production B → α, add A → α. Then drop all unit productions.",
  });

  return steps;
}

export function removeUselessWithSteps(g: Grammar): GrammarStep[] {
  const steps: GrammarStep[] = [];
  const working = cloneGrammar(g);

  steps.push({
    phase: "useless",
    label: "Starting grammar (for useless-symbol removal)",
    grammar: cloneGrammar(working),
    explanation:
      "A symbol is generating if it can derive a terminal string. It is reachable if it appears in some derivation from the start symbol. Symbols that are not both are useless.",
  });

  const { set: gen, iterations: genIter } = computeGenerating(working);
  steps.push({
    phase: "useless",
    label: "Generating symbols (terminal-generating)",
    grammar: cloneGrammar(working),
    blocks: genIter.map((batch, i) => ({
      title: i === 0 ? "Initially: all terminals" : `Round ${i}: newly generating non-terminals`,
      items: batch,
    })),
    explanation:
      "Terminals are generating. A non-terminal A is generating if there is a production A → α where every symbol in α is already generating.",
  });

  const g1 = filterGenerating(working, gen);
  steps.push({
    phase: "useless",
    label: "Drop productions that use non-generating symbols",
    grammar: g1,
    explanation:
      "Remove productions with a non-generating symbol on the right, then remove non-terminals that no longer appear on any right-hand side (implicit in filtered set).",
  });

  const { set: reach, iterations: reachIter } = computeReachable(g1);
  steps.push({
    phase: "useless",
    label: "Reachable symbols from start",
    grammar: cloneGrammar(g1),
    blocks: reachIter.map((batch, i) => ({
      title: i === 0 ? "Start symbol" : `Round ${i}: newly reachable`,
      items: batch,
    })),
    explanation:
      "The start symbol is reachable. If A is reachable and A → α is a production, every non-terminal in α is reachable.",
  });

  const g2 = filterReachable(g1, reach);
  steps.push({
    phase: "useless",
    label: "Final grammar — only reachable, generating symbols",
    grammar: g2,
    explanation:
      "Keep only productions whose left side is reachable and whose right-hand side uses only reachable non-terminals (and any terminals).",
  });

  return steps;
}

export function simplifyFullPipeline(initial: Grammar): GrammarStep[] {
  const eps = eliminateEpsilonWithSteps(initial);
  const afterEps = eps[eps.length - 1]!.grammar;
  const units = eliminateUnitsWithSteps(afterEps);
  const afterUnits = units[units.length - 1]!.grammar;
  const useless = removeUselessWithSteps(afterUnits);
  return [...eps, ...units, ...useless];
}
