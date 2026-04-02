import { useMemo, useState } from "react";
import { GrammarDisplay } from "./components/GrammarDisplay";
import { formatGrammar, parseGrammar } from "./grammar/parse";
import { simplifyFullPipeline } from "./grammar/simplify";
import type { GrammarStep } from "./grammar/types";
import "./App.css";

const PRESETS: { name: string; text: string; start?: string }[] = [
  {
    name: "Classic (nullable + units + useless)",
    text: `# S -> A B; A,B nullable; includes unreachable/useless
S -> A B
A -> a A | ε
B -> B b | ε
C -> c`,
  },
  {
    name: "Unit chain",
    text: `S -> A
A -> B
B -> a | b`,
  },
  {
    name: "Simple ε only",
    text: `S -> A a B
A -> a | ε
B -> b | ε`,
  },
];

function phaseLabel(phase: GrammarStep["phase"]): string {
  switch (phase) {
    case "epsilon":
      return "1 · Eliminate ε-productions";
    case "unit":
      return "2 · Remove unit productions";
    case "useless":
      return "3 · Remove useless symbols";
    default:
      return phase;
  }
}

function phaseClass(phase: GrammarStep["phase"]): string {
  return `phase-badge phase-${phase}`;
}

export default function App() {
  const [raw, setRaw] = useState(PRESETS[0]!.text);
  const [startOverride, setStartOverride] = useState("");
  const [stepIndex, setStepIndex] = useState(0);

  const parsed = useMemo(() => {
    try {
      const start = startOverride.trim() || undefined;
      const initialGrammar = parseGrammar(raw, start);
      const s = simplifyFullPipeline(initialGrammar);
      return {
        ok: true as const,
        initial: initialGrammar,
        steps: s,
        error: null as string | null,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false as const,
        initial: null,
        steps: [] as GrammarStep[],
        error: msg,
      };
    }
  }, [raw, startOverride]);

  const { initial, steps, error: parseError } = parsed;

  const safeIndex = Math.min(stepIndex, Math.max(0, steps.length - 1));
  const current = steps[safeIndex];

  const loadPreset = (i: number) => {
    const p = PRESETS[i];
    if (!p) return;
    setRaw(p.text);
    setStartOverride(p.start ?? "");
    setStepIndex(0);
  };

  const recompute = () => {
    setStepIndex(0);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            λ
          </span>
          <div>
            <h1>SimplyGrammar</h1>
            <p className="tagline">
              Step-by-step context-free grammar simplification:
              ε-removal, unit removal, and useless-symbol elimination.
            </p>
          </div>
        </div>
      </header>

      <main className="app-main">
        <section className="panel input-panel" aria-labelledby="edit-heading">
          <h2 id="edit-heading">Grammar</h2>
          <p className="hint">
            One production per line: <code>S -&gt; a A | ε</code>. Use space between
            symbols; <code>ε</code> (or <code>epsilon</code>) is the empty string.
            Lines starting with <code>#</code> are comments.
          </p>
          <label className="field-label" htmlFor="start">
            Start symbol (optional)
          </label>
          <input
            id="start"
            className="field-input"
            type="text"
            placeholder="Defaults to first LHS"
            value={startOverride}
            onChange={(e) => {
              setStartOverride(e.target.value);
              setStepIndex(0);
            }}
          />
          <label className="field-label" htmlFor="grammar-text">
            Productions
          </label>
          <textarea
            id="grammar-text"
            className="grammar-textarea"
            spellCheck={false}
            rows={12}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onBlur={recompute}
          />
          {parseError && (
            <p className="error" role="alert">
              {parseError}
            </p>
          )}
          <div className="preset-row">
            <span className="field-label">Examples</span>
            <div className="preset-buttons">
              {PRESETS.map((p, i) => (
                <button
                  key={p.name}
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => loadPreset(i)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="btn btn-primary" onClick={recompute}>
            Parse &amp; rebuild steps
          </button>
        </section>

        <section className="panel steps-panel" aria-labelledby="steps-heading">
          <h2 id="steps-heading">Simplification trace</h2>
          {!initial || steps.length === 0 ? (
            <p className="muted">Fix the grammar above to see steps.</p>
          ) : (
            <>
              <div className="step-nav">
                <button
                  type="button"
                  className="btn"
                  disabled={safeIndex <= 0}
                  onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                >
                  Previous
                </button>
                <span className="step-counter">
                  Step {safeIndex + 1} / {steps.length}
                </span>
                <button
                  type="button"
                  className="btn"
                  disabled={safeIndex >= steps.length - 1}
                  onClick={() =>
                    setStepIndex((i) => Math.min(steps.length - 1, i + 1))
                  }
                >
                  Next
                </button>
              </div>
              <input
                className="step-slider"
                type="range"
                min={0}
                max={steps.length - 1}
                value={safeIndex}
                onChange={(e) => setStepIndex(Number(e.target.value))}
                aria-valuetext={`Step ${safeIndex + 1} of ${steps.length}`}
              />
              {current && (
                <article className="step-card">
                  <div className="step-card-head">
                    <span className={phaseClass(current.phase)}>
                      {phaseLabel(current.phase)}
                    </span>
                    <h3 className="step-title">{current.label}</h3>
                  </div>
                  {current.explanation && (
                    <p className="step-explain">{current.explanation}</p>
                  )}
                  {current.blocks?.map((b) => (
                    <div key={b.title} className="step-block">
                      <h4>{b.title}</h4>
                      {b.body && <p>{b.body}</p>}
                      {b.items && b.items.length > 0 && (
                        <ul>
                          {b.items.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                  <GrammarDisplay grammar={current.grammar} highlight="start" />
                  <details className="export-grammar">
                    <summary>Copy as text</summary>
                    <pre>{formatGrammar(current.grammar)}</pre>
                  </details>
                </article>
              )}
            </>
          )}
        </section>
      </main>

      <footer className="app-footer">
        <p>
          Order of operations matches common textbooks: ε-productions, then unit
          productions, then useless symbols (non-generating and unreachable).
        </p>
      </footer>
    </div>
  );
}
