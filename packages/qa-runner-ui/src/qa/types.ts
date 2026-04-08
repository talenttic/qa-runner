export type QaCaseStatus = "not_started" | "in_progress" | "passed" | "failed" | "blocked";
export type QaRunMode = "manual" | "ai";
export type QaTestType =
  | "ui_functional"
  | "visual_regression"
  | "accessibility"
  | "integration_e2e"
  | "security";

export type QaTestTypeId = QaTestType | string;
export type QaAutomationStrategy = "continuous_fix" | "alert_only";

export interface QaSuite {
  id: string;
  name: string;
  description: string;
  status: "active" | "inactive";
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface QaSuiteFile {
  suiteId: string;
  fileName: string;
  relativePath: string;
  suiteName: string;
  feature: string;
  date: string;
}

export interface QaStepRunCheck {
  id: string;
  runId: string;
  caseId: string;
  stepId: string;
  checked: boolean;
  autoChecked: boolean;
  failureReason: string | null;
  updatedByUserId: string | null;
  updatedAt: string;
}

export interface QaCaseStep {
  id: string;
  caseId: string;
  text: string;
  expectedStepResult: string | null;
  orderIndex: number;
  check: QaStepRunCheck | null;
}

export interface QaCaseResult {
  id: string;
  runId: string;
  caseId: string;
  status: QaCaseStatus;
  notes: string;
  failureReason: string | null;
  testedBy: string | null;
  completedAt: string | null;
  evidence: Array<{ type: string; label: string; ref: string }>;
  updatedByUserId: string | null;
  updatedAt: string;
}

export interface QaCase {
  id: string;
  suiteId: string;
  title: string;
  useCase: string;
  expectedResult: string;
  priority: "low" | "medium" | "high" | "critical";
  tags: string[];
  playwrightMap: Record<string, unknown>;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
  steps: QaCaseStep[];
  result: QaCaseResult | null;
}

export interface QaRun {
  id: string;
  suiteId: string;
  mode: QaRunMode;
  executedByUserId: string;
  status: QaCaseStatus;
  notes: string;
  testedBy: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QaRunDetail {
  run: QaRun;
  suite: QaSuite;
  cases: QaCase[];
}

export interface QaRunCollaborator {
  id: string;
  name: string;
  createdAt: string;
}

export interface QaCaseComment {
  id: string;
  runId: string;
  caseId: string;
  author: string;
  message: string;
  createdAt: string;
}

export interface QaRunSharePayload {
  shareId: string;
  run: QaRun;
  suite: QaSuite;
  cases: Array<{ id: string; title: string; status: QaCaseStatus; notes: string; evidence: Array<{ type: string; label: string; ref: string }> }>;
  collaborators: QaRunCollaborator[];
  comments: QaCaseComment[];
  createdAt: string;
}

export interface QaGithubIssueRequest {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}

export interface QaGithubIssueResponse {
  id?: number;
  number?: number;
  html_url?: string;
  title?: string;
}

export interface QaManualRunReportCase {
  id: string;
  title: string;
  status: QaCaseStatus;
  tester: string | null;
  notes: string;
  failureReason: string | null;
  completedAt: string | null;
  totalSteps: number;
  checkedSteps: number;
  evidenceCount: number;
  evidence: Array<{ type: string; label: string; ref: string }>;
}

export interface QaManualRunReport {
  generatedAt: string;
  run: QaRun;
  suite: QaSuite;
  summary: {
    totalCases: number;
    passed: number;
    failed: number;
    blocked: number;
    inProgress: number;
    notStarted: number;
    completionRate: number;
  };
  cases: QaManualRunReportCase[];
}

export interface QaGeneratedCase {
  title: string;
  useCase: string;
  expectedResult: string;
  priority: "low" | "medium" | "high" | "critical";
  steps: string[];
  playwrightTags?: string[];
}

export interface QaGenerationJob {
  id: string;
  requestedByUserId: string;
  prompt: string;
  scope: {
    pluginIds?: string[];
    routes?: string[];
  };
  status: "queued" | "running" | "completed" | "failed";
  result: {
    suiteName: string;
    cases: QaGeneratedCase[];
    tests?: QaGeneratedTestArtifact[];
    selectedTestTypes?: QaTestType[];
    review?: QaTestQualityReview;
    intelligentReview?: QaIntelligentReview;
    intelligentFixProposals?: QaIntelligentFixProposal[];
    automation?: QaAutomationSummary;
  } | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QaGenerationStatus {
  autoSeeded: boolean;
  autoSeededAt: string | null;
}

export interface QaWorkspaceProfile {
  id: string;
  label: string;
  dbPath: string;
  casesDir: string;
  gitUrl?: string;
  isDefault: boolean;
}

export interface QaGeneratedTestArtifact {
  id: string;
  title: string;
  testType: QaTestType;
  riskLevel: "low" | "medium" | "high";
  tags: string[];
  featureKey: string;
  filePath: string;
  testIdSelectors: string[];
}

export interface QaTestQualityReviewIssue {
  id: string;
  severity: "low" | "medium" | "high";
  ruleId: string;
  message: string;
  filePath: string;
  line: number | null;
  suggestion: string;
}

export interface QaTestQualityReview {
  reviewedFiles: number;
  discoveredTests: number;
  loadedTests: number;
  score: number;
  issueCount: number;
  issues: QaTestQualityReviewIssue[];
}

export interface QaIntelligentReviewSuggestion {
  id: string;
  category:
    | "selector_stability"
    | "timing_stability"
    | "security_hygiene"
    | "assertion_quality"
    | "test_architecture";
  priority: "high" | "medium" | "low";
  confidence: number;
  rationale: string;
  suggestion: string;
  affectedFiles: string[];
  retestScope: "single_spec" | "affected_specs" | "full_suite";
}

export interface QaSuggestionModelMetadata {
  provider: string;
  model: string;
  mode: "heuristic" | "llm" | "hybrid";
}

export interface QaIntelligentReview {
  generatedAt: string;
  score: number;
  summary: string;
  metadata: QaSuggestionModelMetadata;
  suggestions: QaIntelligentReviewSuggestion[];
}

export interface QaIntelligentFixProposal {
  id: string;
  suggestionId: string;
  title: string;
  category: QaIntelligentReviewSuggestion["category"];
  priority: "high" | "medium" | "low";
  risk: "low" | "medium" | "high";
  confidence: number;
  filePath: string;
  changeType: "test_only" | "app_plus_test" | "config";
  diffPreview: string;
  retestScope: "single_spec" | "affected_specs" | "full_suite";
  status?: "pending" | "applied" | "failed";
  appliedAt?: string | null;
  applyError?: string | null;
  retestStatus?: "not_run" | "passed" | "failed";
  retestAt?: string | null;
  retestError?: string | null;
  retestCommand?: string | null;
}

export interface QaAutomationSummary {
  strategy: QaAutomationStrategy;
  status: "fixed" | "partial" | "attention" | "clean";
  startedAt: string;
  completedAt: string;
  iterations: number;
  appliedCount: number;
  passedRetests: number;
  failedRetests: number;
  remainingProposals: number;
  message: string;
}

export interface QaTestsLoadResult {
  generationJobId: string;
  loadedCount: number;
  tests: QaGeneratedTestArtifact[];
  loadedAt: string;
}

export interface QaAiPrepareResult {
  runId: string;
  generationJobId: string;
  executionJobId: string;
  status: "prepared";
  preparedAt: string;
  loadedCount: number;
  selectedTestTypes: QaTestType[];
  checks: {
    lint: "passed";
    typecheck: "passed";
    specParse: "passed";
  };
}

export interface QaAiExecuteResult {
  runId: string;
  executionJobId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  startedAt: string | null;
  completedAt: string | null;
  playwrightCommand: string;
  artifacts: {
    reportRef: string;
    traceRef: string;
    videoRef: string;
  };
  error?: string;
}

export interface QaAiExecutionStatus {
  id: string;
  runId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  playwrightCommand: string;
  reportRef: string | null;
  traceRef: string | null;
  videoRef: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QaPlaywrightArtifacts {
  runId: string;
  executionJobId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  playwrightCommand: string;
  artifacts: {
    reportRef: string;
    traceRef: string;
    videoRef: string;
  };
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface QaMarkdownValidationIssue {
  filePath: string;
  line: number;
  code: string;
  level: "error" | "warning";
  message: string;
}

export interface QaMarkdownValidationReport {
  scannedFiles: number;
  errorCount: number;
  warningCount: number;
  issues: QaMarkdownValidationIssue[];
}

export interface QaRuntimeStatus {
  aiEnabled: boolean;
  playwrightUiEnabled?: boolean;
  executionMode: "stub" | "shell";
  executionTimeoutMs: number;
  workspaceRoot?: string;
  casesRoot?: string;
  pomRuleMode?: "off" | "warn" | "strict";
  pomDirectLocatorThreshold?: number;
  scheduledAlertOnlyEnabled?: boolean;
  scheduledAlertOnlyIntervalMs?: number;
  scheduledAlertOnlyMaxIterations?: number;
  scheduledAlertOnlyActorId?: string;
  evidenceStorageMode?: "metadata_only";
  executionIsolationMode?: "local_worker";
  qaDataScopeMode?: "global";
  extractionTiming?: "in_repo_until_v1";
}

export interface QaCustomTestType {
  id: string;
  label: string;
  description: string;
  details: string;
}
