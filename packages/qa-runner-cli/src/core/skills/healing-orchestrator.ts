import type { SelfHealingConfig } from "./types.js";

export type HealingRetryDecision = {
  shouldRetry: boolean;
  delayMs: number;
  remainingBudget: number | null;
};

export type HealingFailureCategory = "timeout" | "selector" | "navigation" | "assertion" | "unknown";

export type HealingAttempt = {
  testId?: string;
  selector?: string;
  recovered: boolean;
  strategy?: string;
  category?: HealingFailureCategory;
  occurredAt: string;
};

const defaultBackoff = (attempt: number): number => Math.min(250 * Math.pow(2, attempt), 4000);

export const decideHealingRetry = (attempt: number, config: SelfHealingConfig = {}): HealingRetryDecision => {
  const retryBudget = typeof config.retryBudget === "number" ? config.retryBudget : 2;
  const remaining = retryBudget >= 0 ? Math.max(retryBudget - attempt, 0) : null;
  const shouldRetry = retryBudget < 0 ? true : attempt < retryBudget;

  return {
    shouldRetry,
    delayMs: shouldRetry ? defaultBackoff(attempt) : 0,
    remainingBudget: remaining,
  };
};

export const categorizeHealingFailure = (message: string): HealingFailureCategory => {
  const text = message.toLowerCase();
  if (text.includes("timeout")) return "timeout";
  if (text.includes("selector") || text.includes("element") || text.includes("not found")) return "selector";
  if (text.includes("navigation") || text.includes("page") || text.includes("frame")) return "navigation";
  if (text.includes("assert")) return "assertion";
  return "unknown";
};

export const createHealingAttempt = (input: Omit<HealingAttempt, "occurredAt">): HealingAttempt => {
  return {
    ...input,
    occurredAt: new Date().toISOString(),
  };
};
