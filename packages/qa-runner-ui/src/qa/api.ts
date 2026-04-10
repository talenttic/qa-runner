import { apiFetch } from "../auth/apiFetch";
import { API_URL } from "../config/runtime";
import type {
  QaAutomationStrategy,
  QaAiExecutionStatus,
  QaAiExecuteResult,
  QaAiPrepareResult,
  QaCaseStatus,
  QaGenerationJob,
  QaGenerationStatus,
  QaManualRunReport,
  QaWorkspaceProfile,
  QaPlaywrightArtifacts,
  QaRun,
  QaRunDetail,
  QaSuiteFile,
  QaStepRunCheck,
  QaSuite,
  QaMarkdownValidationReport,
  QaTestType,
  QaTestsLoadResult,
  QaRuntimeStatus,
  QaRunCollaborator,
  QaCaseComment,
  QaRunSharePayload,
  QaGithubIssueRequest,
  QaGithubIssueResponse,
  QaCustomTestType,
  QaFlakinessReport,
} from "./types";

const parseError = async (response: Response): Promise<Error> => {
  const text = await response.text().catch(() => "");
  let message = `Request failed (${response.status})`;
  if (text) {
    try {
      const payload = JSON.parse(text) as { error?: string };
      message = payload.error ?? message;
    } catch {
      message = `${message}: ${text.slice(0, 200)}`;
    }
  }
  return new Error(message);
};

const parseJson = async <T>(response: Response): Promise<T> => {
  try {
    return (await response.json()) as T;
  } catch (error) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Invalid JSON response from ${response.url} (${response.status}): ${body.slice(0, 200)}`,
    );
  }
};

const safeText = (value: unknown): string => (typeof value === "string" ? value : "");

// Check if response is from cache (service worker adds this header)
const isFromCache = (response: Response): boolean => {
  return response.headers.get('sw-cache') === 'true' ||
         response.status === 503; // Our offline response
};

interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  retryCondition?: (error: Error) => boolean;
}

const defaultRetryCondition = (error: Error): boolean => {
  // Retry on network errors, 5xx server errors, and specific 4xx errors
  const message = error.message.toLowerCase();
  return (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('failed to fetch') ||
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('408') ||
    message.includes('429')
  );
};

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const withRetry = async <T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> => {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    retryCondition = defaultRetryCondition,
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries || !retryCondition(lastError)) {
        throw lastError;
      }

      // Exponential backoff with jitter
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const jitter = Math.random() * 0.1 * delay; // Add up to 10% jitter
      const finalDelay = delay + jitter;

      console.warn(`API call failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(finalDelay)}ms:`, lastError.message);
      await sleep(finalDelay);
    }
  }

  throw lastError!;
};

export const fetchQaSuites = async (): Promise<{ data: QaSuite[]; fromCache: boolean }> => {
  return withRetry(async () => {
    const response = await apiFetch(`${API_URL}/plugin/qa/suites`);
    if (!response.ok) {
      throw await parseError(response);
    }
    const payload = (await response.json()) as { data?: QaSuite[] };
    return {
      data: Array.isArray(payload.data) ? payload.data : [],
      fromCache: isFromCache(response)
    };
  });
};

export const fetchQaSuiteFiles = async (): Promise<QaSuiteFile[]> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/suites/files`);
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as {
    data?: Array<{
      suiteId?: unknown;
      fileName?: unknown;
      relativePath?: unknown;
      suiteName?: unknown;
      feature?: unknown;
      date?: unknown;
    }>;
  };
  const rows = Array.isArray(payload.data) ? payload.data : [];
  return rows.map((row) => ({
    suiteId: safeText(row.suiteId),
    fileName: safeText(row.fileName),
    relativePath: safeText(row.relativePath),
    suiteName: safeText(row.suiteName),
    feature: safeText(row.feature),
    date: safeText(row.date),
  }));
};

export const fetchQaMarkdownValidation = async (): Promise<QaMarkdownValidationReport> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/suites/validation`);
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaMarkdownValidationReport };
  if (!payload.data) {
    throw new Error("QA markdown validation response shape mismatch");
  }
  return payload.data;
};

export const duplicateQaSuite = async (suiteId: string): Promise<QaSuite> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/suites/${encodeURIComponent(suiteId)}/duplicate`, {
    method: "POST",
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaSuite };
  if (!payload.data) {
    throw new Error("Duplicate suite response shape mismatch");
  }
  return payload.data;
};

export const archiveQaSuite = async (suiteId: string, reason?: string): Promise<{ archivedPath: string }> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/suites/${encodeURIComponent(suiteId)}/archive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: reason ?? "" }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: { archivedPath?: string } };
  return { archivedPath: safeText(payload.data?.archivedPath) || "" };
};

export const deleteQaSuite = async (suiteId: string, reason?: string): Promise<{ deletedPath: string }> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/suites/${encodeURIComponent(suiteId)}/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: reason ?? "" }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: { deletedPath?: string } };
  return { deletedPath: safeText(payload.data?.deletedPath) || "" };
};

export const fetchQaArchivedSuites = async (): Promise<
  Array<{ fileName: string; relativePath: string; suiteName: string; feature: string; date: string }>
> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/suites/archived`);
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as {
    data?: Array<{
      fileName?: unknown;
      relativePath?: unknown;
      suiteName?: unknown;
      feature?: unknown;
      date?: unknown;
    }>;
  };
  const rows = Array.isArray(payload.data) ? payload.data : [];
  return rows.map((row) => ({
    fileName: safeText(row.fileName),
    relativePath: safeText(row.relativePath),
    suiteName: safeText(row.suiteName),
    feature: safeText(row.feature),
    date: safeText(row.date),
  }));
};

export const fetchQaSuiteMarkdown = async (suiteId: string): Promise<string> => {
  // First get the suite file info
  const suiteFiles = await fetchQaSuiteFiles();
  const suiteFile = suiteFiles.find((file) => file.suiteId === suiteId);
  if (!suiteFile) {
    throw new Error("Suite file not found");
  }
  
  // Fetch the markdown content
  const response = await apiFetch(`${API_URL}/file?path=${encodeURIComponent(suiteFile.relativePath)}`);
  if (!response.ok) {
    throw await parseError(response);
  }
  return await response.text();
};

export const restoreQaArchivedSuite = async (input: {
  fileName: string;
  reason?: string;
}): Promise<{ suiteId: string; restoredPath: string }> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/suites/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: input.fileName,
      reason: input.reason ?? "",
    }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as {
    data?: { suite?: { id?: unknown }; restoredPath?: unknown };
  };
  return {
    suiteId: safeText(payload.data?.suite?.id),
    restoredPath: safeText(payload.data?.restoredPath),
  };
};

export const fetchQaRuntimeStatus = async (): Promise<QaRuntimeStatus> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/runtime`);
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaRuntimeStatus };
  if (!payload.data) {
    throw new Error("QA runtime response shape mismatch");
  }
  return payload.data;
};

export const fetchQaFlakinessReport = async (): Promise<QaFlakinessReport> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/flakiness`);
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaFlakinessReport };
  if (!payload.data) {
    throw new Error("QA flakiness response shape mismatch");
  }
  return payload.data;
};

export const fetchQaCustomTestTypes = async (): Promise<QaCustomTestType[]> => {
  return withRetry(async () => {
    const response = await apiFetch(`${API_URL}/plugin/qa/test-types`);
    if (!response.ok) {
      throw await parseError(response);
    }
    const payload = (await response.json()) as { data?: QaCustomTestType[] };
    return Array.isArray(payload.data) ? payload.data : [];
  });
};

export const createQaRun = async (suiteId: string, mode: "manual" | "ai" = "manual"): Promise<QaRun> => {
  return withRetry(
    async () => {
      const response = await apiFetch(`${API_URL}/plugin/qa/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suiteId, mode }),
      });
      if (!response.ok) {
        throw await parseError(response);
      }
      const payload = (await response.json()) as { data?: QaRun };
      if (!payload.data) {
        throw new Error("Run response shape mismatch");
      }
      return payload.data;
    },
    { maxRetries: 1 } // Conservative retry for POST operations
  );
};

export const fetchQaRunDetail = async (runId: string): Promise<QaRunDetail> => {
  return withRetry(async () => {
    const response = await apiFetch(`${API_URL}/plugin/qa/runs/${encodeURIComponent(runId)}`);
    if (!response.ok) {
      throw await parseError(response);
    }
    const payload = (await response.json()) as { data?: QaRunDetail };
    if (!payload.data) {
      throw new Error("Run detail response shape mismatch");
    }
    return payload.data;
  });
};

export const fetchRunCollaborators = async (runId: string): Promise<QaRunCollaborator[]> => {
  return withRetry(async () => {
    const response = await apiFetch(`${API_URL}/plugin/qa/runs/${encodeURIComponent(runId)}/collaborators`);
    if (!response.ok) {
      throw await parseError(response);
    }
    const payload = (await response.json()) as { data?: QaRunCollaborator[] };
    return Array.isArray(payload.data) ? payload.data : [];
  });
};

export const addRunCollaborator = async (runId: string, name: string): Promise<QaRunCollaborator> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/runs/${encodeURIComponent(runId)}/collaborators`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaRunCollaborator };
  if (!payload.data) {
    throw new Error("Collaborator response shape mismatch");
  }
  return payload.data;
};

export const removeRunCollaborator = async (runId: string, collaboratorId: string): Promise<void> => {
  const response = await apiFetch(
    `${API_URL}/plugin/qa/runs/${encodeURIComponent(runId)}/collaborators/${encodeURIComponent(collaboratorId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw await parseError(response);
  }
};

export const fetchCaseComments = async (runId: string, caseId: string): Promise<QaCaseComment[]> => {
  return withRetry(async () => {
    const response = await apiFetch(
      `${API_URL}/plugin/qa/runs/${encodeURIComponent(runId)}/cases/${encodeURIComponent(caseId)}/comments`,
    );
    if (!response.ok) {
      throw await parseError(response);
    }
    const payload = (await response.json()) as { data?: QaCaseComment[] };
    return Array.isArray(payload.data) ? payload.data : [];
  });
};

export const addCaseComment = async (
  runId: string,
  caseId: string,
  input: { author: string; message: string },
): Promise<QaCaseComment> => {
  const response = await apiFetch(
    `${API_URL}/plugin/qa/runs/${encodeURIComponent(runId)}/cases/${encodeURIComponent(caseId)}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaCaseComment };
  if (!payload.data) {
    throw new Error("Comment response shape mismatch");
  }
  return payload.data;
};

export const deleteCaseComment = async (runId: string, caseId: string, commentId: string): Promise<void> => {
  const response = await apiFetch(
    `${API_URL}/plugin/qa/runs/${encodeURIComponent(runId)}/cases/${encodeURIComponent(caseId)}/comments/${encodeURIComponent(commentId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw await parseError(response);
  }
};

export const createRunShare = async (runId: string): Promise<{ shareId: string; shareUrl: string }> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/runs/${encodeURIComponent(runId)}/share`, {
    method: "POST",
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: { shareId?: string; shareUrl?: string } };
  if (!payload.data?.shareId || !payload.data?.shareUrl) {
    throw new Error("Share response shape mismatch");
  }
  return { shareId: payload.data.shareId, shareUrl: payload.data.shareUrl };
};

export const fetchRunShare = async (shareId: string): Promise<QaRunSharePayload> => {
  return withRetry(async () => {
    const response = await apiFetch(`${API_URL}/plugin/qa/runs/share/${encodeURIComponent(shareId)}`);
    if (!response.ok) {
      throw await parseError(response);
    }
    const payload = (await response.json()) as { data?: QaRunSharePayload };
    if (!payload.data) {
      throw new Error("Share payload response shape mismatch");
    }
    return payload.data;
  });
};

export const createGithubIssue = async (input: QaGithubIssueRequest): Promise<QaGithubIssueResponse> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/integrations/github/issues`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaGithubIssueResponse };
  if (!payload.data) {
    throw new Error("GitHub issue response shape mismatch");
  }
  return payload.data;
};

export const fetchQaRunReport = async (
  runId: string,
  format: "json" | "markdown" | "html" = "json",
): Promise<{ format: "json" | "markdown" | "html"; report: QaManualRunReport; markdown?: string; html?: string }> => {
  return withRetry(async () => {
    const response = await apiFetch(
      `${API_URL}/plugin/qa/runs/${encodeURIComponent(runId)}/report?format=${encodeURIComponent(format)}`,
    );
    if (!response.ok) {
      throw await parseError(response);
    }
    const payload = (await response.json()) as {
      data?: { format?: unknown; report?: QaManualRunReport; markdown?: unknown; html?: unknown };
    };
    if (!payload.data?.report) {
      throw new Error("Run report response shape mismatch");
    }
    const resolvedFormat =
      payload.data.format === "markdown" ? "markdown" : payload.data.format === "html" ? "html" : "json";
    return {
      format: resolvedFormat,
      report: payload.data.report,
      markdown: typeof payload.data.markdown === "string" ? payload.data.markdown : undefined,
      html: typeof payload.data.html === "string" ? payload.data.html : undefined,
    };
  });
};

export const triggerQaRunReportWebhook = async (
  runId: string,
): Promise<{ delivered: boolean; event: string; runId: string; generatedAt: string }> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/runs/${encodeURIComponent(runId)}/report/webhook`, {
    method: "POST",
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as {
    data?: { delivered?: unknown; event?: unknown; runId?: unknown; generatedAt?: unknown };
  };
  return {
    delivered: payload.data?.delivered === true,
    event: safeText(payload.data?.event),
    runId: safeText(payload.data?.runId),
    generatedAt: safeText(payload.data?.generatedAt),
  };
};

export const fetchQaRuns = async (input?: {
  limit?: number;
  suiteId?: string;
  status?: QaCaseStatus;
  mode?: "manual" | "ai";
}): Promise<QaRun[]> => {
  const params = new URLSearchParams();
  if (input?.limit) {
    params.set("limit", String(input.limit));
  }
  if (input?.suiteId) {
    params.set("suiteId", input.suiteId);
  }
  if (input?.status) {
    params.set("status", input.status);
  }
  if (input?.mode) {
    params.set("mode", input.mode);
  }
  const query = params.toString();
  return withRetry(async () => {
    const response = await apiFetch(`${API_URL}/plugin/qa/runs${query ? `?${query}` : ""}`);
    if (!response.ok) {
      throw await parseError(response);
    }
    const payload = (await response.json()) as { data?: QaRun[] };
    return Array.isArray(payload.data) ? payload.data : [];
  });
};

export const updateQaStepCheck = async (
  runId: string,
  caseId: string,
  stepId: string,
  checked: boolean,
): Promise<QaStepRunCheck> => {
  const response = await apiFetch(
    `${API_URL}/plugin/qa/runs/${encodeURIComponent(runId)}/cases/${encodeURIComponent(caseId)}/steps/${encodeURIComponent(stepId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checked }),
    },
  );
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaStepRunCheck };
  if (!payload.data) {
    throw new Error("Step update response shape mismatch");
  }
  return payload.data;
};

export const updateQaCaseResult = async (
  runId: string,
  caseId: string,
  input: { status?: QaCaseStatus; notes?: string; failureReason?: string; testerName?: string; markDone?: boolean },
): Promise<void> => {
  return withRetry(async () => {
    const response = await apiFetch(
      `${API_URL}/plugin/qa/runs/${encodeURIComponent(runId)}/cases/${encodeURIComponent(caseId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    if (!response.ok) {
      throw await parseError(response);
    }
  });
};

export const addQaCaseEvidence = async (
  runId: string,
  caseId: string,
  input: { type: string; label: string; ref: string },
): Promise<void> => {
  const response = await apiFetch(
    `${API_URL}/plugin/qa/runs/${encodeURIComponent(runId)}/cases/${encodeURIComponent(caseId)}/evidence`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) {
    throw await parseError(response);
  }
};

export const finalizeQaRun = async (runId: string, input?: { testerName?: string; notes?: string }): Promise<QaRun> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/runs/${encodeURIComponent(runId)}/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {}),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaRun };
  if (!payload.data) {
    throw new Error("Finalize run response shape mismatch");
  }
  return payload.data;
};

export const createQaGenerationJob = async (input: {
  prompt: string;
  testTypes?: QaTestType[];
  context?: { pluginIds?: string[]; routes?: string[] };
}): Promise<QaGenerationJob> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaGenerationJob };
  if (!payload.data) {
    throw new Error("Generation job response shape mismatch");
  }
  return payload.data;
};

export const createQaGeneratedTestsJob = async (input: {
  prompt: string;
  testTypes: QaTestType[];
  context?: { pluginIds?: string[]; routes?: string[] };
}): Promise<QaGenerationJob> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/generate/tests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaGenerationJob };
  if (!payload.data) {
    throw new Error("Generate tests response shape mismatch");
  }
  return payload.data;
};

export const loadQaExistingTests = async (input: {
  testTypes: QaTestType[];
  tags?: string[];
  testDir?: string;
}): Promise<QaGenerationJob> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/tests/load-existing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "playwright",
      testTypes: input.testTypes,
      tags: input.tags ?? [],
      testDir: input.testDir,
    }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaGenerationJob };
  if (!payload.data) {
    throw new Error("Load existing tests response shape mismatch");
  }
  return payload.data;
};

export const runQaIntelligentReview = async (input: {
  generationJobId: string;
  maxSuggestions?: number;
}): Promise<QaGenerationJob> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/tests/review-intelligent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaGenerationJob };
  if (!payload.data) {
    throw new Error("Intelligent review response shape mismatch");
  }
  return payload.data;
};

export const generateQaFixProposals = async (input: {
  generationJobId: string;
  maxProposals?: number;
}): Promise<QaGenerationJob> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/tests/suggest-fixes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaGenerationJob };
  if (!payload.data) {
    throw new Error("Fix proposals response shape mismatch");
  }
  return payload.data;
};

export const applyQaFixProposal = async (input: {
  generationJobId: string;
  proposalId: string;
}): Promise<QaGenerationJob> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/tests/apply-fix`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaGenerationJob };
  if (!payload.data) {
    throw new Error("Apply fix response shape mismatch");
  }
  return payload.data;
};

export const retestQaFixProposal = async (input: {
  generationJobId: string;
  proposalId: string;
}): Promise<QaGenerationJob> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/tests/retest-fix`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaGenerationJob };
  if (!payload.data) {
    throw new Error("Retest fix response shape mismatch");
  }
  return payload.data;
};

export const runQaAutomation = async (input: {
  generationJobId: string;
  strategy: QaAutomationStrategy;
  maxIterations?: number;
}): Promise<QaGenerationJob> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/tests/automation/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaGenerationJob };
  if (!payload.data) {
    throw new Error("Automation run response shape mismatch");
  }
  return payload.data;
};

export const fetchQaGenerationJob = async (jobId: string): Promise<QaGenerationJob> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/generate/${encodeURIComponent(jobId)}`);
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaGenerationJob };
  if (!payload.data) {
    throw new Error("Generation job detail response shape mismatch");
  }
  return payload.data;
};

export const fetchQaGenerationHistory = async (limit = 10): Promise<QaGenerationJob[]> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/generate?limit=${limit}`);
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaGenerationJob[] };
  return payload.data ?? [];
};

export const fetchQaGenerationStatus = async (): Promise<QaGenerationStatus> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/generate/status`);
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaGenerationStatus };
  if (!payload.data) {
    throw new Error("Generation status response shape mismatch");
  }
  return payload.data;
};

export const fetchQaWorkspaces = async (): Promise<QaWorkspaceProfile[]> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/workspaces`);
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaWorkspaceProfile[] };
  return payload.data ?? [];
};

export const saveQaWorkspace = async (input: {
  id?: string;
  label: string;
  casesDir: string;
  gitUrl?: string;
}): Promise<QaWorkspaceProfile[]> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaWorkspaceProfile[] };
  return payload.data ?? [];
};

export const deleteQaWorkspace = async (id: string): Promise<QaWorkspaceProfile[]> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/workspaces/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaWorkspaceProfile[] };
  return payload.data ?? [];
};

export const syncQaWorkspace = async (id: string): Promise<void> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/workspaces/${encodeURIComponent(id)}/sync`, {
    method: "POST",
  });
  if (!response.ok) {
    throw await parseError(response);
  }
};

export const loadQaGeneratedTests = async (input: {
  generationJobId: string;
  runId?: string;
}): Promise<QaTestsLoadResult> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/tests/load`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaTestsLoadResult };
  if (!payload.data) {
    throw new Error("Tests load response shape mismatch");
  }
  return payload.data;
};

export const prepareQaAiRun = async (input: {
  runId: string;
  generationJobId: string;
  testTypes: QaTestType[];
}): Promise<QaAiPrepareResult> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/runs/${encodeURIComponent(input.runId)}/ai/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      generationJobId: input.generationJobId,
      testTypes: input.testTypes,
    }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaAiPrepareResult };
  if (!payload.data) {
    throw new Error("AI prepare response shape mismatch");
  }
  return payload.data;
};

export const executeQaAiRun = async (input: {
  runId: string;
  executionJobId?: string;
}): Promise<QaAiExecuteResult> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/runs/${encodeURIComponent(input.runId)}/ai/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      executionJobId: input.executionJobId,
    }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaAiExecuteResult };
  if (!payload.data) {
    throw new Error("AI execute response shape mismatch");
  }
  return payload.data;
};

export const fetchQaAiExecutionStatus = async (input: {
  runId: string;
  executionJobId: string;
}): Promise<QaAiExecutionStatus> => {
  const response = await apiFetch(
    `${API_URL}/plugin/qa/runs/${encodeURIComponent(input.runId)}/ai/executions/${encodeURIComponent(input.executionJobId)}`,
  );
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaAiExecutionStatus };
  if (!payload.data) {
    throw new Error("AI execution status response shape mismatch");
  }
  return payload.data;
};

export const importQaPlaywrightArtifacts = async (
  input: {
    runId: string;
    executionJobId?: string;
    status?: "queued" | "running" | "completed" | "failed" | "cancelled";
    playwrightCommand?: string;
    reportRef?: string;
    traceRef?: string;
    videoRef?: string;
    error?: string;
    startedAt?: string;
    completedAt?: string;
  },
): Promise<QaAiExecutionStatus> => {
  const response = await apiFetch(`${API_URL}/plugin/qa/runs/${encodeURIComponent(input.runId)}/playwright/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      executionJobId: input.executionJobId,
      status: input.status,
      playwrightCommand: input.playwrightCommand,
      reportRef: input.reportRef,
      traceRef: input.traceRef,
      videoRef: input.videoRef,
      error: input.error,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
    }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaAiExecutionStatus };
  if (!payload.data) {
    throw new Error("Playwright import response shape mismatch");
  }
  return payload.data;
};

export const fetchQaPlaywrightArtifacts = async (input: {
  runId: string;
  executionJobId?: string;
}): Promise<QaPlaywrightArtifacts> => {
  const query = input.executionJobId
    ? `?executionJobId=${encodeURIComponent(input.executionJobId)}`
    : "";
  const response = await apiFetch(
    `${API_URL}/plugin/qa/runs/${encodeURIComponent(input.runId)}/playwright/artifacts${query}`,
  );
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as { data?: QaPlaywrightArtifacts };
  if (!payload.data) {
    throw new Error("Playwright artifacts response shape mismatch");
  }
  return payload.data;
};

// Export utility functions for testing
export { parseError, parseJson, safeText, isFromCache, withRetry };
