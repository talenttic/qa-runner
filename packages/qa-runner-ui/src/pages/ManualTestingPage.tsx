import { useEffect, useMemo, useRef, useState } from "react";
import { SectionHeader, SurfaceCard } from "../components/Infographic";
import { Skeleton } from "../components/Skeleton";
import {
  addQaCaseEvidence,
  addCaseComment as addCaseCommentApi,
  addRunCollaborator,
  archiveQaSuite,
  applyQaFixProposal,
  createQaGeneratedTestsJob,
  createQaGenerationJob,
  deleteQaWorkspace,
  createQaRun,
  createRunShare,
  createGithubIssue,
  deleteQaSuite,
  deleteCaseComment as deleteCaseCommentApi,
  duplicateQaSuite,
  executeQaAiRun,
  fetchQaCustomTestTypes,
  fetchCaseComments,
  fetchQaArchivedSuites,
  fetchQaAiExecutionStatus,
  fetchQaGenerationHistory,
  fetchQaGenerationJob,
  fetchQaGenerationStatus,
  fetchQaWorkspaces,
  fetchQaMarkdownValidation,
  fetchQaRuntimeStatus,
  fetchQaRunReport,
  fetchQaRuns,
  fetchQaRunDetail,
  fetchQaSuites,
  fetchQaSuiteFiles,
  fetchQaSuiteMarkdown,
  fetchRunCollaborators,
  finalizeQaRun,
  generateQaFixProposals,
  loadQaExistingTests,
  loadQaGeneratedTests,
  prepareQaAiRun,
  removeRunCollaborator,
  retestQaFixProposal,
  restoreQaArchivedSuite,
  runQaAutomation,
  saveQaWorkspace,
  syncQaWorkspace,
  triggerQaRunReportWebhook,
  runQaIntelligentReview,
  updateQaCaseResult,
  updateQaStepCheck,
} from "../qa/api";
import type {
  QaAiExecuteResult,
  QaAiPrepareResult,
  QaCase,
  QaCaseComment,
  QaCaseStatus,
  QaCustomTestType,
  QaGenerationJob,
  QaGenerationStatus,
  QaWorkspaceProfile,
  QaManualRunReport,
  QaMarkdownValidationReport,
  QaRunDetail,
  QaRunCollaborator,
  QaRuntimeStatus,
  QaSuite,
  QaTestType,
  QaTestTypeId,
  QaTestsLoadResult,
} from "../qa/types";
import { sampleRunDetail, sampleSuite } from "../qa/sampleData";

const QA_ACTIVE_EXECUTION_STORAGE_KEY = "qa_runner_active_execution_v1";

const statusPillClass = (status: QaCaseStatus): string => {
  if (status === "passed") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
  if (status === "failed") return "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300";
  if (status === "blocked") return "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
  if (status === "in_progress") return "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300";
  return "bg-surface-200 text-ink-700 dark:bg-slate-800 dark:text-slate-300";
};

const isEnabled = (value: unknown, fallback: boolean): boolean => {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const formatDurationMinutes = (ms: number | undefined): string => {
  if (!ms) return "0m";
  const minutes = Math.round(ms / (1000 * 60));
  return `${minutes}m`;
};

const parseMarkdownSuite = (content: string) => {
  const lines = content.split("\n");
  const suiteName = lines.find((line) => line.trim().startsWith("# "))?.replace(/^#\s+/, "") ?? "Untitled Suite";
  const suiteId = `suite_${Date.now()}`;
  const cases: Array<{
    id: string;
    title: string;
    useCase: string;
    expectedResult: string;
    priority: "low" | "medium" | "high" | "critical";
    steps: { id: string; text: string; expectedStepResult: string | null; orderIndex: number }[];
  }> = [];

  let currentCase: typeof cases[number] | null = null;
  let inSteps = false;

  for (const raw of lines) {
    const line = raw.trim();
    const normalized = line.replace(/^[-*]\s+/, "");
    // Handle case headers: "## [key] Title" format
    if (line.startsWith("## ")) {
      if (currentCase) {
        cases.push(currentCase);
      }
      // Extract title, removing ## prefix and optional numbering
      let title = line.replace(/^##\s+\d*\.?\s*/, "");
      // If title has [key] format, extract just the title part
      const bracketMatch = title.match(/^\[([^\]]+)\]\s+(.+)$/);
      if (bracketMatch) {
        title = bracketMatch[2];
      }
      const caseId = `case_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      currentCase = {
        id: caseId,
        title,
        useCase: "",
        expectedResult: "",
        priority: "medium",
        steps: [],
      };
      inSteps = false;
      continue;
    }
    if (!currentCase) continue;
    if (normalized.toLowerCase().startsWith("use case:")) {
      currentCase.useCase = normalized.replace(/use case:\s*/i, "");
      continue;
    }
    if (normalized.toLowerCase().startsWith("expected result:") || normalized.toLowerCase().startsWith("expected:")) {
      currentCase.expectedResult = normalized.replace(/expected result:\s*/i, "").replace(/expected:\s*/i, "");
      continue;
    }
    if (normalized.toLowerCase().startsWith("priority:")) {
      const value = normalized.replace(/priority:\s*/i, "").toLowerCase();
      if (value === "low" || value === "medium" || value === "high" || value === "critical") {
        currentCase.priority = value;
      }
      continue;
    }
    if (normalized.toLowerCase().startsWith("steps:") || /^#{2,6}\s*steps\b/i.test(normalized)) {
      inSteps = true;
      continue;
    }
    if (inSteps) {
      if (line.startsWith("#")) {
        inSteps = false;
        continue;
      }
      const match = line.match(/^(?:-|\d+\.)\s+(.*)$/);
      if (match?.[1]) {
        const index = currentCase.steps.length + 1;
        const stepId = `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const stepText = match[1].replace(/^\[[ xX]\]\s*/, "").trim();
        currentCase.steps.push({
          id: stepId,
          text: stepText,
          expectedStepResult: null,
          orderIndex: index,
        });
      }
    }
  }
  if (currentCase) {
    cases.push(currentCase);
  }

  const suite: QaSuite = {
    id: suiteId,
    name: suiteName,
    description: "",
    status: "active",
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return { suite, cases };
};

const quickFixForValidationCode = (code: string): string => {
  if (code === "filename.invalid_pattern") {
    return "Rename file to: YYYY-MM-DD__feature-name.md";
  }
  if (code === "suite.missing_title") {
    return "Add first line: # <Suite Name>";
  }
  if (code === "suite.missing_feature") {
    return "Add metadata line: feature: <feature-slug>";
  }
  if (code === "suite.missing_date") {
    return "Add metadata line: date: YYYY-MM-DD";
  }
  if (code === "suite.missing_cases") {
    return "Add at least one case section: ## [case-key] Case Title";
  }
  if (code === "case.missing_use_case") {
    return "Add: - Use Case: <scenario description>";
  }
  if (code === "case.missing_expected") {
    return "Add: - Expected: <expected outcome>";
  }
  if (code === "case.missing_steps_header") {
    return "Add section header: ### Steps";
  }
  if (code === "case.missing_steps") {
    return "Add checklist steps: - [ ] <step>";
  }
  if (code === "case.missing_functional_flow_instruction") {
    return "Add a step with functional action: navigate/open/click/submit/fill.";
  }
  if (code === "case.missing_console_check_instruction") {
    return "Add a step: verify browser console has no errors.";
  }
  if (code === "case.missing_network_check_instruction") {
    return "Add a step: verify network/API requests and failed calls.";
  }
  if (code === "case.missing_expected_verification_instruction") {
    return "Add a verification step: verify/assert expected result.";
  }
  return "Update markdown content to satisfy the required case template fields.";
};

const testProfileOptions: Array<{ id: QaTestType; label: string; description: string; details: string }> = [
  {
    id: "ui_functional",
    label: "UI Functional",
    description: "Core interaction and state behavior.",
    details: "Checks form actions, button flows, navigation outcomes, and success/error UI states.",
  },
  {
    id: "visual_regression",
    label: "Visual Regression",
    description: "Screenshot baseline checks.",
    details: "Captures and compares screenshots to detect layout, spacing, and style regressions.",
  },
  {
    id: "accessibility",
    label: "Accessibility",
    description: "A11y and semantic validation checks.",
    details: "Validates roles, labels, keyboard flow, and common WCAG accessibility assertions.",
  },
  {
    id: "integration_e2e",
    label: "Integration / E2E",
    description: "Cross-page and dependency flows.",
    details: "Verifies multi-step workflows across pages and integrations with backend dependencies.",
  },
  {
    id: "security",
    label: "Security Testing",
    description: "Auth, access, and security controls.",
    details: "Checks auth/session boundaries, permission enforcement, sensitive route protection, and secure failure behavior.",
  },
];

const nativeTestTypeIds = new Set<QaTestType>([
  "ui_functional",
  "visual_regression",
  "accessibility",
  "integration_e2e",
  "security",
]);

export const ManualTestingPage = () => {
  const aiModeEnabled = isEnabled(import.meta.env.VITE_QA_RUNNER_AI_ENABLED, true);
  const [mode, setMode] = useState<"manual" | "ai">("manual");
  const hideModeSwitch = false;
  return <ManualTestingPageContent aiModeEnabled={aiModeEnabled} mode={mode} setMode={setMode} hideModeSwitch={hideModeSwitch} />;
};

export const ManualOnlyTestingPage = () => {
  const aiModeEnabled = isEnabled(import.meta.env.VITE_QA_RUNNER_AI_ENABLED, true);
  return (
    <ManualTestingPageContent
      aiModeEnabled={aiModeEnabled}
      mode="manual"
      setMode={undefined}
      hideModeSwitch
    />
  );
};

export const AiOnlyTestingPage = () => {
  const aiModeEnabled = isEnabled(import.meta.env.VITE_QA_RUNNER_AI_ENABLED, true);
  return (
    <ManualTestingPageContent
      aiModeEnabled={aiModeEnabled}
      mode="ai"
      setMode={undefined}
      hideModeSwitch
    />
  );
};

type ManualTestingPageContentProps = {
  aiModeEnabled: boolean;
  mode: "manual" | "ai";
  setMode?: (mode: "manual" | "ai") => void;
  hideModeSwitch: boolean;
};

type CaseFilterMode = "incomplete" | "all" | "completed";
type QaDestructiveAction = "archive" | "delete";

const ManualTestingPageContent = ({
  aiModeEnabled,
  mode,
  setMode,
  hideModeSwitch,
}: ManualTestingPageContentProps) => {

  const [suites, setSuites] = useState<QaSuite[]>([]);
  const [selectedSuiteId, setSelectedSuiteId] = useState("");
  const [runDetail, setRunDetail] = useState<QaRunDetail | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [caseNotes, setCaseNotes] = useState("");
  const [runNotes, setRunNotes] = useState("");
  const [testerName, setTesterName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [caseFilterMode, setCaseFilterMode] = useState<CaseFilterMode>("incomplete");
  const [autoLoadedSuiteId, setAutoLoadedSuiteId] = useState<string>("");
  const [archivedSuites, setArchivedSuites] = useState<
    Array<{ fileName: string; relativePath: string; suiteName: string; feature: string; date: string }>
  >([]);
  const [selectedArchivedFileName, setSelectedArchivedFileName] = useState<string>("");
  const [validationReport, setValidationReport] = useState<QaMarkdownValidationReport | null>(null);
  const [runHistory, setRunHistory] = useState<Array<{ id: string; status: QaCaseStatus; mode: "manual" | "ai"; createdAt: string; completedAt: string | null }>>([]);
  const [runHistoryLoading, setRunHistoryLoading] = useState(false);
  const [runDetailLoading, setRunDetailLoading] = useState(false);
  const [importedRunReport, setImportedRunReport] = useState<QaManualRunReport | null>(null);
  const [importError, setImportError] = useState("");
  const [importedSuiteConfig, setImportedSuiteConfig] = useState<{
    suite: { id: string; name: string; description: string };
    cases: Array<{
      id: string;
      title: string;
      useCase: string;
      expectedResult: string;
      priority: "low" | "medium" | "high" | "critical";
      steps: { id: string; text: string; expectedStepResult: string | null; orderIndex: number }[];
    }>;
  } | null>(null);
  const [importConfigError, setImportConfigError] = useState("");
  const [evidenceType, setEvidenceType] = useState("link");
  const [evidenceLabel, setEvidenceLabel] = useState("");
  const [evidenceRef, setEvidenceRef] = useState("");

  const [generatePrompt, setGeneratePrompt] = useState("");
  const [generatePlugins, setGeneratePlugins] = useState("");
  const [generateRoutes, setGenerateRoutes] = useState("");
  const [existingTestDir, setExistingTestDir] = useState("e2e/ui/tests");
  const [existingTags, setExistingTags] = useState("");
  const [generationJob, setGenerationJob] = useState<QaGenerationJob | null>(null);
  const [generationHistory, setGenerationHistory] = useState<QaGenerationJob[]>([]);
  const [generationStatus, setGenerationStatus] = useState<QaGenerationStatus | null>(null);
  const [selectedTestTypes, setSelectedTestTypes] = useState<QaTestTypeId[]>(["ui_functional"]);
  const [infoProfileId, setInfoProfileId] = useState<QaTestTypeId | null>(null);
  const [customTestTypes, setCustomTestTypes] = useState<QaCustomTestType[]>([]);
  const getNativeTestTypes = (): QaTestType[] =>
    selectedTestTypes.filter((type): type is QaTestType => nativeTestTypeIds.has(type as QaTestType));
  const [loadResult, setLoadResult] = useState<QaTestsLoadResult | null>(null);
  const [prepareResult, setPrepareResult] = useState<QaAiPrepareResult | null>(null);
  const [executeResult, setExecuteResult] = useState<QaAiExecuteResult | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<QaRuntimeStatus | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeAutoRefresh, setRuntimeAutoRefresh] = useState(false);
  const [destructiveModalAction, setDestructiveModalAction] = useState<QaDestructiveAction | null>(null);
  const [destructiveReason, setDestructiveReason] = useState("");
  const destructiveModalRef = useRef<HTMLDivElement | null>(null);
  const destructiveReasonRef = useRef<HTMLTextAreaElement | null>(null);
  const [aiPolling, setAiPolling] = useState(false);
  const [aiPollError, setAiPollError] = useState("");
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [searchTerm, setSearchTerm] = useState("");
  const [caseSearchTerm, setCaseSearchTerm] = useState("");
  const [caseComments, setCaseComments] = useState<QaCaseComment[]>([]);
  const [commentAuthor, setCommentAuthor] = useState("");
  const [commentMessage, setCommentMessage] = useState("");
  const [collaborators, setCollaborators] = useState<QaRunCollaborator[]>([]);
  const [collaboratorInput, setCollaboratorInput] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [githubOwner, setGithubOwner] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [githubTitle, setGithubTitle] = useState("");
  const [githubBody, setGithubBody] = useState("");
  const [githubLabels, setGithubLabels] = useState("");
  const [githubAssignees, setGithubAssignees] = useState("");
  const [githubStatus, setGithubStatus] = useState("");
  const [githubIssueUrl, setGithubIssueUrl] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const [showCollaborationPanel, setShowCollaborationPanel] = useState(true);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [activeSection, setActiveSection] = useState<"manual" | "ai" | "team" | "settings">("manual");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [workspaceProfiles, setWorkspaceProfiles] = useState<QaWorkspaceProfile[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() =>
    typeof window !== "undefined" ? window.localStorage.getItem("qa_runner_workspace_id") ?? "default" : "default",
  );
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newWorkspacePath, setNewWorkspacePath] = useState("");
  const [newWorkspaceGitUrl, setNewWorkspaceGitUrl] = useState("");
  const [workspaceStatus, setWorkspaceStatus] = useState("");

  const selectedCase = useMemo<QaCase | null>(() => {
    if (!runDetail || !selectedCaseId) {
      return null;
    }
    return runDetail.cases.find((item) => item.id === selectedCaseId) ?? null;
  }, [runDetail, selectedCaseId]);


  const filteredCases = useMemo<QaCase[]>(() => {
    if (!runDetail) {
      return [];
    }
    let cases = runDetail.cases;

    // Apply status filter
    if (caseFilterMode === "completed") {
      cases = cases.filter((item) => {
        const status = item.result?.status ?? "not_started";
        return status === "passed" || status === "failed" || status === "blocked";
      });
    } else if (caseFilterMode === "incomplete") {
      cases = cases.filter((item) => {
        const status = item.result?.status ?? "not_started";
        return status === "not_started" || status === "in_progress";
      });
    }
    // "all" mode includes all cases

    // Apply search filter
    if (caseSearchTerm.trim()) {
      const term = caseSearchTerm.toLowerCase();
      cases = cases.filter((item) =>
        item.title.toLowerCase().includes(term) ||
        item.useCase?.toLowerCase().includes(term) ||
        item.expectedResult?.toLowerCase().includes(term)
      );
    }

    return cases;
  }, [runDetail, caseFilterMode, caseSearchTerm]);

  const showManualSection = activeSection === "manual";
  const showAiSection = activeSection === "ai";
  const showTeamSection = activeSection === "team";
  const showSettingsSection = activeSection === "settings";

  const collaborationPanel = (
    <div className="rounded-[28px] border border-surface-200 bg-white/95 p-5 shadow-[0_30px_70px_rgba(15,23,42,0.12)] dark:border-slate-800/60 dark:bg-slate-950/90">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-200">
            <span className="text-lg font-semibold">T</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-900 dark:text-white">Team Hub</p>
            <p className="text-xs text-ink-500 dark:text-slate-400">Run sharing & collaborators</p>
          </div>
        </div>
      </div>

      <details open className="mt-4">
        <summary className="flex cursor-pointer items-center justify-between rounded-2xl border border-surface-200 bg-surface-50 px-3 py-2 text-xs font-semibold text-ink-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
          Team & Collaboration
          <span className="text-xs text-ink-400">›</span>
        </summary>
        {showCollaborationPanel ? (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={collaboratorInput}
                onChange={(event) => setCollaboratorInput(event.target.value)}
                placeholder="Add collaborator name"
                className="w-full rounded-2xl border border-surface-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                data-testid="qa-collab-input"
              />
              <button
                type="button"
                onClick={() => addCollaborator()}
                disabled={busy}
                className="w-full rounded-2xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 disabled:opacity-60 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-200"
                data-testid="qa-collab-add"
              >
                Add Collaborator
              </button>
              <button
                type="button"
                onClick={() => void shareRunSummary()}
                disabled={busy}
                className="w-full rounded-2xl border border-surface-200 bg-white px-3 py-2 text-xs font-semibold text-ink-700 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                data-testid="qa-share-run"
              >
                Create Share Link
              </button>
            </div>
            {collaborators.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {collaborators.map((collaborator) => (
                  <span
                    key={collaborator.id}
                    className="inline-flex items-center gap-2 rounded-full border border-surface-200 bg-white px-2.5 py-1 text-xs font-semibold text-ink-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                  >
                    {collaborator.name}
                    <button
                      type="button"
                      onClick={() => removeCollaborator(collaborator.id)}
                      className="text-ink-400 hover:text-ink-600 dark:text-slate-400 dark:hover:text-slate-200"
                      aria-label={`Remove ${collaborator.name}`}
                      data-testid={`qa-collab-remove-${collaborator.id}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-500 dark:text-slate-400">
                No collaborators added yet.
              </p>
            )}
            {shareStatus ? (
              <p className="text-xs text-emerald-700 dark:text-emerald-300" role="status" aria-live="polite">
                {shareStatus}
              </p>
            ) : null}
            {shareLink ? (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-surface-200 bg-white px-2.5 py-2 text-xs dark:border-slate-800 dark:bg-slate-950">
                <code className="text-ink-700 dark:text-slate-200">{shareLink}</code>
                <button
                  type="button"
                  onClick={() => window.open(shareLink, "_blank", "noopener,noreferrer")}
                  className="rounded-xl border border-brand-200 px-2 py-1 text-[11px] font-semibold text-brand-700 dark:border-brand-800 dark:text-brand-200"
                  data-testid="qa-share-open"
                >
                  Open Link
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-xs text-ink-500 dark:text-slate-400">Collapsed.</p>
        )}
      </details>

      <button
        type="button"
        onClick={() => setShowCollaborationPanel((prev) => !prev)}
        className="mt-4 w-full rounded-2xl border border-surface-200 bg-ink-900 px-3 py-2 text-xs font-semibold text-white dark:border-slate-700 dark:bg-slate-200 dark:text-slate-900"
      >
        {showCollaborationPanel ? "Minimize Section" : "Expand Section"}
      </button>
    </div>
  );

  const navItem = (id: typeof activeSection, label: string, icon: string, forceLabel = false) => {
    const showLabel = forceLabel || !sidebarCollapsed;
    return (
    <button
      type="button"
      onClick={() => {
        setActiveSection(id);
        setShowMobileSidebar(false);
      }}
      className={[
        "flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-sm font-semibold transition",
        activeSection === id
          ? "border-brand-400 bg-brand-50 text-brand-800 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-100"
          : "border-surface-200 bg-white text-ink-700 hover:bg-surface-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200",
      ].join(" ")}
      aria-pressed={activeSection === id}
      title={label}
    >
      <span className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-surface-100 text-xs font-semibold text-ink-600 dark:bg-slate-900 dark:text-slate-200">
          {icon}
        </span>
        {showLabel ? <span>{label}</span> : <span className="sr-only">{label}</span>}
      </span>
      {showLabel ? <span className="text-xs text-ink-400">›</span> : null}
    </button>
    );
  };

  const filteredSuites = useMemo<QaSuite[]>(() => {
    if (!searchTerm.trim()) {
      return suites;
    }
    const term = searchTerm.toLowerCase();
    return suites.filter((suite) =>
      suite.name.toLowerCase().includes(term) ||
      suite.description?.toLowerCase().includes(term)
    );
  }, [suites, searchTerm]);

  const playwrightUiBridgeEnabled = runtimeStatus?.playwrightUiEnabled ?? true;
  const selectedSuite = useMemo(
    () => suites.find((suite) => suite.id === selectedSuiteId) ?? null,
    [suites, selectedSuiteId],
  );

  const groupedValidationIssues = useMemo(() => {
    if (!validationReport?.issues?.length) {
      return [] as Array<{
        filePath: string;
        errorCount: number;
        warningCount: number;
        issues: QaMarkdownValidationReport["issues"];
      }>;
    }
    const groups = new Map<string, QaMarkdownValidationReport["issues"]>();
    for (const issue of validationReport.issues) {
      const existing = groups.get(issue.filePath) ?? [];
      existing.push(issue);
      groups.set(issue.filePath, existing);
    }
    return Array.from(groups.entries())
      .map(([filePath, issues]) => ({
        filePath,
        errorCount: issues.filter((issue) => issue.level === "error").length,
        warningCount: issues.filter((issue) => issue.level === "warning").length,
        issues: [...issues].sort((a, b) => a.line - b.line),
      }))
      .sort((a, b) => a.filePath.localeCompare(b.filePath));
  }, [validationReport]);

  const loadSuites = async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchQaSuites();
      setSuites(result.data);
      if (result.data.length > 0) {
        setSelectedSuiteId((prev) => prev || result.data[0]!.id);
      }
      setDemoMode(false);
      // Show cache indicator if data came from cache
      if (result.fromCache) {
        console.log('[Cache] Suites loaded from cache');
      }
    } catch (loadError) {
      setDemoMode(true);
      setSuites([sampleSuite]);
      setSelectedSuiteId(sampleSuite.id);
      setRunDetail(sampleRunDetail);
      setError("Running in demo mode. Start the QA Runner daemon to load real suites.");
    } finally {
      setLoading(false);
    }
  };

  const loadArchivedSuites = async (): Promise<void> => {
    try {
      const items = await fetchQaArchivedSuites();
      setArchivedSuites(items);
      setSelectedArchivedFileName((prev) =>
        prev && items.some((item) => item.fileName === prev) ? prev : (items[0]?.fileName ?? ""),
      );
    } catch {
      setArchivedSuites([]);
      setSelectedArchivedFileName("");
    }
  };

  const loadMarkdownValidation = async (): Promise<void> => {
    try {
      const report = await fetchQaMarkdownValidation();
      setValidationReport(report);
    } catch {
      setValidationReport(null);
    }
  };

  const loadRuntimeStatus = async (): Promise<void> => {
    setRuntimeLoading(true);
    try {
      const runtime = await fetchQaRuntimeStatus();
      setRuntimeStatus(runtime);
    } catch {
      setRuntimeStatus(null);
    } finally {
      setRuntimeLoading(false);
    }
  };

  const loadRunHistory = async (suiteIdOverride?: string): Promise<void> => {
    const suiteId = (suiteIdOverride ?? selectedSuiteId).trim();
    if (!suiteId) {
      setRunHistory([]);
      return;
    }
    setRunHistoryLoading(true);
    try {
      const runs = await fetchQaRuns({
        suiteId,
        limit: 20,
      });
      setRunHistory(
        runs.map((run) => ({
          id: run.id,
          status: run.status,
          mode: run.mode,
          createdAt: run.createdAt,
          completedAt: run.completedAt,
        })),
      );
    } catch {
      setRunHistory([]);
    } finally {
      setRunHistoryLoading(false);
    }
  };

  const reloadRunDetail = async (
    runId: string,
    options?: { preserveSelectedCase?: boolean },
  ): Promise<void> => {
    setRunDetailLoading(true);
    try {
      const detail = await fetchQaRunDetail(runId);
      setRunDetail(detail);
      const preserveSelectedCase = options?.preserveSelectedCase !== false;
      if (detail.cases.length > 0) {
        setSelectedCaseId((prev) => {
          if (!preserveSelectedCase) {
            return detail.cases[0]!.id;
          }
          return prev && detail.cases.some((item) => item.id === prev) ? prev : detail.cases[0]!.id;
        });
      } else {
        setSelectedCaseId("");
      }
    } finally {
      setRunDetailLoading(false);
    }
  };

  const openRunFromHistory = async (runId: string, status: QaCaseStatus): Promise<void> => {
    setBusy(true);
    setError("");
    try {
      if (status === "passed" || status === "failed" || status === "blocked") {
        setCaseFilterMode("all");
      }
      await reloadRunDetail(runId, { preserveSelectedCase: false });
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Failed to open run from history");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadSuites();
    void loadRuntimeStatus();
    void fetchQaCustomTestTypes()
      .then(setCustomTestTypes)
      .catch(() => setCustomTestTypes([]));
    void loadArchivedSuites();
    void loadMarkdownValidation();
    try {
      const raw = localStorage.getItem(QA_ACTIVE_EXECUTION_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as { executeResult?: QaAiExecuteResult };
      if (!parsed.executeResult) {
        return;
      }
      setExecuteResult(parsed.executeResult);
      if (
        parsed.executeResult.status === "queued" ||
        parsed.executeResult.status === "running"
      ) {
        setAiPolling(true);
      }
    } catch {
      // Ignore invalid persisted payload.
    }
  }, []);

  useEffect(() => {
    if (mode !== "ai" || !runtimeAutoRefresh) {
      return;
    }
    const timer = setInterval(() => {
      void loadRuntimeStatus();
    }, 30000);
    return () => clearInterval(timer);
  }, [mode, runtimeAutoRefresh]);

  useEffect(() => {
    if (!executeResult) {
      localStorage.removeItem(QA_ACTIVE_EXECUTION_STORAGE_KEY);
      return;
    }
    localStorage.setItem(
      QA_ACTIVE_EXECUTION_STORAGE_KEY,
      JSON.stringify({
        executeResult,
        persistedAt: new Date().toISOString(),
      }),
    );
    if (
      executeResult.status === "completed" ||
      executeResult.status === "failed" ||
      executeResult.status === "cancelled"
    ) {
      localStorage.removeItem(QA_ACTIVE_EXECUTION_STORAGE_KEY);
    }
  }, [executeResult]);

  useEffect(() => {
    setCaseNotes(selectedCase?.result?.notes ?? "");
    setTesterName(selectedCase?.result?.testedBy ?? "");
  }, [selectedCase?.id, selectedCase?.result?.notes, selectedCase?.result?.testedBy]);

  useEffect(() => {
    if (!runDetail || !selectedCase) {
      setCaseComments([]);
      setCommentMessage("");
      return;
    }
    if (demoMode) {
      setCaseComments([]);
      return;
    }
    fetchCaseComments(runDetail.run.id, selectedCase.id)
      .then(setCaseComments)
      .catch(() => setCaseComments([]));
  }, [runDetail?.run.id, selectedCase?.id, demoMode]);

  useEffect(() => {
    if (!runDetail) {
      setCollaborators([]);
      return;
    }
    if (demoMode) {
      setCollaborators([]);
      return;
    }
    fetchRunCollaborators(runDetail.run.id)
      .then(setCollaborators)
      .catch(() => setCollaborators([]));
  }, [runDetail?.run.id, demoMode]);

  useEffect(() => {
    if (demoMode) {
      return;
    }
    fetchQaWorkspaces()
      .then((items) => {
        setWorkspaceProfiles(items);
      })
      .catch(() => setWorkspaceProfiles([]));
  }, [demoMode]);

  useEffect(() => {
    if (!aiModeEnabled || demoMode) {
      return;
    }
    Promise.all([fetchQaGenerationStatus(), fetchQaGenerationHistory(8)])
      .then(([status, history]) => {
        setGenerationStatus(status);
        setGenerationHistory(history);
      })
      .catch((statusError) => {
        console.warn("Failed to load generation status", statusError);
      });
  }, [aiModeEnabled, demoMode]);

  useEffect(() => {
    if (testerName && !commentAuthor) {
      setCommentAuthor(testerName);
    }
  }, [testerName, commentAuthor]);

  useEffect(() => {
    if (activeSection === "manual") {
      setMode?.("manual");
    }
    if (activeSection === "ai") {
      setMode?.("ai");
    }
  }, [activeSection, setMode]);

  useEffect(() => {
    if (!selectedSuiteId) {
      setRunHistory([]);
      return;
    }
    if (demoMode) {
      setRunHistory([]);
      return;
    }
    void loadRunHistory(selectedSuiteId);
  }, [selectedSuiteId, demoMode]);

  useEffect(() => {
    setRunNotes(runDetail?.run.notes ?? "");
  }, [runDetail?.run.id, runDetail?.run.notes]);

  useEffect(() => {
    setShareLink("");
    setGithubIssueUrl("");
    if (runDetail) {
      const caseTitle = selectedCase?.title ?? "Unselected case";
      const caseStatus = selectedCase?.result?.status ?? "not_started";
      setGithubTitle(`QA Issue · ${caseTitle}`);
      setGithubBody(
        `Suite: ${runDetail.suite.name}\nRun ID: ${runDetail.run.id}\nRun Status: ${runDetail.run.status}\nCase: ${caseTitle}\nCase Status: ${caseStatus}\n\nNotes:\n${selectedCase?.result?.notes ?? ""}`,
      );
    }
  }, [runDetail?.run.id, selectedCase?.id]);

  useEffect(() => {
    if (!runDetail) {
      return;
    }
    if (filteredCases.length === 0) {
      setSelectedCaseId("");
      return;
    }
    if (!selectedCaseId || !filteredCases.some((item) => item.id === selectedCaseId)) {
      setSelectedCaseId(filteredCases[0]!.id);
    }
  }, [runDetail, filteredCases, selectedCaseId]);

  useEffect(() => {
    if (mode !== "manual") {
      return;
    }
    if (demoMode) {
      return;
    }
    if (loading || busy) {
      return;
    }
    if (!selectedSuiteId) {
      return;
    }
    if (runDetail && runDetail.run.suiteId === selectedSuiteId) {
      return;
    }
    if (autoLoadedSuiteId === selectedSuiteId) {
      return;
    }
    setAutoLoadedSuiteId(selectedSuiteId);
    void startRun();
  }, [mode, demoMode, loading, busy, selectedSuiteId, runDetail, autoLoadedSuiteId]);

  useEffect(() => {
    if (!aiPolling) {
      return;
    }
    const timer = setInterval(() => {
      setClockMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [aiPolling]);

  useEffect(() => {
    if (!aiPolling || !executeResult) {
      return;
    }
    if (
      executeResult.status === "completed" ||
      executeResult.status === "failed" ||
      executeResult.status === "cancelled"
    ) {
      setAiPolling(false);
      return;
    }

    let cancelled = false;
    let inFlight = false;
    const poll = async (): Promise<void> => {
      if (cancelled || inFlight) {
        return;
      }
      inFlight = true;
      try {
        const status = await fetchQaAiExecutionStatus({
          runId: executeResult.runId,
          executionJobId: executeResult.executionJobId,
        });
        if (cancelled) {
          return;
        }
        const next: QaAiExecuteResult = {
          runId: status.runId,
          executionJobId: status.id,
          status: status.status,
          startedAt: status.startedAt,
          completedAt: status.completedAt,
          playwrightCommand: status.playwrightCommand,
          artifacts: {
            reportRef: status.reportRef ?? "",
            traceRef: status.traceRef ?? "",
            videoRef: status.videoRef ?? "",
          },
          error: status.error ?? undefined,
        };
        setExecuteResult(next);
        setAiPollError("");
        if (next.status === "completed" || next.status === "failed" || next.status === "cancelled") {
          setAiPolling(false);
          await reloadRunDetail(next.runId);
        }
      } catch (pollError) {
        if (!cancelled) {
          const message = pollError instanceof Error ? pollError.message : "Failed to refresh AI run status";
          setAiPollError(
            message.toLowerCase().includes("unauthorized")
              ? "Session expired while polling AI run status. Please sign in again, then reopen this run from history."
              : message,
          );
        }
      } finally {
        inFlight = false;
      }
    };

    void poll();
    const interval = setInterval(() => {
      void poll();
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [aiPolling, executeResult]);

  const addCaseComment = (): void => {
    if (!runDetail || !selectedCase) {
      return;
    }
    if (demoMode) {
      setShareStatus("Demo mode: connect the QA Runner daemon to save comments.");
      setTimeout(() => setShareStatus(""), 4000);
      return;
    }
    const author = commentAuthor.trim() || "Anonymous";
    const message = commentMessage.trim();
    if (!message) {
      return;
    }
    addCaseCommentApi(runDetail.run.id, selectedCase.id, { author, message })
      .then((created) => {
        setCaseComments((prev) => [created, ...prev]);
        setCommentMessage("");
      })
      .catch(() => {
        setShareStatus("Unable to save comment. Please try again.");
        setTimeout(() => setShareStatus(""), 4000);
      });
  };

  const removeCaseComment = (commentId: string): void => {
    if (!runDetail || !selectedCase) {
      return;
    }
    if (demoMode) {
      setShareStatus("Demo mode: connect the QA Runner daemon to remove comments.");
      setTimeout(() => setShareStatus(""), 4000);
      return;
    }
    deleteCaseCommentApi(runDetail.run.id, selectedCase.id, commentId)
      .then(() => {
        setCaseComments((prev) => prev.filter((comment) => comment.id !== commentId));
      })
      .catch(() => {
        setShareStatus("Unable to remove comment. Please try again.");
        setTimeout(() => setShareStatus(""), 4000);
      });
  };

  const addCollaborator = (): void => {
    if (!runDetail) {
      return;
    }
    if (demoMode) {
      setShareStatus("Demo mode: connect the QA Runner daemon to add collaborators.");
      setTimeout(() => setShareStatus(""), 4000);
      return;
    }
    const nextName = collaboratorInput.trim();
    if (!nextName) {
      return;
    }
    addRunCollaborator(runDetail.run.id, nextName)
      .then((created) => {
        setCollaborators((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
        setCollaboratorInput("");
      })
      .catch(() => {
        setShareStatus("Unable to add collaborator. Please try again.");
        setTimeout(() => setShareStatus(""), 4000);
      });
  };

  const removeCollaborator = (collaboratorId: string): void => {
    if (!runDetail) {
      return;
    }
    if (demoMode) {
      setShareStatus("Demo mode: connect the QA Runner daemon to remove collaborators.");
      setTimeout(() => setShareStatus(""), 4000);
      return;
    }
    removeRunCollaborator(runDetail.run.id, collaboratorId)
      .then(() => {
        setCollaborators((prev) => prev.filter((item) => item.id !== collaboratorId));
      })
      .catch(() => {
        setShareStatus("Unable to remove collaborator. Please try again.");
        setTimeout(() => setShareStatus(""), 4000);
      });
  };

  const shareRunSummary = async (): Promise<void> => {
    if (!runDetail) {
      return;
    }
    if (demoMode) {
      setShareStatus("Demo mode: connect the QA Runner daemon to create share links.");
      setTimeout(() => setShareStatus(""), 4000);
      return;
    }
    try {
      const { shareUrl } = await createRunShare(runDetail.run.id);
      setShareLink(shareUrl);
      await navigator.clipboard.writeText(shareUrl);
      setShareStatus("Share link copied to clipboard.");
    } catch {
      setShareStatus("Unable to create share link. Please try again.");
    }
    setTimeout(() => setShareStatus(""), 4000);
  };

  const submitGithubIssue = async (): Promise<void> => {
    if (!githubOwner.trim() || !githubRepo.trim() || !githubTitle.trim()) {
      setGithubStatus("Owner, repo, and title are required.");
      setTimeout(() => setGithubStatus(""), 4000);
      return;
    }
    if (demoMode) {
      setGithubStatus("Demo mode: connect the QA Runner daemon to create GitHub issues.");
      setTimeout(() => setGithubStatus(""), 4000);
      return;
    }
    try {
      const issue = await createGithubIssue({
        owner: githubOwner.trim(),
        repo: githubRepo.trim(),
        title: githubTitle.trim(),
        body: githubBody,
        labels: githubLabels.split(",").map((item) => item.trim()).filter(Boolean),
        assignees: githubAssignees.split(",").map((item) => item.trim()).filter(Boolean),
      });
      setGithubIssueUrl(issue.html_url ?? "");
      setGithubStatus("GitHub issue created.");
    } catch (error) {
      setGithubStatus(error instanceof Error ? error.message : "Failed to create GitHub issue.");
    }
    setTimeout(() => setGithubStatus(""), 4000);
  };

  const startRun = async (forceNew: boolean = false): Promise<void> => {
    if (!selectedSuiteId) {
      setError("Select a suite before starting a run.");
      return;
    }
    if (demoMode) {
      setRunDetail(sampleRunDetail);
      setSelectedCaseId(sampleRunDetail.cases[0]?.id ?? "");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (!forceNew) {
        const existingRuns = await fetchQaRuns({
          suiteId: selectedSuiteId,
          mode: "manual",
          limit: 1,
        });
        const latestRun = existingRuns[0];
        if (latestRun?.id) {
          await reloadRunDetail(latestRun.id);
          await loadRunHistory(selectedSuiteId);
          return;
        }
      }
      const run = await createQaRun(selectedSuiteId, "manual");
      await reloadRunDetail(run.id);
      await loadRunHistory(selectedSuiteId);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Failed to start QA run");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
        event.preventDefault();
        if (!loading && !busy) {
          loadSuites();
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        if (!loading && !busy && selectedSuiteId) {
          startRun(true);
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.key === '/') {
        event.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="Search suites"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        }
      }

      if (event.key === 'Escape') {
        setSearchTerm('');
        setCaseSearchTerm('');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [loading, busy, selectedSuiteId, loadSuites, startRun]);

  const duplicateSuiteAction = async (): Promise<void> => {
    if (!selectedSuiteId) {
      setError("Select a suite before duplicating.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const duplicated = await duplicateQaSuite(selectedSuiteId);
      const result = await fetchQaSuites();
      setSuites(result.data);
      setSelectedSuiteId(duplicated.id);
      setRunDetail(null);
      setSelectedCaseId("");
      setAutoLoadedSuiteId("");
      await loadRunHistory(duplicated.id);
    } catch (duplicateError) {
      setError(duplicateError instanceof Error ? duplicateError.message : "Failed to duplicate suite");
    } finally {
      setBusy(false);
    }
  };

  const archiveSuiteAction = async (reason?: string): Promise<void> => {
    if (!selectedSuiteId) {
      setError("Select a suite before archiving.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await archiveQaSuite(selectedSuiteId, reason?.trim() || undefined);
      const result = await fetchQaSuites();
      setSuites(result.data);
      await loadArchivedSuites();
      await loadMarkdownValidation();
      const nextSuiteId = result.data[0]?.id ?? "";
      setSelectedSuiteId(nextSuiteId);
      setRunDetail(null);
      setSelectedCaseId("");
      setAutoLoadedSuiteId("");
      await loadRunHistory(nextSuiteId);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Failed to archive suite");
    } finally {
      setBusy(false);
    }
  };

  const deleteSuiteAction = async (reason?: string): Promise<void> => {
    if (!selectedSuiteId) {
      setError("Select a suite before deleting.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await deleteQaSuite(selectedSuiteId, reason?.trim() || undefined);
      const result = await fetchQaSuites();
      setSuites(result.data);
      await loadArchivedSuites();
      await loadMarkdownValidation();
      const nextSuiteId = result.data[0]?.id ?? "";
      setSelectedSuiteId(nextSuiteId);
      setRunDetail(null);
      setSelectedCaseId("");
      setAutoLoadedSuiteId("");
      await loadRunHistory(nextSuiteId);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete suite");
    } finally {
      setBusy(false);
    }
  };

  const exportSuiteAction = async (): Promise<void> => {
    if (!selectedSuiteId) {
      setError("Select a suite before exporting.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const markdown = await fetchQaSuiteMarkdown(selectedSuiteId);
      const suiteFiles = await fetchQaSuiteFiles();
      const suiteFile = suiteFiles.find((file) => file.suiteId === selectedSuiteId);
      const fileName = suiteFile?.fileName ?? `${selectedSuiteId}.md`;
      downloadReportFile(fileName, markdown, "text/markdown");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export suite");
    } finally {
      setBusy(false);
    }
  };

  const restoreArchivedSuiteAction = async (): Promise<void> => {
    if (!selectedArchivedFileName) {
      setError("Select an archived suite file to restore.");
      return;
    }
    const selected = archivedSuites.find((item) => item.fileName === selectedArchivedFileName);
    const confirmed = window.confirm(
      `Restore archived suite "${selected?.suiteName ?? selectedArchivedFileName}" back to active cases?`,
    );
    if (!confirmed) {
      return;
    }
    const reason = window.prompt("Restore reason (optional):", "") ?? "";
    setBusy(true);
    setError("");
    try {
      const restored = await restoreQaArchivedSuite({
        fileName: selectedArchivedFileName,
        reason: reason.trim() || undefined,
      });
      const result = await fetchQaSuites();
      setSuites(result.data);
      await loadArchivedSuites();
      await loadMarkdownValidation();
      if (restored.suiteId) {
        setSelectedSuiteId(restored.suiteId);
        await loadRunHistory(restored.suiteId);
      } else {
        setSelectedSuiteId(result.data[0]?.id ?? "");
        await loadRunHistory(result.data[0]?.id ?? "");
      }
      setRunDetail(null);
      setSelectedCaseId("");
      setAutoLoadedSuiteId("");
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Failed to restore archived suite");
    } finally {
      setBusy(false);
    }
  };

  const runGeneration = async (): Promise<void> => {
    const prompt = generatePrompt.trim();
    if (!prompt) {
      setError("Generation prompt is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await createQaGenerationJob({
        prompt,
        testTypes: getNativeTestTypes(),
        context: {
          pluginIds: generatePlugins
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          routes: generateRoutes
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        },
      });
      const fresh = await fetchQaGenerationJob(created.id);
      setGenerationJob(fresh);
      setGenerationHistory((prev) => [fresh, ...prev.filter((item) => item.id !== fresh.id)].slice(0, 8));
      setLoadResult(null);
      setPrepareResult(null);
      setExecuteResult(null);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Failed to generate QA cases");
    } finally {
      setBusy(false);
    }
  };

  const runGenerateTests = async (): Promise<void> => {
    const prompt = generatePrompt.trim();
    if (!prompt) {
      setError("Generation prompt is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await createQaGeneratedTestsJob({
        prompt,
        testTypes: getNativeTestTypes(),
        context: {
          pluginIds: generatePlugins
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          routes: generateRoutes
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        },
      });
      setGenerationJob(created);
      setGenerationHistory((prev) => [created, ...prev.filter((item) => item.id !== created.id)].slice(0, 8));
      setLoadResult(null);
      setPrepareResult(null);
      setExecuteResult(null);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Failed to generate QA tests");
    } finally {
      setBusy(false);
    }
  };

  const applyWorkspace = async (workspaceId: string): Promise<void> => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("qa_runner_workspace_id", workspaceId);
    }
    setActiveWorkspaceId(workspaceId);
    setRunDetail(null);
    setSelectedCaseId("");
    await loadSuites();
    await loadArchivedSuites();
    if (selectedSuiteId) {
      await loadRunHistory(selectedSuiteId);
    }
  };

  const createWorkspaceProfile = async (): Promise<void> => {
    const label = newWorkspaceName.trim();
    if (!label) {
      setWorkspaceStatus("Workspace name is required.");
      return;
    }
    setWorkspaceStatus("");
    try {
      const slug = label.toLowerCase().replace(/\s+/g, "-");
      const casesDir =
        newWorkspacePath.trim() ||
        (newWorkspaceGitUrl.trim() ? `tools/qa-cases-${slug}` : "docs/qa-cases");
      const updated = await saveQaWorkspace({
        label,
        casesDir,
        gitUrl: newWorkspaceGitUrl.trim() || undefined,
      });
      setWorkspaceProfiles(updated);
      setNewWorkspaceName("");
      setNewWorkspacePath("");
      setNewWorkspaceGitUrl("");
      setWorkspaceStatus("Workspace saved.");
    } catch (error) {
      setWorkspaceStatus(error instanceof Error ? error.message : "Failed to save workspace.");
    }
  };

  const removeWorkspaceProfile = async (id: string): Promise<void> => {
    try {
      const updated = await deleteQaWorkspace(id);
      setWorkspaceProfiles(updated);
      if (activeWorkspaceId === id) {
        await applyWorkspace("default");
      }
    } catch (error) {
      setWorkspaceStatus(error instanceof Error ? error.message : "Failed to delete workspace.");
    }
  };

  const syncWorkspaceProfile = async (id: string): Promise<void> => {
    try {
      await syncQaWorkspace(id);
      setWorkspaceStatus("Workspace synced.");
    } catch (error) {
      setWorkspaceStatus(error instanceof Error ? error.message : "Sync failed.");
    }
  };

  const loadExistingSuiteAction = async (): Promise<void> => {
    setBusy(true);
    setError("");
    try {
      const job = await loadQaExistingTests({
        testTypes: getNativeTestTypes(),
        testDir: existingTestDir.trim() || undefined,
        tags: existingTags
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      });
      setGenerationJob(job);
      setGenerationHistory((prev) => [job, ...prev.filter((item) => item.id !== job.id)].slice(0, 8));
      setLoadResult(null);
      setPrepareResult(null);
      setExecuteResult(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load existing test suite");
    } finally {
      setBusy(false);
    }
  };

  const runIntelligentReviewAction = async (): Promise<void> => {
    if (!generationJob) {
      setError("Load existing tests before running intelligent review.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const reviewed = await runQaIntelligentReview({
        generationJobId: generationJob.id,
        maxSuggestions: 5,
      });
      setGenerationJob(reviewed);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Failed to run intelligent review");
    } finally {
      setBusy(false);
    }
  };

  const generateFixProposalsAction = async (): Promise<void> => {
    if (!generationJob) {
      setError("Run intelligent review before generating fix proposals.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const updated = await generateQaFixProposals({
        generationJobId: generationJob.id,
        maxProposals: 12,
      });
      setGenerationJob(updated);
    } catch (proposalError) {
      setError(proposalError instanceof Error ? proposalError.message : "Failed to generate fix proposals");
    } finally {
      setBusy(false);
    }
  };

  const applyFixProposalAction = async (proposalId: string): Promise<void> => {
    if (!generationJob) {
      setError("Generate fix proposals first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const updated = await applyQaFixProposal({
        generationJobId: generationJob.id,
        proposalId,
      });
      setGenerationJob(updated);
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Failed to apply fix proposal");
    } finally {
      setBusy(false);
    }
  };

  const retestFixProposalAction = async (proposalId: string): Promise<void> => {
    if (!generationJob) {
      setError("Apply proposal first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const updated = await retestQaFixProposal({
        generationJobId: generationJob.id,
        proposalId,
      });
      setGenerationJob(updated);
    } catch (retestError) {
      setError(retestError instanceof Error ? retestError.message : "Failed to retest fix proposal");
    } finally {
      setBusy(false);
    }
  };

  const runAutomationAction = async (strategy: "continuous_fix" | "alert_only"): Promise<void> => {
    if (!generationJob) {
      setError("Load existing tests before running automation.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const updated = await runQaAutomation({
        generationJobId: generationJob.id,
        strategy,
        maxIterations: strategy === "continuous_fix" ? 25 : undefined,
      });
      setGenerationJob(updated);
    } catch (automationError) {
      setError(automationError instanceof Error ? automationError.message : "Failed to run automation strategy");
    } finally {
      setBusy(false);
    }
  };

  const toggleTestType = (testType: QaTestTypeId): void => {
    setSelectedTestTypes((prev) => {
      if (prev.includes(testType)) {
        const next = prev.filter((item) => item !== testType);
        return next.length > 0 ? next : ["ui_functional"];
      }
      return [...prev, testType];
    });
  };

  const loadGeneratedTestsAction = async (): Promise<void> => {
    if (!generationJob) {
      setError("Generate tests before loading.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await loadQaGeneratedTests({
        generationJobId: generationJob.id,
        runId: runDetail?.run.id,
      });
      setLoadResult(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load generated tests");
    } finally {
      setBusy(false);
    }
  };

  const prepareAiRunAction = async (): Promise<void> => {
    if (!generationJob) {
      setError("Generate tests before preparing AI run.");
      return;
    }
    if (!selectedSuiteId) {
      setError("Select a suite for AI execution.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let runId = runDetail?.run.id ?? "";
      if (!runId) {
        const run = await createQaRun(selectedSuiteId, "ai");
        runId = run.id;
        await reloadRunDetail(runId);
      }
      const prepared = await prepareQaAiRun({
        runId,
        generationJobId: generationJob.id,
        testTypes: getNativeTestTypes(),
      });
      setPrepareResult(prepared);
      setExecuteResult(null);
    } catch (prepareError) {
      setError(prepareError instanceof Error ? prepareError.message : "Failed to prepare AI run");
    } finally {
      setBusy(false);
    }
  };

  const executeAiRunAction = async (): Promise<void> => {
    if (!generationJob) {
      setError("Load or generate tests before executing.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let effectivePrepare = prepareResult;
      if (!effectivePrepare) {
        if (!selectedSuiteId) {
          setError("Select a suite for AI execution.");
          return;
        }
        let runId = runDetail?.run.id ?? "";
        if (!runId) {
          const run = await createQaRun(selectedSuiteId, "ai");
          runId = run.id;
          await reloadRunDetail(runId);
        }
        effectivePrepare = await prepareQaAiRun({
          runId,
          generationJobId: generationJob.id,
          testTypes: getNativeTestTypes(),
        });
        setPrepareResult(effectivePrepare);
      }

      const started = await executeQaAiRun({
        runId: effectivePrepare.runId,
        executionJobId: effectivePrepare.executionJobId,
      });
      setExecuteResult(started);
      setAiPollError("");
      setAiPolling(true);
    } catch (executeError) {
      setError(executeError instanceof Error ? executeError.message : "Failed to execute AI run");
      setAiPolling(false);
    } finally {
      setBusy(false);
    }
  };

  const setCaseStatus = async (status: QaCaseStatus): Promise<void> => {
    if (!runDetail || !selectedCase) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await updateQaCaseResult(runDetail.run.id, selectedCase.id, {
        status,
        notes: caseNotes,
        failureReason: status === "failed" ? "Manual status set to failed." : "",
        testerName: testerName.trim() || undefined,
      });
      await reloadRunDetail(runDetail.run.id);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update case status");
    } finally {
      setBusy(false);
    }
  };

  const saveNotes = async (): Promise<void> => {
    if (!runDetail || !selectedCase) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await updateQaCaseResult(runDetail.run.id, selectedCase.id, {
        notes: caseNotes,
        testerName: testerName.trim() || undefined,
      });
      await reloadRunDetail(runDetail.run.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save notes");
    } finally {
      setBusy(false);
    }
  };

  const markCaseDone = async (): Promise<void> => {
    if (!runDetail || !selectedCase) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await updateQaCaseResult(runDetail.run.id, selectedCase.id, {
        markDone: true,
        status: "passed",
        notes: caseNotes,
        testerName: testerName.trim() || undefined,
      });
      await reloadRunDetail(runDetail.run.id);
    } catch (doneError) {
      setError(doneError instanceof Error ? doneError.message : "Failed to mark case as done");
    } finally {
      setBusy(false);
    }
  };

  const toggleStep = async (stepId: string, checked: boolean): Promise<void> => {
    if (!runDetail || !selectedCase) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await updateQaStepCheck(runDetail.run.id, selectedCase.id, stepId, checked);
      await reloadRunDetail(runDetail.run.id);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Failed to update step check");
    } finally {
      setBusy(false);
    }
  };

  const addEvidence = async (): Promise<void> => {
    if (!runDetail || !selectedCase) {
      return;
    }
    const label = evidenceLabel.trim();
    const ref = evidenceRef.trim();
    if (!label || !ref) {
      setError("Evidence label and reference are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await addQaCaseEvidence(runDetail.run.id, selectedCase.id, {
        type: evidenceType,
        label,
        ref,
      });
      setEvidenceLabel("");
      setEvidenceRef("");
      await reloadRunDetail(runDetail.run.id);
    } catch (evidenceError) {
      setError(evidenceError instanceof Error ? evidenceError.message : "Failed to add evidence");
    } finally {
      setBusy(false);
    }
  };

  const finalizeRun = async (): Promise<void> => {
    if (!runDetail) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await finalizeQaRun(runDetail.run.id, {
        testerName: testerName.trim() || undefined,
        notes: runNotes.trim() || undefined,
      });
      await reloadRunDetail(runDetail.run.id);
      await loadRunHistory(runDetail.run.suiteId);
    } catch (finalizeError) {
      setError(finalizeError instanceof Error ? finalizeError.message : "Failed to finalize run");
    } finally {
      setBusy(false);
    }
  };

  const downloadReportFile = (fileName: string, content: string, mimeType: string): void => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const downloadRunReportJson = async (): Promise<void> => {
    if (!runDetail) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const report = await fetchQaRunReport(runDetail.run.id, "json");
      const fileName = `${runDetail.run.id}-manual-report.json`;
      downloadReportFile(fileName, JSON.stringify(report.report, null, 2), "application/json");
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "Failed to download JSON report");
    } finally {
      setBusy(false);
    }
  };

  const downloadRunReportMarkdown = async (): Promise<void> => {
    if (!runDetail) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const report = await fetchQaRunReport(runDetail.run.id, "markdown");
      const fileName = `${runDetail.run.id}-manual-report.md`;
      const markdown = report.markdown ?? "# QA Manual Run Report\n\n_No markdown report payload returned._\n";
      downloadReportFile(fileName, markdown, "text/markdown");
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "Failed to download markdown report");
    } finally {
      setBusy(false);
    }
  };

  const downloadRunReportHtml = async (): Promise<void> => {
    if (!runDetail) {
      return;
    }
    if (demoMode) {
      setError("Demo mode: connect the QA Runner daemon to download HTML reports.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const report = await fetchQaRunReport(runDetail.run.id, "html");
      const fileName = `${runDetail.run.id}-manual-report.html`;
      const html = report.html ?? "<!doctype html><html><body><p>No HTML report payload returned.</p></body></html>";
      downloadReportFile(fileName, html, "text/html");
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "Failed to download HTML report");
    } finally {
      setBusy(false);
    }
  };

  const printRunReportPdf = async (): Promise<void> => {
    if (!runDetail) {
      return;
    }
    if (demoMode) {
      setError("Demo mode: connect the QA Runner daemon to print PDF reports.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const report = await fetchQaRunReport(runDetail.run.id, "html");
      const html = report.html ?? "<!doctype html><html><body><p>No HTML report payload returned.</p></body></html>";
      const win = window.open("", "_blank", "noopener,noreferrer");
      if (!win) {
        throw new Error("Unable to open print window.");
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      win.print();
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "Failed to print PDF report");
    } finally {
      setBusy(false);
    }
  };

  const handleRunReportImport = async (file: File | null): Promise<void> => {
    if (!file) {
      return;
    }
    setBusy(true);
    setImportError("");
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as QaManualRunReport;
      if (!payload.run || !payload.suite || !Array.isArray(payload.cases)) {
        throw new Error("Invalid QA run report format");
      }
      setImportedRunReport(payload);
    } catch (importError) {
      setImportError(importError instanceof Error ? importError.message : "Failed to import report");
      setImportedRunReport(null);
    } finally {
      setBusy(false);
    }
  };

  const handleSuiteConfigImport = async (file: File | null): Promise<void> => {
    if (!file) {
      return;
    }
    setBusy(true);
    setImportConfigError("");
    try {
      const text = await file.text();
      // Parse the markdown to extract suite and cases
      const parsed = parseMarkdownSuite(text);
      setImportedSuiteConfig(parsed);
    } catch (importError) {
      setImportConfigError(importError instanceof Error ? importError.message : "Failed to import suite config");
      setImportedSuiteConfig(null);
    } finally {
      setBusy(false);
    }
  };

  const sendRunReportWebhook = async (): Promise<void> => {
    if (!runDetail) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await triggerQaRunReportWebhook(runDetail.run.id);
    } catch (webhookError) {
      setError(webhookError instanceof Error ? webhookError.message : "Failed to send report webhook");
    } finally {
      setBusy(false);
    }
  };

  const openDestructiveModal = (action: QaDestructiveAction): void => {
    setDestructiveModalAction(action);
    setDestructiveReason("");
  };

  const closeDestructiveModal = (): void => {
    if (busy) {
      return;
    }
    setDestructiveModalAction(null);
    setDestructiveReason("");
  };

  const confirmDestructiveModal = async (): Promise<void> => {
    if (!destructiveModalAction) {
      return;
    }
    if (destructiveModalAction === "archive") {
      await archiveSuiteAction(destructiveReason);
    } else {
      await deleteSuiteAction(destructiveReason);
    }
    setDestructiveModalAction(null);
    setDestructiveReason("");
  };

  useEffect(() => {
    if (!destructiveModalAction) {
      return;
    }
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    destructiveReasonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!destructiveModalAction) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeDestructiveModal();
        return;
      }
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void confirmDestructiveModal();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const modal = destructiveModalRef.current;
      if (!modal) {
        return;
      }
      const focusableElements = Array.from(
        modal.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("disabled") && element.tabIndex >= 0);
      if (focusableElements.length === 0) {
        return;
      }
      const first = focusableElements[0]!;
      const last = focusableElements[focusableElements.length - 1]!;
      const current = document.activeElement as HTMLElement | null;
      if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousActive?.focus();
    };
  }, [destructiveModalAction, busy]);

  return (
    <div className="space-y-8">
      <SectionHeader
        title="QA Runner"
        subtitle="Manual execution and AI-driven checklist generation."
        badges={["QA Runner", mode === "manual" ? "Manual Mode" : "AI Mode"]}
      />

      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setShowMobileSidebar(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm font-semibold text-ink-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          aria-label="Open navigation menu"
        >
          ☰ Menu
        </button>
      </div>

      <div
        className={[
          "md:grid md:gap-6",
          sidebarCollapsed ? "md:grid-cols-[88px_minmax(0,1fr)]" : "md:grid-cols-[240px_minmax(0,1fr)]",
        ].join(" ")}
      >
        <aside className="hidden md:block">
          <div className="sticky top-6 space-y-4 rounded-[28px] border border-surface-200 bg-white/95 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.12)] dark:border-slate-800/60 dark:bg-slate-950/90">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                  <span className="text-sm font-semibold">QA</span>
                </div>
                {!sidebarCollapsed ? (
                  <div>
                    <p className="text-sm font-semibold text-ink-900 dark:text-white">Navigation</p>
                    <p className="text-xs text-ink-500 dark:text-slate-400">QA runner sections</p>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
                className="rounded-lg border border-surface-200 px-2 py-1 text-[11px] font-semibold text-ink-600 dark:border-slate-800 dark:text-slate-300"
                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {sidebarCollapsed ? "»" : "«"}
              </button>
            </div>
            <div className="space-y-2">
              {navItem("manual", "Manual Testing", "M")}
              {navItem("ai", "AI Testing", "AI")}
              {navItem("team", "Team & Collaboration", "T")}
              {navItem("settings", "Settings", "S")}
            </div>

            {!sidebarCollapsed && (
              <div className="space-y-4 pt-2">
                <div className="rounded-2xl border border-surface-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-950">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 dark:text-slate-400">
                    Run History
                  </p>
                  {runHistory.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {runHistory.slice(0, 5).map((run) => (
                        <div key={run.id} className="flex items-center justify-between">
                          <span className="text-ink-700 dark:text-slate-200">{run.status}</span>
                          <span className="text-ink-500 dark:text-slate-400">
                            {new Date(run.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-ink-500 dark:text-slate-400">No recent runs.</p>
                  )}
                </div>

                <div className="rounded-2xl border border-surface-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-950">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 dark:text-slate-400">
                    Archived Suites
                  </p>
                  <div className="mt-2 space-y-2">
                    <select
                      value={selectedArchivedFileName}
                      onChange={(event) => setSelectedArchivedFileName(event.target.value)}
                      className="w-full rounded-xl border border-surface-200 bg-surface-50 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                      disabled={busy || archivedSuites.length === 0}
                    >
                      {archivedSuites.length === 0 ? (
                        <option value="">No archived suites</option>
                      ) : (
                        archivedSuites.map((item) => (
                          <option key={item.fileName} value={item.fileName}>
                            {item.suiteName}
                          </option>
                        ))
                      )}
                    </select>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void restoreArchivedSuiteAction()}
                        disabled={busy || !selectedArchivedFileName}
                        className="rounded-xl border border-emerald-300 px-2 py-1 text-[11px] font-semibold text-emerald-800 disabled:opacity-60 dark:border-emerald-900/50 dark:text-emerald-300"
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => void loadArchivedSuites()}
                        disabled={busy}
                        className="rounded-xl border border-surface-300 px-2 py-1 text-[11px] font-semibold text-ink-700 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200"
                      >
                        Refresh
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-surface-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-950">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 dark:text-slate-400">
                    Shortcuts
                  </p>
                  <div className="mt-2 space-y-1 text-ink-700 dark:text-slate-200">
                    <div><span className="font-semibold">Ctrl+R</span> Reload suites</div>
                    <div><span className="font-semibold">Ctrl+Enter</span> Start run</div>
                    <div><span className="font-semibold">Ctrl+/</span> Focus search</div>
                    <div><span className="font-semibold">Escape</span> Clear search</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
        <div className="space-y-8">
      {showManualSection && loading && suites.length === 0 ? (
        <div className="space-y-4">
          <SurfaceCard className="space-y-4 p-6">
            <Skeleton height="1.5rem" width="40%" />
            <Skeleton height="1rem" width="100%" />
            <Skeleton height="1rem" width="80%" />
          </SurfaceCard>
          <SurfaceCard className="space-y-4 p-6">
            <Skeleton height="1.25rem" width="55%" />
            <Skeleton height="1rem" width="100%" />
            <Skeleton height="1rem" width="50%" />
          </SurfaceCard>
        </div>
      ) : null}

      {showManualSection && demoMode ? (
        <SurfaceCard className="space-y-2 p-4">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Demo mode active
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Connect the QA Runner daemon (e.g. <code>http://localhost:4545/ui</code>) or set{" "}
            <code>VITE_API_URL</code> to your daemon URL to load real suites.
          </p>
        </SurfaceCard>
      ) : null}

      {showManualSection && !demoMode && generationStatus?.autoSeeded ? (
        <SurfaceCard className="space-y-1 p-4">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
            Initial QA suite auto-generated
          </p>
          <p className="text-xs text-emerald-800 dark:text-emerald-300">
            A starter checklist was created at <code>docs/qa-cases</code>{" "}
            {generationStatus.autoSeededAt ? <>on <code>{generationStatus.autoSeededAt}</code>.</> : "on first run."}
          </p>
        </SurfaceCard>
      ) : null}

          {(showManualSection || showAiSection) && (!hideModeSwitch || error) ? (
            <SurfaceCard className="space-y-4 p-6">
          {!hideModeSwitch ? (
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-2">
                    <button
                      type="button"
                      onClick={() => setMode?.("manual")}
                      className={`rounded-lg px-4 py-2.5 text-sm font-semibold min-h-[2.5rem] touch-manipulation ${
                        mode === "manual"
                          ? "bg-brand-500 text-white"
                          : "border border-surface-300 bg-white text-ink-700 hover:bg-surface-50 active:bg-surface-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:active:bg-slate-700"
                      }`}
                    >
                      Manual Mode
                    </button>
              <button
                type="button"
                onClick={() => setMode?.("ai")}
                disabled={!aiModeEnabled}
                className={`rounded-lg px-4 py-2.5 text-sm font-semibold min-h-[2.5rem] touch-manipulation ${
                  mode === "ai"
                    ? "bg-brand-500 text-white"
                    : "border border-surface-300 bg-white text-ink-700 hover:bg-surface-50 active:bg-surface-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:active:bg-slate-700"
                } disabled:opacity-60`}
              >
                AI Mode
              </button>
            </div>
          ) : null}

          {error ? (
            <div
              className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200"
              role="alert"
              aria-live="assertive"
            >
              <p>{error}</p>
              {!demoMode ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void loadSuites()}
                    className="rounded-lg border border-rose-300 px-2 py-1 text-xs font-semibold text-rose-700"
                  >
                    Retry Load
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadRuntimeStatus()}
                    className="rounded-lg border border-rose-300 px-2 py-1 text-xs font-semibold text-rose-700"
                  >
                    Retry Runtime
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </SurfaceCard>
      ) : null}

      {showAiSection ? (
        <SurfaceCard className="space-y-4 p-6">
          {!aiModeEnabled ? (
            <p className="text-sm text-ink-600 dark:text-slate-300">
              AI mode is disabled (`VITE_QA_RUNNER_AI_ENABLED=false`).
            </p>
          ) : (
            <>
              <div className="rounded-lg border border-surface-300 bg-surface-50 p-3 text-sm text-ink-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">What Will Run</p>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1 text-xs text-ink-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={runtimeAutoRefresh}
                        onChange={(event) => setRuntimeAutoRefresh(event.target.checked)}
                        className="h-3.5 w-3.5 rounded border-surface-300 text-brand-500 focus:ring-brand-500 dark:border-slate-700"
                      />
                      Auto-refresh (30s)
                    </label>
                    <button
                      type="button"
                      onClick={() => void loadRuntimeStatus()}
                      disabled={runtimeLoading}
                      className="rounded-lg border border-surface-300 px-2 py-1 text-xs font-semibold text-ink-700 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200"
                    >
                      {runtimeLoading ? "Refreshing..." : "Refresh Runtime"}
                    </button>
                  </div>
                </div>
                <p className="mt-1">
                  AI execution currently runs the full Playwright suite (no tag filtering). Selected profiles are
                  used for planning context only. Current backend mode:{" "}
                  <span className="font-semibold">
                    {runtimeStatus?.executionMode ?? "unknown"}
                  </span>
                  {runtimeStatus?.executionMode === "shell"
                    ? " (real Playwright command execution)"
                    : " (simulated completion/stub mode)"}.
                </p>
                <p className="mt-1 text-xs text-ink-600 dark:text-slate-300">
                  To run real UI tests, set <code>QA_RUNNER_PLAYWRIGHT_EXECUTION_MODE=shell</code> and restart API.
                </p>
                <p className="mt-1 text-xs text-ink-600 dark:text-slate-300">
                  Playwright UI bridge:{" "}
                  <span className="font-semibold">{playwrightUiBridgeEnabled ? "enabled" : "disabled"}</span>. Control
                  with <code>QA_RUNNER_PLAYWRIGHT_UI_ENABLED</code>.
                </p>
                <p className="mt-1 text-xs text-ink-600 dark:text-slate-300">
                  Optional timeout: <code>QA_RUNNER_PLAYWRIGHT_TIMEOUT_MS</code> (current{" "}
                  {runtimeStatus?.executionTimeoutMs ?? "n/a"} ms).
                </p>
                <p className="mt-1 text-xs text-ink-600 dark:text-slate-300">
                  Runner workspace root: <code>{runtimeStatus?.workspaceRoot ?? "auto-detected"}</code>. Set{" "}
                  <code>QA_RUNNER_WORKSPACE_ROOT</code> if your API process is started from a nested directory.
                </p>
                <p className="mt-1 text-xs text-ink-600 dark:text-slate-300">
                  Manual case folder: <code>{runtimeStatus?.casesRoot ?? "docs/qa-cases"}</code>. Configure with{" "}
                  <code>QA_RUNNER_CASES_DIR</code> (relative to workspace root).
                </p>
                <p className="mt-1 text-xs text-ink-600 dark:text-slate-300">
                  Evidence storage: <code>{runtimeStatus?.evidenceStorageMode ?? "metadata_only"}</code>. Store only
                  artifact references (for example <code>qa://...</code> or <code>file:...</code>), not raw binary payloads.
                </p>
                <p className="mt-1 text-xs text-ink-600 dark:text-slate-300">
                  Execution isolation: <code>{runtimeStatus?.executionIsolationMode ?? "local_worker"}</code> · QA data
                  scope: <code>{runtimeStatus?.qaDataScopeMode ?? "global"}</code>.
                </p>
                <p className="mt-1 text-xs text-ink-600 dark:text-slate-300">
                  Extraction timing: <code>{runtimeStatus?.extractionTiming ?? "in_repo_until_v1"}</code> (QA runner
                  stays plugin-scoped in this repo through v1 template release).
                </p>
                <p className="mt-1 text-xs text-ink-600 dark:text-slate-300">
                  POM rules: mode <code>{runtimeStatus?.pomRuleMode ?? "warn"}</code> with direct-locator threshold{" "}
                  <code>{runtimeStatus?.pomDirectLocatorThreshold ?? 8}</code>. Configure with{" "}
                  <code>QA_RUNNER_POM_RULE_MODE</code> and <code>QA_RUNNER_POM_DIRECT_LOCATOR_THRESHOLD</code>.
                </p>
                <p className="mt-1 text-xs text-ink-600 dark:text-slate-300">
                  Scheduled alert-only checks:{" "}
                  <span className="font-semibold">
                    {runtimeStatus?.scheduledAlertOnlyEnabled ? "enabled" : "disabled"}
                  </span>
                  {runtimeStatus?.scheduledAlertOnlyEnabled ? (
                    <>
                      {" "}
                      every <code>{formatDurationMinutes(runtimeStatus?.scheduledAlertOnlyIntervalMs)}</code> (
                      <code>{runtimeStatus?.scheduledAlertOnlyIntervalMs ?? 3600000}ms</code>) as actor{" "}
                      <code>{runtimeStatus?.scheduledAlertOnlyActorId ?? "qa-scheduler"}</code>, max iterations{" "}
                      <code>{runtimeStatus?.scheduledAlertOnlyMaxIterations ?? 15}</code>.
                    </>
                  ) : (
                    <>
                      {" "}
                      Enable with <code>QA_RUNNER_SCHEDULE_ALERT_ONLY_ENABLED=true</code>.
                    </>
                  )}
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-ink-800 dark:text-slate-200">Feature Use Case Prompt</label>
                <textarea
                  value={generatePrompt}
                  onChange={(event) => setGeneratePrompt(event.target.value)}
                  rows={4}
                  placeholder="Example: Trello -> AI/RAG -> InDesign -> Canto pipeline runs."
                  className="mt-1 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-ink-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <select
                  value={selectedSuiteId}
                  onChange={(event) => setSelectedSuiteId(event.target.value)}
                  className="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  {suites.map((suite) => (
                    <option key={suite.id} value={suite.id}>
                      {suite.name}
                    </option>
                  ))}
                </select>
                <input
                  value={generatePlugins}
                  onChange={(event) => setGeneratePlugins(event.target.value)}
                  placeholder="plugin scope (comma separated)"
                  className="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
                <input
                  value={generateRoutes}
                  onChange={(event) => setGenerateRoutes(event.target.value)}
                  placeholder="route scope (comma separated)"
                  className="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
                <input
                  value={existingTestDir}
                  onChange={(event) => setExistingTestDir(event.target.value)}
                  placeholder="existing tests dir (e.g. e2e/ui/tests)"
                  className="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
                <input
                  value={existingTags}
                  onChange={(event) => setExistingTags(event.target.value)}
                  placeholder="existing suite tag filter (comma separated)"
                  className="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {testProfileOptions.map((profile) => (
                  <label
                    key={profile.id}
                    className="flex items-start gap-2 rounded-lg border border-surface-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTestTypes.includes(profile.id)}
                      onChange={() => toggleTestType(profile.id)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span>
                      <span className="flex items-center gap-2">
                        <span className="block font-semibold text-ink-900 dark:text-white">{profile.label}</span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setInfoProfileId((prev) => (prev === profile.id ? null : profile.id));
                          }}
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-surface-300 text-xs font-bold text-ink-700 dark:border-slate-600 dark:text-slate-200"
                          aria-label={`What is tested in ${profile.label}`}
                          title={`What is tested in ${profile.label}`}
                        >
                          i
                        </button>
                      </span>
                      <span className="block text-xs text-ink-600 dark:text-slate-300">{profile.description}</span>
                      {infoProfileId === profile.id ? (
                        <span className="mt-1 block rounded border border-surface-300 bg-surface-50 px-2 py-1 text-xs text-ink-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                          {profile.details}
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
              {customTestTypes.length > 0 ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-slate-400">
                    Custom Test Types
                  </p>
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                    {customTestTypes.map((profile) => (
                      <label
                        key={profile.id}
                        className="flex items-start gap-2 rounded-lg border border-surface-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTestTypes.includes(profile.id)}
                          onChange={() => toggleTestType(profile.id)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          data-testid={`qa-custom-test-${profile.id}`}
                        />
                        <span>
                          <span className="flex items-center gap-2">
                            <span className="block font-semibold text-ink-900 dark:text-white">{profile.label}</span>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setInfoProfileId((prev) => (prev === profile.id ? null : profile.id));
                              }}
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-surface-300 text-xs font-bold text-ink-700 dark:border-slate-600 dark:text-slate-200"
                              aria-label={`What is tested in ${profile.label}`}
                              title={`What is tested in ${profile.label}`}
                            >
                              i
                            </button>
                          </span>
                          <span className="block text-xs text-ink-600 dark:text-slate-300">{profile.description}</span>
                          {infoProfileId === profile.id ? (
                            <span className="mt-1 block rounded border border-surface-300 bg-surface-50 px-2 py-1 text-xs text-ink-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                              {profile.details}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() => void runGeneration()}
                    disabled={busy}
                    className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 min-h-[2.5rem] touch-manipulation"
                  >
                    Generate Checklist
                  </button>
                  <button
                    type="button"
                    onClick={() => void runGenerateTests()}
                    disabled={busy}
                    className="rounded-lg border border-brand-300 px-4 py-2.5 text-sm font-semibold text-brand-700 disabled:opacity-60 dark:border-brand-700 dark:text-brand-300 min-h-[2.5rem] touch-manipulation"
                  >
                    Generate Tests
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadExistingSuiteAction()}
                    disabled={busy}
                    className="rounded-lg border border-indigo-300 px-4 py-2.5 text-sm font-semibold text-indigo-700 disabled:opacity-60 dark:border-indigo-800 dark:text-indigo-300 min-h-[2.5rem] touch-manipulation"
                  >
                    Load Existing Suite
                  </button>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() => void runIntelligentReviewAction()}
                    disabled={busy || !generationJob?.result?.review}
                    className="rounded-lg border border-violet-300 px-4 py-2.5 text-sm font-semibold text-violet-700 disabled:opacity-60 dark:border-violet-800 dark:text-violet-300 min-h-[2.5rem] touch-manipulation"
                  >
                    Intelligent Review
                  </button>
                  <button
                    type="button"
                    onClick={() => void generateFixProposalsAction()}
                    disabled={busy || !generationJob?.result?.intelligentReview}
                    className="rounded-lg border border-fuchsia-300 px-4 py-2.5 text-sm font-semibold text-fuchsia-700 disabled:opacity-60 dark:border-fuchsia-800 dark:text-fuchsia-300 min-h-[2.5rem] touch-manipulation"
                  >
                    Generate Fix Proposals
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadGeneratedTestsAction()}
                    disabled={busy || !generationJob}
                    className="rounded-lg border border-surface-300 px-4 py-2.5 text-sm font-semibold text-ink-700 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 min-h-[2.5rem] touch-manipulation"
                  >
                    Load Tests
                  </button>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() => void prepareAiRunAction()}
                    disabled={busy || !generationJob || !playwrightUiBridgeEnabled}
                    className="rounded-lg border border-emerald-300 px-4 py-2.5 text-sm font-semibold text-emerald-800 disabled:opacity-60 dark:border-emerald-900/50 dark:text-emerald-300 min-h-[2.5rem] touch-manipulation"
                  >
                    Prepare AI Run
                  </button>
                  <button
                    type="button"
                    onClick={() => void executeAiRunAction()}
                    disabled={busy || !generationJob || !playwrightUiBridgeEnabled}
                    className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 min-h-[2.5rem] touch-manipulation"
                  >
                    Execute AI Run
                  </button>
                  <button
                    type="button"
                    onClick={() => void runAutomationAction("continuous_fix")}
                    disabled={busy || !generationJob}
                    className="rounded-lg border border-emerald-300 px-4 py-2.5 text-sm font-semibold text-emerald-800 disabled:opacity-60 dark:border-emerald-900/50 dark:text-emerald-300 min-h-[2.5rem] touch-manipulation"
                  >
                    Continuous Auto-Fix
                  </button>
                  <button
                    type="button"
                    onClick={() => void runAutomationAction("alert_only")}
                    disabled={busy || !generationJob}
                    className="rounded-lg border border-amber-300 px-4 py-2.5 text-sm font-semibold text-amber-800 disabled:opacity-60 dark:border-amber-900/50 dark:text-amber-300 min-h-[2.5rem] touch-manipulation"
                  >
                    Alert-Only Check
                  </button>
                  {generationJob ? (
                    <button
                      type="button"
                      onClick={() => void fetchQaGenerationJob(generationJob.id).then(setGenerationJob).catch(() => undefined)}
                      disabled={busy}
                      className="rounded-lg border border-surface-300 px-4 py-2.5 text-sm font-semibold text-ink-700 dark:border-slate-700 dark:text-slate-200 min-h-[2.5rem] touch-manipulation"
                    >
                      Refresh Job
                    </button>
                  ) : null}
                </div>
              </div>

              {generationHistory.length > 0 ? (
                <div className="rounded-lg border border-surface-300 bg-surface-50 p-3 text-xs text-ink-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  <p className="font-semibold">Recent Generations</p>
                  <ul className="mt-2 space-y-1">
                    {generationHistory.map((job) => (
                      <li key={job.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          <code>{job.id}</code> · {job.status}
                        </span>
                        <span className="text-ink-500 dark:text-slate-400">
                          {new Date(job.createdAt).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {generationJob ? (
                <div className="space-y-3 rounded-lg border border-surface-300 p-4 dark:border-slate-700">
                  <p className="text-sm text-ink-700 dark:text-slate-200">
                    Job <code>{generationJob.id}</code> · status <span className="font-semibold">{generationJob.status}</span>
                  </p>
                  {generationJob.result?.tests ? (
                    <p className="text-xs text-ink-600 dark:text-slate-300">
                      Loaded tests: <span className="font-semibold">{generationJob.result.tests.length}</span>
                    </p>
                  ) : null}
                  {generationJob.result?.review ? (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                      <p className="font-semibold">
                        Existing Suite Review · Score {generationJob.result.review.score}/100
                      </p>
                      <p className="mt-1">
                        Reviewed files: {generationJob.result.review.reviewedFiles} · Discovered tests:{" "}
                        {generationJob.result.review.discoveredTests} · Loaded tests:{" "}
                        {generationJob.result.review.loadedTests}
                      </p>
                      <p className="mt-1">
                        Issues found: <span className="font-semibold">{generationJob.result.review.issueCount}</span>
                      </p>
                      {generationJob.result.review.issues.length > 0 ? (
                        <ul className="mt-2 list-disc pl-5">
                          {generationJob.result.review.issues.slice(0, 10).map((issue) => (
                            <li key={issue.id}>
                              <span className="font-semibold">[{issue.severity}]</span> {issue.message} ·{" "}
                              <code>
                                {issue.filePath}
                                {issue.line ? `:${issue.line}` : ""}
                              </code>{" "}
                              · Suggestion: {issue.suggestion}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                  {generationJob.result?.intelligentReview ? (
                    <div className="rounded-lg border border-violet-300 bg-violet-50 p-3 text-xs text-violet-900 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-200">
                      <p className="font-semibold">
                        Intelligent Review · Score {generationJob.result.intelligentReview.score}/100
                      </p>
                      <p className="mt-1">{generationJob.result.intelligentReview.summary}</p>
                      <p className="mt-1">
                        Generated at <code>{generationJob.result.intelligentReview.generatedAt}</code>
                      </p>
                      <p className="mt-1">
                        Provider <code>{generationJob.result.intelligentReview.metadata.provider}</code> · Model{" "}
                        <code>{generationJob.result.intelligentReview.metadata.model}</code> · Mode{" "}
                        <code>{generationJob.result.intelligentReview.metadata.mode}</code>
                      </p>
                      <ul className="mt-2 list-disc pl-5">
                        {generationJob.result.intelligentReview.suggestions.map((item) => (
                          <li key={item.id}>
                            <span className="font-semibold">[{item.priority}]</span> {item.suggestion}{" "}
                            <span className="font-semibold">
                              (confidence {(item.confidence * 100).toFixed(0)}%)
                            </span>
                            {item.affectedFiles.length > 0 ? (
                              <>
                                {" "}
                                · Files: <code>{item.affectedFiles.slice(0, 3).join(", ")}</code>
                              </>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {generationJob.result?.intelligentFixProposals ? (
                    <div className="rounded-lg border border-fuchsia-300 bg-fuchsia-50 p-3 text-xs text-fuchsia-900 dark:border-fuchsia-900/50 dark:bg-fuchsia-950/30 dark:text-fuchsia-200">
                      <p className="font-semibold">
                        Fix Proposals · {generationJob.result.intelligentFixProposals.length} generated
                      </p>
                      {generationJob.result.intelligentFixProposals.length > 0 ? (
                        <ul className="mt-2 list-disc pl-5">
                          {generationJob.result.intelligentFixProposals.map((proposal) => (
                            <li key={proposal.id}>
                              <span className="font-semibold">[{proposal.priority}]</span> {proposal.title} ·{" "}
                              <code>{proposal.filePath}</code> · risk {proposal.risk} ·{" "}
                              {(proposal.confidence * 100).toFixed(0)}% · status{" "}
                              <span className="font-semibold">{proposal.status ?? "pending"}</span>
                              {proposal.appliedAt ? (
                                <>
                                  {" "}
                                  · applied <code>{proposal.appliedAt}</code>
                                </>
                              ) : null}
                              {proposal.applyError ? <> · error: {proposal.applyError}</> : null}
                              {proposal.retestStatus ? (
                                <>
                                  {" "}
                                  · retest <span className="font-semibold">{proposal.retestStatus}</span>
                                </>
                              ) : null}
                              {proposal.retestAt ? (
                                <>
                                  {" "}
                                  @ <code>{proposal.retestAt}</code>
                                </>
                              ) : null}
                              {proposal.retestError ? <> · retest error: {proposal.retestError}</> : null}
                              <pre className="mt-1 overflow-auto rounded border border-fuchsia-300 bg-white p-2 text-[11px] text-fuchsia-900 dark:border-fuchsia-800 dark:bg-slate-950 dark:text-fuchsia-200">
                                {proposal.diffPreview}
                              </pre>
                              <button
                                type="button"
                                onClick={() => void applyFixProposalAction(proposal.id)}
                                disabled={busy || proposal.status === "applied"}
                                className="mt-1 rounded border border-fuchsia-400 bg-white px-2 py-1 text-[11px] font-semibold text-fuchsia-800 disabled:opacity-60 dark:border-fuchsia-700 dark:bg-slate-900 dark:text-fuchsia-200"
                              >
                                Apply Proposal
                              </button>
                              <button
                                type="button"
                                onClick={() => void retestFixProposalAction(proposal.id)}
                                disabled={busy || proposal.status !== "applied"}
                                className="ml-2 mt-1 rounded border border-blue-400 bg-white px-2 py-1 text-[11px] font-semibold text-blue-800 disabled:opacity-60 dark:border-blue-700 dark:bg-slate-900 dark:text-blue-200"
                              >
                                Retest Proposal
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1">No proposal candidates were generated for this run.</p>
                      )}
                    </div>
                  ) : null}
                  {generationJob.result?.automation ? (
                    <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
                      <p className="font-semibold">
                        Automation Summary · {generationJob.result.automation.strategy} · status{" "}
                        {generationJob.result.automation.status}
                      </p>
                      <p className="mt-1">{generationJob.result.automation.message}</p>
                      <p className="mt-1">
                        Iterations: {generationJob.result.automation.iterations} · Applied:{" "}
                        {generationJob.result.automation.appliedCount} · Retest passed:{" "}
                        {generationJob.result.automation.passedRetests} · Retest failed:{" "}
                        {generationJob.result.automation.failedRetests} · Remaining proposals:{" "}
                        {generationJob.result.automation.remainingProposals}
                      </p>
                      <p className="mt-1">
                        Started <code>{generationJob.result.automation.startedAt}</code> · Completed{" "}
                        <code>{generationJob.result.automation.completedAt}</code>
                      </p>
                    </div>
                  ) : null}

                  {generationJob.result ? (
                    <>
                      <p className="text-sm font-semibold text-ink-900 dark:text-white">{generationJob.result.suiteName}</p>
                      <div className="space-y-2">
                        {generationJob.result.cases.map((item, index) => (
                          <div key={`${item.title}-${index}`} className="rounded-lg border border-surface-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                            <p className="text-sm font-semibold text-ink-900 dark:text-white">{item.title}</p>
                            <p className="text-sm text-ink-600 dark:text-slate-300">{item.useCase}</p>
                            <p className="mt-1 text-xs text-ink-600 dark:text-slate-300">Expected: {item.expectedResult}</p>
                            <ul className="mt-2 list-disc pl-5 text-xs text-ink-700 dark:text-slate-200">
                              {item.steps.map((step, stepIndex) => (
                                <li key={`${item.title}-step-${stepIndex}`}>{step}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}

                  {generationJob.error ? (
                    <p className="text-sm text-rose-700 dark:text-rose-300">{generationJob.error}</p>
                  ) : null}
                </div>
              ) : null}

              {loadResult ? (
                <div className="rounded-lg border border-surface-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                  Loaded <span className="font-semibold">{loadResult.loadedCount}</span> generated tests at{" "}
                  <code>{loadResult.loadedAt}</code>.
                </div>
              ) : null}

              {prepareResult ? (
                <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
                  AI run prepared for <code>{prepareResult.runId}</code> with{" "}
                  <span className="font-semibold">{prepareResult.selectedTestTypes.join(", ")}</span>.
                </div>
              ) : null}

              {executeResult ? (
                <div
                  className={
                    executeResult.status === "failed"
                      ? "rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200"
                      : "rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200"
                  }
                >
                  <p>
                    AI run <span className="font-semibold">{executeResult.status}</span> for{" "}
                    <code>{executeResult.runId}</code>.
                    {aiPolling ? " Live updates enabled." : ""}
                  </p>
                  <p className="mt-1 text-xs">
                    Execution job: <code>{executeResult.executionJobId}</code>
                  </p>
                  <p className="mt-1 text-xs">
                    Started: <code>{executeResult.startedAt ?? "pending"}</code>
                    {executeResult.startedAt ? (
                      <>
                        {" "}
                        · Elapsed:{" "}
                        <code>
                          {Math.max(0, Math.floor((clockMs - new Date(executeResult.startedAt).getTime()) / 1000))}s
                        </code>
                      </>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs">
                    Command: <code>{executeResult.playwrightCommand || "pending"}</code>
                  </p>
                  <p className="mt-2">
                    Artifacts: <code>{executeResult.artifacts.reportRef || "pending"}</code>,{" "}
                    <code>{executeResult.artifacts.traceRef || "pending"}</code>,{" "}
                    <code>{executeResult.artifacts.videoRef || "pending"}</code>
                  </p>
                  {aiPollError ? <p className="mt-1 text-xs">Status warning: {aiPollError}</p> : null}
                  {executeResult.error ? <> · Error: {executeResult.error}</> : null}
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAiPollError("");
                        setAiPolling(true);
                      }}
                      disabled={aiPolling || (executeResult.status !== "queued" && executeResult.status !== "running")}
                      className="mr-2 rounded-lg border border-emerald-300 px-2 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-60 dark:border-emerald-900/50 dark:text-emerald-300"
                    >
                      Resume Live Updates
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void fetchQaAiExecutionStatus({
                          runId: executeResult.runId,
                          executionJobId: executeResult.executionJobId,
                        })
                          .then((status) =>
                            setExecuteResult({
                              runId: status.runId,
                              executionJobId: status.id,
                              status: status.status,
                              startedAt: status.startedAt,
                              completedAt: status.completedAt,
                              playwrightCommand: status.playwrightCommand,
                              artifacts: {
                                reportRef: status.reportRef ?? "",
                                traceRef: status.traceRef ?? "",
                                videoRef: status.videoRef ?? "",
                              },
                              error: status.error ?? undefined,
                            }),
                          )
                          .catch((refreshError) =>
                            setAiPollError(refreshError instanceof Error ? refreshError.message : "Failed to refresh status"),
                          )
                      }
                      className="rounded-lg border border-surface-300 px-2 py-1 text-xs font-semibold text-ink-700 dark:border-slate-700 dark:text-slate-200"
                    >
                      Refresh Status
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </SurfaceCard>
      ) : null}

      {showTeamSection ? (
        <div className="space-y-4">
          <SurfaceCard className="p-6">
            <h3 className="text-lg font-semibold text-ink-900 dark:text-white">Team Hub</h3>
            <p className="mt-1 text-sm text-ink-600 dark:text-slate-300">
              Manage collaborators, share links, and run notes from the team workspace.
            </p>
          </SurfaceCard>
          {collaborationPanel}
        </div>
      ) : null}

      {showSettingsSection ? (
        <SurfaceCard className="space-y-4 p-6">
          <h3 className="text-lg font-semibold text-ink-900 dark:text-white">Settings</h3>
          <p className="text-sm text-ink-600 dark:text-slate-300">
            Runtime details and configuration hints.
          </p>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-slate-400">
              Workspace Profile
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={activeWorkspaceId}
                onChange={(event) => void applyWorkspace(event.target.value)}
                className="min-w-[220px] rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                {workspaceProfiles.length === 0 ? (
                  <option value="default">default</option>
                ) : (
                  workspaceProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.label}
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                onClick={() => void fetchQaWorkspaces().then(setWorkspaceProfiles).catch(() => setWorkspaceProfiles([]))}
                className="rounded-lg border border-surface-300 px-3 py-2 text-xs font-semibold text-ink-700 dark:border-slate-700 dark:text-slate-200"
              >
                Refresh Profiles
              </button>
            </div>
            <p className="text-xs text-ink-500 dark:text-slate-400">
              Workspace profiles isolate QA runs and notes per repo. Default profile stores data in
              <code> tools/qa-runner.db</code>.
            </p>
          </div>
          <div className="rounded-lg border border-surface-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-slate-400">
              Add Workspace
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <input
                value={newWorkspaceName}
                onChange={(event) => setNewWorkspaceName(event.target.value)}
                placeholder="Workspace name"
                className="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
              <input
                value={newWorkspacePath}
                onChange={(event) => setNewWorkspacePath(event.target.value)}
                placeholder="Cases path (optional)"
                className="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
              <input
                value={newWorkspaceGitUrl}
                onChange={(event) => setNewWorkspaceGitUrl(event.target.value)}
                placeholder="Git URL (optional)"
                className="md:col-span-2 rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void createWorkspaceProfile()}
                className="rounded-lg border border-surface-300 px-3 py-2 text-xs font-semibold text-ink-700 dark:border-slate-700 dark:text-slate-200"
              >
                Save Workspace
              </button>
            </div>
            {workspaceStatus ? (
              <p className="mt-2 text-xs text-ink-500 dark:text-slate-400">{workspaceStatus}</p>
            ) : null}
          </div>
          {workspaceProfiles.length > 0 ? (
            <div className="rounded-lg border border-surface-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-slate-400">
                Workspace List
              </p>
              <ul className="mt-3 space-y-2 text-xs text-ink-700 dark:text-slate-200">
                {workspaceProfiles.map((profile) => (
                  <li key={profile.id} className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{profile.label}</p>
                      <p className="text-ink-500 dark:text-slate-400">{profile.casesDir}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {profile.gitUrl ? (
                        <button
                          type="button"
                          onClick={() => void syncWorkspaceProfile(profile.id)}
                          className="rounded-lg border border-surface-300 px-2 py-1 text-[11px] font-semibold text-ink-700 dark:border-slate-700 dark:text-slate-200"
                        >
                          Sync
                        </button>
                      ) : null}
                      {!profile.isDefault ? (
                        <button
                          type="button"
                          onClick={() => void removeWorkspaceProfile(profile.id)}
                          className="rounded-lg border border-rose-300 px-2 py-1 text-[11px] font-semibold text-rose-700 dark:border-rose-800 dark:text-rose-300"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-surface-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs text-ink-500 dark:text-slate-400">AI mode</p>
              <p className="mt-1 font-semibold text-ink-900 dark:text-white">
                {aiModeEnabled ? "Enabled" : "Disabled"}
              </p>
            </div>
            <div className="rounded-lg border border-surface-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs text-ink-500 dark:text-slate-400">Runtime status</p>
              <p className="mt-1 font-semibold text-ink-900 dark:text-white">
                {runtimeStatus?.executionMode ?? "Unknown"}
              </p>
            </div>
            <div className="rounded-lg border border-surface-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs text-ink-500 dark:text-slate-400">Cases folder</p>
              <p className="mt-1 font-semibold text-ink-900 dark:text-white">
                {runtimeStatus?.casesRoot ?? "docs/qa-cases"}
              </p>
            </div>
            <div className="rounded-lg border border-surface-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs text-ink-500 dark:text-slate-400">Execution mode</p>
              <p className="mt-1 font-semibold text-ink-900 dark:text-white">
                {runtimeStatus?.executionMode ?? "n/a"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadRuntimeStatus()}
              className="rounded-lg border border-surface-300 px-3 py-2 text-xs font-semibold text-ink-700 dark:border-slate-700 dark:text-slate-200"
            >
              Refresh Runtime
            </button>
            <button
              type="button"
              onClick={() => void loadSuites()}
              className="rounded-lg border border-surface-300 px-3 py-2 text-xs font-semibold text-ink-700 dark:border-slate-700 dark:text-slate-200"
            >
              Refresh Suites
            </button>
          </div>
        </SurfaceCard>
      ) : null}

      {mode === "manual" ? (
        <>
          <SurfaceCard className="space-y-3 p-6">
            <h3 className="text-base font-semibold text-ink-900">Suite Source</h3>
            <p className="text-sm text-ink-700 dark:text-slate-200">
              QA cases are generated in the <code>docs/qa-cases</code> folder.
            </p>
            <p className="text-xs text-ink-600 dark:text-slate-300">
              File naming rule: <code>YYYY-MM-DD__feature-name.md</code>. Files in <code>archive/</code> are ignored.
            </p>
            <p className="text-xs text-ink-600 dark:text-slate-300">
              Add a new file in that folder, click <span className="font-semibold">Reload Suites</span>, and it will appear in the suite list.
            </p>
            <p className="text-xs text-ink-600 dark:text-slate-300">
              Use <span className="font-semibold">Duplicate Suite (Today)</span> to clone the selected suite into a new dated file with reset completion state.
            </p>
            <div className="rounded-lg border border-surface-300 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-slate-400">
                  Markdown validation
                </p>
                <button
                  type="button"
                  onClick={() => void loadMarkdownValidation()}
                  disabled={busy}
                  className="rounded-lg border border-surface-300 px-2 py-1 text-xs font-semibold text-ink-700 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200"
                >
                  Refresh Validation
                </button>
              </div>
              {validationReport ? (
                <>
                  <p className="mt-2 text-xs text-ink-700 dark:text-slate-200">
                    Scanned <span className="font-semibold">{validationReport?.scannedFiles ?? 0}</span> files ·
                    errors <span className="font-semibold text-rose-700 dark:text-rose-300">{validationReport?.errorCount ?? 0}</span> ·
                    warnings <span className="font-semibold text-amber-700 dark:text-amber-300">{validationReport?.warningCount ?? 0}</span>
                  </p>
                  {validationReport?.issues?.length > 0 ? (
                    <div className="mt-2 max-h-60 space-y-2 overflow-auto">
                      {groupedValidationIssues.map((group) => (
                        <div
                          key={group.filePath}
                          className="rounded border border-surface-300 bg-surface-50 p-2 dark:border-slate-700 dark:bg-slate-950/40"
                        >
                          <p className="text-[11px] font-semibold text-ink-800 dark:text-slate-200">
                            <code>{group.filePath}</code> · errors{" "}
                            <span className="text-rose-700 dark:text-rose-300">{group.errorCount}</span> · warnings{" "}
                            <span className="text-amber-700 dark:text-amber-300">{group.warningCount}</span>
                          </p>
                          <ul className="mt-1 space-y-1 text-[11px] text-ink-700 dark:text-slate-200">
                            {group.issues.slice(0, 12).map((issue, index) => (
                              <li key={`${issue.filePath}:${issue.line}:${issue.code}:${index}`}>
                                <span
                                  className={
                                    issue.level === "error"
                                      ? "font-semibold text-rose-700 dark:text-rose-300"
                                      : "font-semibold text-amber-700 dark:text-amber-300"
                                  }
                                >
                                  [{issue.level.toUpperCase()}]
                                </span>{" "}
                                line <code>{issue.line}</code> · {issue.message}{" "}
                                <span className="text-ink-500 dark:text-slate-400">({issue.code})</span>
                                <div className="text-ink-600 dark:text-slate-300">
                                  Quick fix: {quickFixForValidationCode(issue.code)}
                                </div>
                              </li>
                            ))}
                            {group.issues.length > 12 ? (
                              <li className="text-ink-500 dark:text-slate-400">
                                +{group.issues.length - 12} more issue(s) in this file.
                              </li>
                            ) : null}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">No markdown validation issues found.</p>
                  )}
                </>
              ) : (
                <p className="mt-2 text-xs text-ink-600 dark:text-slate-300">Validation report unavailable.</p>
              )}
            </div>
            <details className="rounded-lg border border-surface-300 bg-surface-50 p-3 text-xs text-ink-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <summary className="cursor-pointer font-semibold">Markdown template</summary>
              <pre className="mt-2 overflow-auto whitespace-pre-wrap text-[11px] leading-5">
{`# Signup Flow Manual QA
feature: signup
date: 2026-03-28

## [signup-happy-path] Successful signup
- Priority: high
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: Visitor can create a new account.
- Expected: Account is created and user is redirected to dashboard.
- Notes:
- FailureReason:
### Steps
- [ ] Open /signup
- [ ] Fill valid email/password
- [ ] Submit form
- [ ] Verify redirect and success state`}
              </pre>
            </details>
          </SurfaceCard>

          <SurfaceCard className="space-y-4 p-6">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(280px,1fr)_auto]">
              <label className="text-sm text-ink-700 dark:text-slate-200">
                Suite
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search suites by name, feature, or description... (Ctrl+/ to focus)"
                  className="mt-1 block w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <select
                  value={selectedSuiteId}
                  onChange={(event) => {
                    const nextSuiteId = event.target.value;
                    setSelectedSuiteId(nextSuiteId);
                    setRunDetail(null);
                    setSelectedCaseId("");
                    setAutoLoadedSuiteId("");
                  }}
                  className="mt-2 block w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  disabled={loading || busy || suites.length === 0}
                  data-onboarding="suite-selector"
                >
                  {filteredSuites.map((suite) => (
                    <option key={suite.id} value={suite.id}>
                      {suite.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() => void startRun(true)}
                    disabled={loading || busy || !selectedSuiteId}
                    data-testid="qa-start-run"
                    className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 min-h-[2.5rem] touch-manipulation"
                  >
                    Start Run
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadSuites()}
                    disabled={loading || busy}
                    className="rounded-lg border border-surface-300 px-4 py-2.5 text-sm font-semibold text-ink-700 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 min-h-[2.5rem] touch-manipulation"
                  >
                    Reload Suites
                  </button>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() => void duplicateSuiteAction()}
                    disabled={loading || busy || !selectedSuiteId}
                    className="rounded-lg border border-surface-300 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-surface-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 min-h-[2.5rem] touch-manipulation"
                  >
                    Duplicate Suite (Today)
                  </button>
                  <button
                    type="button"
                    onClick={() => void exportSuiteAction()}
                    disabled={loading || busy || !selectedSuiteId}
                    className="rounded-lg border border-surface-300 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-surface-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 min-h-[2.5rem] touch-manipulation"
                  >
                    Export Suite Config
                  </button>
                  <label className="flex cursor-pointer items-center rounded-lg border border-surface-300 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-surface-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 min-h-[2.5rem] touch-manipulation">
                    Import Suite Config
                    <input
                      type="file"
                      accept=".md,text/markdown"
                      className="sr-only"
                      disabled={loading || busy}
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        void handleSuiteConfigImport(file);
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-surface-200 bg-surface-50 p-3 dark:border-slate-700 dark:bg-slate-900">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-slate-400">Danger Zone</span>
              <button
                type="button"
                onClick={() => openDestructiveModal("archive")}
                disabled={loading || busy || !selectedSuiteId}
                className="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:border-amber-400 hover:text-amber-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-amber-400/60"
              >
                Archive Suite
              </button>
              <button
                type="button"
                onClick={() => openDestructiveModal("delete")}
                disabled={loading || busy || !selectedSuiteId}
                className="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:border-rose-400 hover:text-rose-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-rose-400/60"
              >
                Delete Suite Permanently
              </button>
            </div>

            {runDetail ? (
              <div className="space-y-3 rounded-lg border border-surface-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
                  <label className="text-sm text-ink-700 dark:text-slate-200">
                    Cases
                    <input
                      type="text"
                      value={caseSearchTerm}
                      onChange={(event) => setCaseSearchTerm(event.target.value)}
                      placeholder="Search cases..."
                      className="mt-1 block w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <select
                      value={caseFilterMode}
                      onChange={(event) => setCaseFilterMode(event.target.value as CaseFilterMode)}
                      className="mt-2 block w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      disabled={busy}
                    >
                      <option value="incomplete">Incomplete (default)</option>
                      <option value="all">All</option>
                      <option value="completed">Completed</option>
                    </select>
                  </label>
                  <label className="text-sm text-ink-700 dark:text-slate-200">
                    Run Summary Notes
                    <textarea
                      value={runNotes}
                      onChange={(event) => setRunNotes(event.target.value)}
                      rows={2}
                      className="mt-1 block w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-ink-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      placeholder="Overall run summary (optional)"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void finalizeRun()}
                    disabled={busy}
                    data-testid="qa-finalize-run"
                    className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-800 dark:border-emerald-900/50 dark:text-emerald-300"
                  >
                    Finalize Run
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadRunReportJson()}
                    disabled={busy}
                    className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-800 dark:border-blue-900/50 dark:text-blue-300"
                  >
                    Download Report JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadRunReportMarkdown()}
                    disabled={busy}
                    className="rounded-lg border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-800 dark:border-indigo-900/50 dark:text-indigo-300"
                  >
                    Download Report Markdown
                  </button>
                  <label className="flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-ink-700 transition hover:bg-surface-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                    Import Report JSON
                    <input
                      type="file"
                      accept="application/json"
                      className="sr-only"
                      disabled={busy}
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        void handleRunReportImport(file);
                        event.target.value = "";
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void sendRunReportWebhook()}
                    disabled={busy}
                    className="rounded-lg border border-fuchsia-300 px-3 py-2 text-sm font-semibold text-fuchsia-800 dark:border-fuchsia-900/50 dark:text-fuchsia-300"
                  >
                    Send Report Webhook
                  </button>
                </div>
                {importError ? (
                  <p className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200" role="alert" aria-live="assertive">
                    {importError}
                  </p>
                ) : null}
                {importedRunReport ? (
                  <div className="mt-4 rounded-lg border border-surface-300 bg-surface-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-ink-900 dark:text-white">Imported QA Run Report</p>
                        <p className="text-xs text-ink-600 dark:text-slate-300">
                          Suite: {importedRunReport.suite.name} · Run ID: {importedRunReport.run.id}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setImportedRunReport(null)}
                        className="rounded-lg border border-surface-300 px-2 py-1 text-xs font-semibold text-ink-700 dark:border-slate-700 dark:text-slate-200"
                      >
                        Clear Imported Report
                      </button>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg border border-surface-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                        <p className="text-[11px] uppercase tracking-wide text-ink-500 dark:text-slate-400">Summary</p>
                        <p className="mt-2 text-sm text-ink-700 dark:text-slate-200">Total cases: {importedRunReport.summary.totalCases}</p>
                        <p className="text-sm text-emerald-700 dark:text-emerald-300">Passed: {importedRunReport.summary.passed}</p>
                        <p className="text-sm text-rose-700 dark:text-rose-300">Failed: {importedRunReport.summary.failed}</p>
                        <p className="text-sm text-amber-700 dark:text-amber-300">Blocked: {importedRunReport.summary.blocked}</p>
                      </div>
                      <div className="rounded-lg border border-surface-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                        <p className="text-[11px] uppercase tracking-wide text-ink-500 dark:text-slate-400">Imported run status</p>
                        <p className="mt-2 text-sm text-ink-700 dark:text-slate-200">Status: {importedRunReport.run.status}</p>
                        <p className="text-sm text-ink-700 dark:text-slate-200">Tester: {importedRunReport.run.testedBy ?? "N/A"}</p>
                        <p className="text-sm text-ink-700 dark:text-slate-200">Created: {new Date(importedRunReport.run.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                ) : null}
                {importConfigError ? (
                  <p className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200" role="alert" aria-live="assertive">
                    {importConfigError}
                  </p>
                ) : null}
                {importedSuiteConfig ? (
                  <div className="mt-4 rounded-lg border border-surface-300 bg-surface-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-ink-900 dark:text-white">Imported QA Suite Config</p>
                        <p className="text-xs text-ink-600 dark:text-slate-300">
                          Suite: {importedSuiteConfig.suite.name} · {importedSuiteConfig.cases.length} cases
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setImportedSuiteConfig(null)}
                        className="rounded-lg border border-surface-300 px-2 py-1 text-xs font-semibold text-ink-700 dark:border-slate-700 dark:text-slate-200"
                      >
                        Clear Imported Config
                      </button>
                    </div>
                    <div className="mt-3">
                      <p className="text-[11px] uppercase tracking-wide text-ink-500 dark:text-slate-400">Preview</p>
                      <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-surface-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                        <div className="space-y-2">
                          {importedSuiteConfig.cases.slice(0, 3).map((caseItem) => (
                            <div key={caseItem.id} className="border-b border-surface-100 pb-2 last:border-b-0 dark:border-slate-800">
                              <p className="font-medium text-ink-900 dark:text-white">{caseItem.title}</p>
                              <p className="text-xs text-ink-600 dark:text-slate-300">
                                Priority: {caseItem.priority} · {caseItem.steps.length} steps
                              </p>
                            </div>
                          ))}
                          {importedSuiteConfig.cases.length > 3 && (
                            <p className="text-xs text-ink-500 dark:text-slate-400">
                              ... and {importedSuiteConfig.cases.length - 3} more cases
                            </p>
                          )}
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-ink-600 dark:text-slate-300">
                        To use this config, save the imported markdown file to your QA suites directory.
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {runDetail ? (
              <div className="text-xs text-ink-600 dark:text-slate-300">
                Run <code>{runDetail.run.id}</code> · status{" "}
                <span className={`rounded px-2 py-0.5 font-semibold ${statusPillClass(runDetail.run.status)}`}>
                  {runDetail.run.status}
                </span>
                {runDetail.run.testedBy ? (
                  <>
                    {" "}
                    · tester <span className="font-semibold">{runDetail.run.testedBy}</span>
                  </>
                ) : null}
              </div>
            ) : null}
          </SurfaceCard>

          {destructiveModalAction ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 px-4">
              <div
                ref={destructiveModalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="qa-destructive-modal-title"
                aria-describedby="qa-destructive-modal-description"
                className="w-full max-w-lg rounded-xl border border-surface-300 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
              >
                <h3 id="qa-destructive-modal-title" className="text-base font-semibold text-ink-900 dark:text-white">
                  {destructiveModalAction === "archive" ? "Archive Suite" : "Delete Suite Permanently"}
                </h3>
                <p id="qa-destructive-modal-description" className="mt-2 text-sm text-ink-700 dark:text-slate-200">
                  {destructiveModalAction === "archive"
                    ? `Archive "${selectedSuite?.name ?? selectedSuiteId}"? This moves the markdown suite file to archive and removes it from active list.`
                    : `Permanently delete "${selectedSuite?.name ?? selectedSuiteId}"? This removes the markdown source file and cannot be undone.`}
                </p>
                <label className="mt-3 block text-sm text-ink-700 dark:text-slate-200">
                  Reason (optional)
                  <textarea
                    ref={destructiveReasonRef}
                    value={destructiveReason}
                    onChange={(event) => setDestructiveReason(event.target.value)}
                    rows={3}
                    className="mt-1 block w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-ink-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    placeholder="Reason for this destructive action"
                  />
                </label>
                <p className="mt-2 text-xs text-ink-500 dark:text-slate-400">
                  Keyboard: <code>Esc</code> to cancel, <code>Ctrl+Enter</code> to confirm.
                </p>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => closeDestructiveModal()}
                    disabled={busy}
                    className="rounded-lg border border-surface-300 px-3 py-2 text-sm font-semibold text-ink-700 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmDestructiveModal()}
                    disabled={busy}
                    className={
                      destructiveModalAction === "archive"
                        ? "rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-800 disabled:opacity-60 dark:border-amber-900/50 dark:text-amber-300"
                        : "rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-800 disabled:opacity-60 dark:border-rose-900/50 dark:text-rose-300"
                    }
                  >
                    {destructiveModalAction === "archive" ? "Confirm Archive" : "Confirm Delete"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <SurfaceCard className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-500 dark:text-slate-400">Run History</h3>
              <button
                type="button"
                onClick={() => void loadRunHistory()}
                disabled={busy || runHistoryLoading || !selectedSuiteId}
                className="rounded-lg border border-surface-300 px-2 py-1 text-xs font-semibold text-ink-700 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200"
              >
                Refresh Runs
              </button>
            </div>
            {runHistoryLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={`run-history-skeleton-${index}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-surface-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="space-y-2">
                      <Skeleton height="0.9rem" width="140px" />
                      <Skeleton height="0.75rem" width="180px" />
                    </div>
                    <Skeleton height="1.5rem" width="52px" />
                  </div>
                ))}
              </div>
            ) : runHistory.length === 0 ? (
              <p className="text-xs text-ink-600 dark:text-slate-300">No runs found for selected suite.</p>
            ) : (
              <div className="max-h-52 space-y-2 overflow-auto">
                {runHistory.map((run) => (
                  <div key={run.id} className="flex items-center justify-between gap-2 rounded-lg border border-surface-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900">
                    <div>
                      <p className="font-semibold text-ink-900 dark:text-white">
                        <code>{run.id}</code>
                      </p>
                      <p className="text-ink-600 dark:text-slate-300">
                        {run.mode} · {run.status} · {new Date(run.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void openRunFromHistory(run.id, run.status)}
                      disabled={busy}
                      className="rounded-lg border border-brand-300 px-2 py-1 text-xs font-semibold text-brand-700 disabled:opacity-60 dark:border-brand-700 dark:text-brand-300"
                    >
                      Open
                    </button>
                  </div>
                ))}
              </div>
            )}
          </SurfaceCard>

          {runDetail ? (
            <SurfaceCard className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-500 dark:text-slate-400">Collaboration</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={collaboratorInput}
                  onChange={(event) => setCollaboratorInput(event.target.value)}
                  placeholder="Add collaborator name"
                  className="min-w-[220px] rounded-lg border border-surface-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  data-testid="qa-collab-input"
                />
                <button
                  type="button"
                  onClick={() => addCollaborator()}
                  disabled={busy}
                  className="rounded-lg border border-brand-300 px-3 py-2 text-xs font-semibold text-brand-700 disabled:opacity-60 dark:border-brand-700 dark:text-brand-300"
                  data-testid="qa-collab-add"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => void shareRunSummary()}
                  disabled={busy}
                  className="rounded-lg border border-surface-300 px-3 py-2 text-xs font-semibold text-ink-700 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200"
                  data-testid="qa-share-run"
                >
                  Create Share Link
                </button>
              </div>
              {collaborators.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {collaborators.map((collaborator) => (
                    <span
                      key={collaborator.id}
                      className="inline-flex items-center gap-2 rounded-full border border-surface-200 bg-white px-2.5 py-1 text-xs font-semibold text-ink-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    >
                      {collaborator.name}
                      <button
                        type="button"
                        onClick={() => removeCollaborator(collaborator.id)}
                        className="text-ink-400 hover:text-ink-600 dark:text-slate-400 dark:hover:text-slate-200"
                        aria-label={`Remove ${collaborator.name}`}
                        data-testid={`qa-collab-remove-${collaborator.id}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-500 dark:text-slate-400">
                  No collaborators added yet.
                </p>
              )}
              {shareStatus ? (
                <p className="text-xs text-emerald-700 dark:text-emerald-300" role="status" aria-live="polite">
                  {shareStatus}
                </p>
              ) : null}
              {shareLink ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-surface-200 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-950">
                  <code className="text-ink-700 dark:text-slate-200">{shareLink}</code>
                  <button
                    type="button"
                    onClick={() => window.open(shareLink, "_blank", "noopener,noreferrer")}
                    className="rounded-lg border border-brand-300 px-2 py-1 text-[11px] font-semibold text-brand-700 dark:border-brand-700 dark:text-brand-300"
                    data-testid="qa-share-open"
                  >
                    Open Link
                  </button>
                </div>
              ) : null}
            </SurfaceCard>
          ) : null}

          {runDetail ? (
            <SurfaceCard className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-500 dark:text-slate-400">Advanced Reporting</h3>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-surface-200 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-ink-500 dark:text-slate-400">Total cases</p>
                  <p className="mt-1 text-lg font-semibold text-ink-900 dark:text-white">{runDetail.cases.length}</p>
                </div>
                <div className="rounded-lg border border-surface-200 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-ink-500 dark:text-slate-400">Completion rate</p>
                  <p className="mt-1 text-lg font-semibold text-ink-900 dark:text-white">
                    {(() => {
                      const total = runDetail.cases.length;
                      const completed = runDetail.cases.filter((item) => {
                        const status = item.result?.status ?? "not_started";
                        return status === "passed" || status === "failed" || status === "blocked";
                      }).length;
                      return total > 0 ? `${Math.round((completed / total) * 100)}%` : "0%";
                    })()}
                  </p>
                </div>
                <div className="rounded-lg border border-surface-200 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-ink-500 dark:text-slate-400">Latest status</p>
                  <p className="mt-1 text-lg font-semibold text-ink-900 dark:text-white">{runDetail.run.status}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void downloadRunReportHtml()}
                  disabled={busy}
                  className="rounded-lg border border-surface-300 px-3 py-2 text-xs font-semibold text-ink-700 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200"
                  data-testid="qa-report-html"
                >
                  Download Report HTML
                </button>
                <button
                  type="button"
                  onClick={() => void printRunReportPdf()}
                  disabled={busy}
                  className="rounded-lg border border-surface-300 px-3 py-2 text-xs font-semibold text-ink-700 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200"
                  data-testid="qa-report-pdf"
                >
                  Print PDF
                </button>
              </div>
            </SurfaceCard>
          ) : null}

          {showManualSection ? (
            <>
          {loading && suites.length > 0 ? (
            <SurfaceCard className="space-y-3 p-6">
              <Skeleton height="1.25rem" width="35%" />
              <Skeleton height="1rem" width="100%" />
              <div className="flex flex-wrap gap-2">
                <Skeleton height="2.5rem" width="110px" />
                <Skeleton height="2.5rem" width="130px" />
                <Skeleton height="2.5rem" width="150px" />
              </div>
            </SurfaceCard>
          ) : null}

          {!loading && suites.length === 0 ? (
            <SurfaceCard className="p-6">
              <p className="text-sm text-ink-600 dark:text-slate-300">
                No QA suites available. Ensure QA runner plugin is enabled (`QA_RUNNER_ENABLED=true`) and permissions are granted.
              </p>
            </SurfaceCard>
          ) : null}

          {runDetailLoading ? (
            <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[320px_minmax(0,1fr)] md:gap-6">
              <SurfaceCard className="p-4">
                <Skeleton height="0.9rem" width="45%" />
                <div className="mt-3 space-y-2">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={`case-skeleton-${index}`}
                      className="rounded-lg border border-surface-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-900"
                    >
                      <Skeleton height="0.95rem" width="75%" className="mb-2" />
                      <Skeleton height="0.7rem" width="40%" />
                    </div>
                  ))}
                </div>
              </SurfaceCard>
              <SurfaceCard className="min-w-0 space-y-4 p-6">
                <Skeleton height="1.6rem" width="60%" />
                <Skeleton height="1rem" width="90%" />
                <Skeleton height="3rem" width="100%" />
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={`step-skeleton-${index}`}
                      className="rounded-lg border border-surface-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
                    >
                      <Skeleton height="0.9rem" width="85%" />
                    </div>
                  ))}
                </div>
                <Skeleton height="2.5rem" width="40%" />
                <Skeleton height="2.5rem" width="55%" />
              </SurfaceCard>
            </div>
          ) : runDetail ? (
            <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[320px_minmax(0,1fr)] md:gap-6">
              <SurfaceCard className="p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-500 dark:text-slate-400">Cases</h3>
                {runDetail ? (
                  <p className="mt-2 text-xs text-ink-500 dark:text-slate-400" role="status" aria-live="polite">
                    Showing {filteredCases.length} of {runDetail.cases.length}
                  </p>
                ) : null}
                <div className="mt-3 space-y-2">
                  {filteredCases.map((testCase) => (
                    <button
                      key={testCase.id}
                      type="button"
                      onClick={() => setSelectedCaseId(testCase.id)}
                      data-testid={`qa-case-${testCase.id}`}
                      className={[
                        "w-full rounded-lg border px-3 py-3 text-left transition-colors min-h-[3rem] touch-manipulation",
                        selectedCaseId === testCase.id
                          ? "border-brand-500 bg-brand-50 text-brand-900 dark:border-brand-500 dark:bg-brand-900/60 dark:text-white"
                          : "border-surface-300 bg-white text-ink-900 hover:bg-surface-50 active:bg-surface-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:active:bg-slate-700",
                      ].join(" ")}
                    >
                      <p className="text-sm font-semibold">{testCase.title}</p>
                      <p className={`mt-1 inline-flex rounded px-2 py-0.5 text-xs font-semibold ${statusPillClass(testCase.result?.status ?? "not_started")}`}>
                        {testCase.result?.status ?? "not_started"}
                      </p>
                    </button>
                  ))}
                  {filteredCases.length === 0 ? (
                    <p className="rounded-lg border border-surface-200 bg-white px-3 py-3 text-xs text-ink-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      No cases match this filter.
                    </p>
                  ) : null}
                </div>
              </SurfaceCard>

              <SurfaceCard className="min-w-0 space-y-4 p-6">
                {selectedCase ? (
                  <>
                    <div>
                      <h3 className="text-lg font-semibold text-ink-900 dark:text-white">{selectedCase.title}</h3>
                      <p className="mt-2 text-sm text-ink-600 dark:text-slate-300">
                        <span className="font-semibold text-ink-800 dark:text-slate-200">Use case:</span> {selectedCase.useCase}
                      </p>
                      <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
                        <span className="font-semibold">Expected result:</span> {selectedCase.expectedResult}
                      </p>
                    </div>

                    <div className="space-y-2">
                      {selectedCase.steps.length > 0 ? (
                        selectedCase.steps.map((step, index) => (
                          <label
                            key={step.id}
                            className="flex items-start gap-3 rounded-lg border border-surface-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-900 min-h-[3rem] touch-manipulation"
                          >
                            <input
                              type="checkbox"
                              checked={step.check?.checked ?? false}
                              onChange={(event) => void toggleStep(step.id, event.target.checked)}
                              disabled={busy}
                              data-testid={`qa-step-${step.id}`}
                              className="mt-1 h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            />
                            <span className="text-ink-700 dark:text-slate-200 leading-relaxed">
                              {index + 1}. {step.text}
                            </span>
                          </label>
                        ))
                      ) : (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                          <p className="font-semibold">No functional flow steps found for this case</p>
                          <p className="mt-1">Check the markdown file has a proper "### Steps" section with "- [ ] Step description" items.</p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <input
                        value={testerName}
                        onChange={(event) => setTesterName(event.target.value)}
                        placeholder="Tester name"
                        data-testid="qa-tester-name"
                        className="w-full rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-base text-ink-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white min-h-[2.5rem] touch-manipulation"
                      />
                      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                          <button
                            type="button"
                            onClick={() => void markCaseDone()}
                            disabled={busy || !selectedCase}
                            data-testid="qa-mark-done"
                            className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 min-h-[2.5rem] touch-manipulation"
                          >
                            Mark Done
                          </button>
                          <button
                            type="button"
                            onClick={() => void setCaseStatus("passed")}
                            disabled={busy || !selectedCase}
                            className="rounded-lg border border-emerald-300 px-4 py-2.5 text-sm font-semibold text-emerald-800 disabled:opacity-60 dark:border-emerald-900/50 dark:text-emerald-300 min-h-[2.5rem] touch-manipulation"
                          >
                            Mark Passed
                          </button>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                          <button
                            type="button"
                            onClick={() => void setCaseStatus("failed")}
                            disabled={busy || !selectedCase}
                            className="rounded-lg border border-rose-300 px-4 py-2.5 text-sm font-semibold text-rose-800 disabled:opacity-60 dark:border-rose-900/50 dark:text-rose-300 min-h-[2.5rem] touch-manipulation"
                          >
                            Mark Failed
                          </button>
                          <button
                            type="button"
                            onClick={() => void setCaseStatus("blocked")}
                            disabled={busy || !selectedCase}
                            className="rounded-lg border border-amber-300 px-4 py-2.5 text-sm font-semibold text-amber-800 disabled:opacity-60 dark:border-amber-900/50 dark:text-amber-300 min-h-[2.5rem] touch-manipulation"
                          >
                            Mark Blocked
                          </button>
                        </div>
                      </div>
                    </div>
                    {selectedCase.result?.testedBy || selectedCase.result?.completedAt ? (
                      <p className="text-xs text-ink-600 dark:text-slate-300">
                        Tester: <span className="font-semibold">{selectedCase.result?.testedBy ?? "n/a"}</span>{" "}
                        {selectedCase.result?.completedAt ? (
                          <>
                            · Completed <code>{selectedCase.result.completedAt}</code>
                          </>
                        ) : null}
                      </p>
                    ) : null}

                    <div>
                      <label className="block text-sm font-semibold text-ink-800 dark:text-slate-200">Notes</label>
                      <textarea
                        value={caseNotes}
                        onChange={(event) => setCaseNotes(event.target.value)}
                        rows={4}
                        data-testid="qa-case-notes"
                        className="mt-1 w-full rounded-lg border border-surface-300 bg-white px-3 py-3 text-base text-ink-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white min-h-[3rem] touch-manipulation"
                      />
                      <button
                        type="button"
                        onClick={() => void saveNotes()}
                        disabled={busy}
                        data-testid="qa-save-notes"
                        className="mt-3 rounded-lg border border-surface-300 px-4 py-2.5 text-sm font-semibold text-ink-700 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 min-h-[2.5rem] touch-manipulation"
                      >
                        Save Notes
                      </button>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-ink-800 dark:text-slate-200">Report Issue (GitHub)</h4>
                      <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <input
                          value={githubOwner}
                          onChange={(event) => setGithubOwner(event.target.value)}
                          placeholder="Owner/org"
                          className="rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 min-h-[2.5rem] touch-manipulation"
                          data-testid="qa-github-owner"
                        />
                        <input
                          value={githubRepo}
                          onChange={(event) => setGithubRepo(event.target.value)}
                          placeholder="Repo"
                          className="rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 min-h-[2.5rem] touch-manipulation"
                          data-testid="qa-github-repo"
                        />
                        <input
                          value={githubTitle}
                          onChange={(event) => setGithubTitle(event.target.value)}
                          placeholder="Issue title"
                          className="md:col-span-2 rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 min-h-[2.5rem] touch-manipulation"
                          data-testid="qa-github-title"
                        />
                        <textarea
                          value={githubBody}
                          onChange={(event) => setGithubBody(event.target.value)}
                          rows={4}
                          placeholder="Issue body"
                          className="md:col-span-2 rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 min-h-[3rem] touch-manipulation"
                          data-testid="qa-github-body"
                        />
                        <input
                          value={githubLabels}
                          onChange={(event) => setGithubLabels(event.target.value)}
                          placeholder="Labels (comma separated)"
                          className="rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 min-h-[2.5rem] touch-manipulation"
                          data-testid="qa-github-labels"
                        />
                        <input
                          value={githubAssignees}
                          onChange={(event) => setGithubAssignees(event.target.value)}
                          placeholder="Assignees (comma separated)"
                          className="rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 min-h-[2.5rem] touch-manipulation"
                          data-testid="qa-github-assignees"
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void submitGithubIssue()}
                          disabled={busy}
                          className="rounded-lg bg-ink-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60 dark:bg-slate-200 dark:text-slate-900"
                          data-testid="qa-github-submit"
                        >
                          Create GitHub Issue
                        </button>
                        {githubIssueUrl ? (
                          <button
                            type="button"
                            onClick={() => window.open(githubIssueUrl, "_blank", "noopener,noreferrer")}
                            className="rounded-lg border border-surface-300 px-3 py-2 text-xs font-semibold text-ink-700 dark:border-slate-700 dark:text-slate-200"
                            data-testid="qa-github-open"
                          >
                            Open Issue
                          </button>
                        ) : null}
                      </div>
                      {githubStatus ? (
                        <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300" role="status" aria-live="polite">
                          {githubStatus}
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-ink-800 dark:text-slate-200">Comments</h4>
                      <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-[160px_minmax(0,1fr)_auto]">
                        <input
                          value={commentAuthor}
                          onChange={(event) => setCommentAuthor(event.target.value)}
                          placeholder="Author"
                          className="min-w-0 rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 min-h-[2.5rem] touch-manipulation"
                          data-testid="qa-comment-author"
                        />
                        <input
                          value={commentMessage}
                          onChange={(event) => setCommentMessage(event.target.value)}
                          placeholder="Add a comment for collaborators"
                          className="min-w-0 rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 min-h-[2.5rem] touch-manipulation"
                          data-testid="qa-comment-input"
                        />
                        <button
                          type="button"
                          onClick={() => addCaseComment()}
                          disabled={busy}
                          className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 min-h-[2.5rem] touch-manipulation whitespace-nowrap lg:w-auto"
                          data-testid="qa-comment-add"
                        >
                          Post
                        </button>
                      </div>
                      {caseComments.length > 0 ? (
                        <ul className="mt-3 space-y-2">
                          {caseComments.map((comment) => (
                            <li
                              key={comment.id}
                              className="rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-semibold text-ink-800 dark:text-slate-200">{comment.author}</p>
                                  <p className="text-xs text-ink-500 dark:text-slate-400">
                                    {new Date(comment.createdAt).toLocaleString()}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeCaseComment(comment.id)}
                                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-300"
                                  data-testid={`qa-comment-delete-${comment.id}`}
                                >
                                  Remove
                                </button>
                              </div>
                              <p className="mt-2 text-sm text-ink-700 dark:text-slate-200">{comment.message}</p>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs text-ink-500 dark:text-slate-400">No comments yet.</p>
                      )}
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-ink-800 dark:text-slate-200">Evidence</h4>
                      <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)_auto]">
                        <select
                          value={evidenceType}
                          onChange={(event) => setEvidenceType(event.target.value)}
                          className="min-w-0 rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 min-h-[2.5rem] touch-manipulation"
                        >
                          <option value="link">link</option>
                          <option value="screenshot">screenshot</option>
                          <option value="trace">trace</option>
                          <option value="log">log</option>
                        </select>
                        <input
                          value={evidenceLabel}
                          onChange={(event) => setEvidenceLabel(event.target.value)}
                          placeholder="Label"
                          className="min-w-0 rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 min-h-[2.5rem] touch-manipulation"
                        />
                        <input
                          value={evidenceRef}
                          onChange={(event) => setEvidenceRef(event.target.value)}
                          placeholder="Reference URL/path"
                          className="min-w-0 rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 min-h-[2.5rem] touch-manipulation"
                        />
                        <button
                          type="button"
                          onClick={() => void addEvidence()}
                          disabled={busy}
                          className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 min-h-[2.5rem] touch-manipulation whitespace-nowrap lg:w-auto"
                        >
                          Add
                        </button>
                      </div>

                      {selectedCase.result?.evidence.length ? (
                        <ul className="mt-3 space-y-1 text-sm text-ink-700 dark:text-slate-200">
                          {selectedCase.result.evidence.map((item, index) => (
                            <li key={`${item.ref}-${index}`}>
                              <span className="font-semibold">{item.type}</span> · {item.label} ·{" "}
                              <a className="text-brand-600 dark:text-brand-300" href={item.ref} target="_blank" rel="noreferrer">
                                {item.ref}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-ink-600 dark:text-slate-300">Select a case to begin execution.</p>
                )}
              </SurfaceCard>

            </div>
          ) : null}
          {!runDetailLoading && !runDetail && !loading ? (
            <SurfaceCard className="p-6">
              <p className="text-sm text-ink-600 dark:text-slate-300">Select a suite to start a run.</p>
            </SurfaceCard>
          ) : null}
            </>
          ) : null}
        </>
      ) : null}

        </div>
      </div>

      {showMobileSidebar ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            onClick={() => setShowMobileSidebar(false)}
            className="absolute inset-0 bg-black/40"
            aria-label="Close navigation menu"
          />
          <div className="absolute left-0 top-0 h-full w-[85vw] max-w-sm overflow-y-auto bg-white p-4 shadow-xl dark:bg-slate-950">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-ink-900 dark:text-white">Navigation</p>
              <button
                type="button"
                onClick={() => setShowMobileSidebar(false)}
                className="rounded-lg border border-surface-300 px-2 py-1 text-xs font-semibold text-ink-700 dark:border-slate-700 dark:text-slate-200"
              >
                Close
              </button>
            </div>
            <div className="space-y-2">
              {navItem("manual", "Manual Testing", "M", true)}
              {navItem("ai", "AI Testing", "AI", true)}
              {navItem("team", "Team & Collaboration", "T", true)}
              {navItem("settings", "Settings", "S", true)}
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
};
