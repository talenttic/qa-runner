import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { ManualTestingPage } from "../pages/ManualTestingPage";

// Mock all the API functions
vi.mock("../qa/api", () => ({
  fetchQaSuites: vi.fn().mockResolvedValue({
    data: [
      {
        id: "suite-1",
        name: "Test Suite",
        description: "A test suite",
        status: "active",
        version: 1,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
    ],
  }),
  createQaRun: vi.fn().mockResolvedValue({ id: "run-1" }),
  fetchQaRunDetail: vi.fn().mockResolvedValue({
    id: "run-1",
    run: {
      id: "run-1",
      suiteId: "suite-1",
      mode: "manual",
      executedByUserId: "tester-1",
      status: "in_progress",
      notes: "",
      testedBy: null,
      startedAt: "2024-01-01T00:00:00Z",
      completedAt: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    },
    suite: {
      id: "suite-1",
      name: "Test Suite",
      description: "A test suite",
      status: "active",
      version: 1,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    },
    suiteId: "suite-1",
    status: "in_progress",
    cases: [
      {
        id: "case-1",
        suiteId: "suite-1",
        title: "Test Case 1",
        useCase: "Test scenario",
        expectedResult: "Expected outcome",
        priority: "medium",
        tags: [],
        playwrightMap: {},
        orderIndex: 1,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        result: {
          id: "result-1",
          runId: "run-1",
          caseId: "case-1",
          status: "not_started",
          notes: "",
          failureReason: null,
          testedBy: null,
          completedAt: null,
          evidence: [],
          updatedByUserId: null,
          updatedAt: "2024-01-01T00:00:00Z",
        },
        steps: [
          {
            id: "step-1",
            caseId: "case-1",
            text: "Click button",
            expectedStepResult: null,
            orderIndex: 1,
            check: {
              id: "check-1",
              runId: "run-1",
              caseId: "case-1",
              stepId: "step-1",
              checked: false,
              autoChecked: false,
              failureReason: null,
              updatedByUserId: null,
              updatedAt: "2024-01-01T00:00:00Z",
            },
          },
        ],
      },
    ],
  }),
  updateQaStepCheck: vi.fn().mockResolvedValue({}),
  updateQaCaseResult: vi.fn().mockResolvedValue({}),
}));

// Mock the useOfflineSupport hook
const mockUseOfflineSupport = vi.fn(() => ({
  isOnline: true,
  isServiceWorkerRegistered: false,
  lastSyncTime: null,
}));

vi.mock("../hooks/useOfflineSupport", () => ({
  useOfflineSupport: () => mockUseOfflineSupport(),
}));

const renderManualTestingPage = () => {
  return render(
    <BrowserRouter>
      <ManualTestingPage />
    </BrowserRouter>
  );
};

describe("ManualTestingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", async () => {
    renderManualTestingPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /QA Runner/i })).toBeInTheDocument();
    });
  });

  it("loads and displays suites", async () => {
    renderManualTestingPage();

    await waitFor(() => {
      expect(screen.getByText("Test Suite")).toBeInTheDocument();
    });
  });

  it("starts a run when Start Run button is clicked", async () => {
    renderManualTestingPage();

    await waitFor(() => {
      expect(screen.getByText("Test Suite")).toBeInTheDocument();
    });

    const startButton = screen.getByTestId("qa-start-run");
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(screen.getByText("Test Case 1")).toBeInTheDocument();
    });
  });

  it("displays case details when case is selected", async () => {
    renderManualTestingPage();

    // Start a run first
    await waitFor(() => {
      expect(screen.getByText("Test Suite")).toBeInTheDocument();
    });

    const startButton = screen.getByTestId("qa-start-run");
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(screen.getByText("Test Case 1")).toBeInTheDocument();
    });

    // Click on the case
    const caseButton = screen.getByTestId("qa-case-case-1");
    fireEvent.click(caseButton);

    await waitFor(() => {
      expect(screen.getByText("Test scenario")).toBeInTheDocument();
      expect(screen.getByText("Expected outcome")).toBeInTheDocument();
    });
  });

  it("allows toggling step checkboxes", async () => {
    renderManualTestingPage();

    // Start a run and select case
    await waitFor(() => {
      expect(screen.getByText("Test Suite")).toBeInTheDocument();
    });

    const startButton = screen.getByTestId("qa-start-run");
    fireEvent.click(startButton);

    await waitFor(() => {
      const caseButton = screen.getByTestId("qa-case-case-1");
      fireEvent.click(caseButton);
    });

    await waitFor(() => {
      const stepCheckbox = screen.getByTestId("qa-step-step-1");
      expect(stepCheckbox).not.toBeChecked();

      fireEvent.click(stepCheckbox);
      expect(stepCheckbox).toBeChecked();
    });
  });

  it("shows search functionality", async () => {
    renderManualTestingPage();

    await waitFor(() => {
      const searchInput = screen.getByPlaceholderText(/Search suites/i);
      expect(searchInput).toBeInTheDocument();
    });
  });

  it("shows case filter options", async () => {
    renderManualTestingPage();

    // Start a run first
    await waitFor(() => {
      expect(screen.getByText("Test Suite")).toBeInTheDocument();
    });

    const startButton = screen.getByTestId("qa-start-run");
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(screen.getByText("Test Case 1")).toBeInTheDocument();
    });

    // Should show filter status
    expect(screen.getByText(/Showing 1 of 1/)).toBeInTheDocument();
  });

  it("handles offline state", async () => {
    // Mock offline state
    mockUseOfflineSupport.mockReturnValueOnce({
      isOnline: false,
      isServiceWorkerRegistered: false,
      lastSyncTime: null,
    });

    renderManualTestingPage();

    await waitFor(() => {
      expect(screen.getByText("Offline")).toBeInTheDocument();
    });
  });
});