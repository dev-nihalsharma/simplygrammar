/** One production A → right (empty right means ε). */
export type Production = {
  left: string;
  right: string[];
};

export type Grammar = {
  start: string;
  productions: Production[];
};

export type SimplificationPhase =
  | "epsilon"
  | "unit"
  | "useless";

export type StepBlock = {
  title: string;
  body?: string;
  items?: string[];
};

export type GrammarStep = {
  phase: SimplificationPhase;
  label: string;
  grammar: Grammar;
  explanation?: string;
  blocks?: StepBlock[];
};
