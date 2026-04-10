import type {
  SelfHealingCandidate,
  SelfHealingConfig,
  SelfHealingInput,
  SelfHealingResult,
  SelfHealingSkill,
  SelfHealingStrategy,
} from "./types.js";

const defaultPriorityByStrategy: Record<SelfHealingStrategy, string[]> = {
  aggressive: ["data-testid", "aria-label", "role", "text", "visual-hash", "css", "xpath"],
  moderate: ["data-testid", "aria-label", "role", "text", "visual-hash", "css"],
  conservative: ["data-testid", "aria-label"],
};

const normalizeCandidate = (candidate: SelfHealingCandidate): SelfHealingCandidate => ({
  ...candidate,
  strategy: candidate.strategy.toLowerCase(),
  confidence: candidate.confidence ?? 0.5,
});

const buildFallbackCandidates = (input: SelfHealingInput): SelfHealingCandidate[] => {
  const candidates: SelfHealingCandidate[] = [];
  if (input.context?.dataTestId) {
    candidates.push({ strategy: "data-testid", selector: `[data-testid=\"${input.context.dataTestId}\"]`, confidence: 0.9 });
  }
  if (input.context?.ariaLabel) {
    candidates.push({ strategy: "aria-label", selector: `[aria-label=\"${input.context.ariaLabel}\"]`, confidence: 0.8 });
  }
  if (input.context?.role && input.context?.text) {
    candidates.push({
      strategy: "role",
      selector: `role=${input.context.role} name=\"${input.context.text}\"`,
      confidence: 0.7,
    });
  }
  if (input.context?.text) {
    candidates.push({ strategy: "text", selector: `text=\"${input.context.text}\"`, confidence: 0.6 });
  }
  candidates.push(...buildVisualHashCandidates(input));
  return candidates;
};

const tokenizeHash = (value: string): Set<string> => {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter(Boolean),
  );
};

const jaccardSimilarity = (left: Set<string>, right: Set<string>): number => {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

const buildVisualHashCandidates = (input: SelfHealingInput): SelfHealingCandidate[] => {
  const targetHash = input.context?.visualHash?.trim();
  if (!targetHash || !input.visualCandidates || input.visualCandidates.length === 0) {
    return [];
  }

  const targetTokens = tokenizeHash(targetHash);
  const scored = input.visualCandidates
    .map((item) => {
      const confidence = jaccardSimilarity(targetTokens, tokenizeHash(item.visualHash));
      return {
        strategy: "visual-hash",
        selector: item.selector,
        confidence,
        notes: item.notes,
      } satisfies SelfHealingCandidate;
    })
    .filter((candidate) => candidate.confidence !== undefined && candidate.confidence >= 0.4)
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

  return scored.length > 0 ? [scored[0]!] : [];
};

const pickBestCandidate = (candidates: SelfHealingCandidate[], priority: string[]): SelfHealingCandidate | null => {
  if (candidates.length === 0) {
    return null;
  }
  const byPriority = new Map(priority.map((value, index) => [value, index]));
  const scored = candidates.map((candidate) => {
    const normalized = normalizeCandidate(candidate);
    const order = byPriority.has(normalized.strategy) ? byPriority.get(normalized.strategy)! : priority.length + 1;
    const confidence = normalized.confidence ?? 0.5;
    return { candidate: normalized, order, confidence };
  });
  scored.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return (b.confidence ?? 0) - (a.confidence ?? 0);
  });
  return scored[0]?.candidate ?? null;
};

export const createSelfHealingSkill = (config: SelfHealingConfig = {}): SelfHealingSkill => {
  const strategy: SelfHealingStrategy = config.strategy ?? "moderate";
  const priority = config.priority ?? defaultPriorityByStrategy[strategy];

  return {
    name: "self-healing",
    async attemptRecovery(input: SelfHealingInput): Promise<SelfHealingResult> {
      const candidates = [
        ...(input.candidates ?? []),
        ...buildFallbackCandidates(input),
      ];

      const selected = pickBestCandidate(candidates, priority);
      if (!selected) {
        return {
          recovered: false,
          notes: "no candidates available",
        };
      }

      return {
        recovered: true,
        selector: selected.selector,
        strategy: selected.strategy,
        notes: selected.notes,
      };
    },
  };
};
