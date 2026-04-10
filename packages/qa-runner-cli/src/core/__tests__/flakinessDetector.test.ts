import test from "node:test";
import assert from "node:assert/strict";
import { createFlakinessDetectorSkill } from "../index.js";

test("createFlakinessDetectorSkill computes pass rate and instability", async () => {
  const skill = createFlakinessDetectorSkill({ unstableThreshold: 0.3 });

  const first = await skill.recordSignal({ testId: "case-1", outcome: "pass" });
  assert.equal(first.recorded, true);
  assert.equal(first.passRate, 1);
  assert.equal(first.unstable, false);

  const second = await skill.recordSignal({ testId: "case-1", outcome: "fail" });
  assert.equal(second.totalRuns, 2);
  assert.equal(second.passRate, 0.5);
  assert.equal(second.flakeScore, 0.5);
  assert.equal(second.unstable, true);

  const third = await skill.recordSignal({ testId: "case-1", outcome: "fail", category: "selector" });
  assert.equal(third.totalRuns, 3);
  assert.equal(third.categoryBreakdown?.selector, 1);
  assert.equal(third.dominantCategory, "selector");
});
