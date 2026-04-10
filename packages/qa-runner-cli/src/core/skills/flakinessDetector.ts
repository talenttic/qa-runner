import type { FlakinessDetectorSkill, FlakinessRecord, FlakinessSignal } from "./types.js";

export type FlakinessDetectorConfig = {
  unstableThreshold?: number;
};

type SignalStore = Map<string, FlakinessSignal[]>;

const computeFlakiness = (signals: FlakinessSignal[], unstableThreshold: number): FlakinessRecord => {
  if (signals.length === 0) {
    return {
      recorded: false,
      flakeScore: 0,
      passRate: 1,
      totalRuns: 0,
      unstable: false,
      categoryBreakdown: { timing: 0, selector: 0, assertion: 0 },
      dominantCategory: "none",
    };
  }

  const passCount = signals.filter((item) => item.outcome === "pass").length;
  const passRate = passCount / signals.length;
  const flakeScore = Number((1 - passRate).toFixed(3));
  const categoryBreakdown = signals.reduce(
    (acc, item) => {
      if (item.category === "timing") acc.timing += 1;
      if (item.category === "selector") acc.selector += 1;
      if (item.category === "assertion") acc.assertion += 1;
      return acc;
    },
    { timing: 0, selector: 0, assertion: 0 },
  );
  const ranked = Object.entries(categoryBreakdown)
    .sort((a, b) => b[1] - a[1])
    .filter((entry) => entry[1] > 0);
  const dominantCategory = (ranked[0]?.[0] as "timing" | "selector" | "assertion" | undefined) ?? "none";

  return {
    recorded: true,
    flakeScore,
    passRate: Number(passRate.toFixed(3)),
    totalRuns: signals.length,
    unstable: flakeScore >= unstableThreshold,
    categoryBreakdown,
    dominantCategory,
  };
};

export const createFlakinessDetectorSkill = (config: FlakinessDetectorConfig = {}): FlakinessDetectorSkill => {
  const unstableThreshold = config.unstableThreshold ?? 0.2;
  const store: SignalStore = new Map();

  return {
    name: "flakiness-detector",
    async recordSignal(input: FlakinessSignal): Promise<FlakinessRecord> {
      const signals = store.get(input.testId) ?? [];
      signals.push(input);
      store.set(input.testId, signals);
      return computeFlakiness(signals, unstableThreshold);
    },
  };
};
