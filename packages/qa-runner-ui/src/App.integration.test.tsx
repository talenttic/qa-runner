import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";
import { __setOfflineSupportState } from "./hooks/useOfflineSupport";
import { __setManualTestingPage } from "./pages/ManualTestingPage";

// Mock all dependencies
vi.mock("./hooks/useOfflineSupport", () => {
  let state = {
    isOnline: true,
    isServiceWorkerRegistered: true,
    lastSyncTime: new Date("2024-01-01T12:00:00Z"),
  };

  return {
    useOfflineSupport: () => state,
    __setOfflineSupportState: (nextState: typeof state) => {
      state = nextState;
    },
  };
});

vi.mock("./pages/ManualTestingPage", () => {
  let Page = () => <div data-testid="manual-testing-page">Manual Testing Page</div>;

  return {
    default: () => Page(),
    __setManualTestingPage: (nextPage: typeof Page) => {
      Page = nextPage;
    },
  };
});

vi.mock("./components/OnboardingModal", () => ({
  OnboardingModal: vi.fn(() => null),
  useOnboarding: () => ({
    showOnboarding: false,
    closeOnboarding: vi.fn(),
  }),
}));

describe("App Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    __setOfflineSupportState({
      isOnline: true,
      isServiceWorkerRegistered: true,
      lastSyncTime: new Date("2024-01-01T12:00:00Z"),
    });
    __setManualTestingPage(() => <div data-testid="manual-testing-page">Manual Testing Page</div>);
  });

  it("renders the complete app structure", async () => {
    render(<App />);

    // Check main app elements
    expect(screen.getByText("Skip to main content")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("manual-testing-page")).toBeInTheDocument();
    });
    expect(screen.getByText("QA Runner UI - Version 0.1.0")).toBeInTheDocument();
  });

  it("shows offline indicator when offline", async () => {
    __setOfflineSupportState({
      isOnline: false,
      isServiceWorkerRegistered: false,
      lastSyncTime: null,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Offline")).toBeInTheDocument();
    });
  });

  it("shows cached indicator when service worker is registered", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Cached")).toBeInTheDocument();
      expect(screen.getByText("12:00:00 PM")).toBeInTheDocument();
    });
  });

  it("persists theme preference", async () => {
    render(<App />);

    const themeButton = await screen.findByLabelText("Toggle color mode");

    // Click to change theme
    fireEvent.click(themeButton);

    await waitFor(() => {
      expect(localStorage.setItem).toHaveBeenCalledWith("qa-runner:theme", "dark");
    });
  });

  it("loads saved theme on mount", async () => {
    localStorage.getItem.mockReturnValue("dark");

    render(<App />);

    const themeButton = await screen.findByLabelText("Toggle color mode");
    expect(themeButton).toHaveTextContent("Light Mode");
  });

  it("provides help and documentation links", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null as any);

    render(<App />);

    const helpButton = await screen.findByLabelText("Help and documentation");
    expect(helpButton).toBeInTheDocument();

    fireEvent.click(helpButton);
    expect(openSpy).toHaveBeenCalledWith("https://github.com/your-org/qa-runner#readme", "_blank");

    const docsLink = screen.getByText("documentation");
    expect(docsLink).toHaveAttribute("href", "https://github.com/your-org/qa-runner");

    openSpy.mockRestore();
  });

  it("handles error boundary", async () => {
    // Mock a component that throws an error
    __setManualTestingPage(() => {
      throw new Error("Test error");
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("QA Runner UI crashed")).toBeInTheDocument();
      expect(screen.getByText("Test error")).toBeInTheDocument();
    });
  });
});