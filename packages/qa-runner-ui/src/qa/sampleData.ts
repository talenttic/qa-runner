import type { QaCase, QaRunDetail, QaSuite } from "./types";

const now = new Date().toISOString();

export const sampleSuite: QaSuite = {
  id: "suite_sample",
  name: "Sample QA Suite",
  description: "Getting started sample suite.",
  status: "active",
  version: 1,
  createdAt: now,
  updatedAt: now,
};

export const sampleCases: QaCase[] = [
  {
    id: "case_sample_login",
    suiteId: sampleSuite.id,
    title: "Login happy path",
    useCase: "A user can sign in with valid credentials.",
    expectedResult: "User is redirected to the dashboard.",
    priority: "high",
    tags: ["sample"],
    playwrightMap: {},
    orderIndex: 1,
    createdAt: now,
    updatedAt: now,
    steps: [
      {
        id: "step_sample_1",
        caseId: "case_sample_login",
        text: "Open /login",
        expectedStepResult: null,
        orderIndex: 1,
        check: null,
      },
      {
        id: "step_sample_2",
        caseId: "case_sample_login",
        text: "Enter valid email and password",
        expectedStepResult: null,
        orderIndex: 2,
        check: null,
      },
      {
        id: "step_sample_3",
        caseId: "case_sample_login",
        text: "Submit the form and verify redirect",
        expectedStepResult: null,
        orderIndex: 3,
        check: null,
      },
    ],
    result: null,
  },
  {
    id: "case_sample_error",
    suiteId: sampleSuite.id,
    title: "Login error handling",
    useCase: "A user sees an error for invalid credentials.",
    expectedResult: "Error toast is displayed without page crash.",
    priority: "medium",
    tags: ["sample"],
    playwrightMap: {},
    orderIndex: 2,
    createdAt: now,
    updatedAt: now,
    steps: [
      {
        id: "step_sample_4",
        caseId: "case_sample_error",
        text: "Enter invalid credentials",
        expectedStepResult: null,
        orderIndex: 1,
        check: null,
      },
      {
        id: "step_sample_5",
        caseId: "case_sample_error",
        text: "Verify error message is displayed",
        expectedStepResult: null,
        orderIndex: 2,
        check: null,
      },
    ],
    result: null,
  },
];

export const sampleRunDetail: QaRunDetail = {
  run: {
    id: "run_sample",
    suiteId: sampleSuite.id,
    mode: "manual",
    executedByUserId: "local",
    status: "not_started",
    notes: "Demo mode run summary",
    testedBy: null,
    startedAt: now,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  },
  suite: sampleSuite,
  cases: sampleCases,
};
