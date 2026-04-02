import type { Grammar } from "../grammar/types";
import { formatProduction } from "../grammar/parse";

type Props = {
  grammar: Grammar;
  highlight?: "start";
};

export function GrammarDisplay({ grammar, highlight }: Props) {
  const byLeft = new Map<string, typeof grammar.productions>();
  const order: string[] = [];
  for (const p of grammar.productions) {
    if (!byLeft.has(p.left)) order.push(p.left);
    if (!byLeft.has(p.left)) byLeft.set(p.left, []);
    byLeft.get(p.left)!.push(p);
  }

  return (
    <div className="grammar-display" role="region" aria-label="Grammar productions">
      <div className="grammar-meta">
        Start symbol:{" "}
        <span className={highlight === "start" ? "grammar-start" : ""}>
          {grammar.start}
        </span>
      </div>
      <ul className="grammar-rules">
        {order.map((left) => {
          const group = byLeft.get(left) ?? [];
          const rhs = group.map((p) =>
            p.right.length === 0 ? "ε" : p.right.join(" ")
          );
          return (
            <li key={left}>
              <span className="grammar-lhs">{left}</span>
              <span className="grammar-arrow"> → </span>
              <span className="grammar-rhs">{rhs.join(" | ")}</span>
            </li>
          );
        })}
      </ul>
      <details className="grammar-raw">
        <summary>Linear production list</summary>
        <pre>{grammar.productions.map(formatProduction).join("\n")}</pre>
      </details>
    </div>
  );
}
