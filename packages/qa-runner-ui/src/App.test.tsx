import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";

// Mock the useOfflineSupport hook
vi.mock("./hooks/useOfflineSupport", () => ({
  useOfflineSupport: () => ({
    isOnline: true,
    isServiceWorkerRegistered: false,
    lastSyncTime: null,
  }),
}));

// Mock the ManualTestingPage component
vi.mock("./pages/ManualTestingPage", () => ({
  default: () => <div data-testid="manual-testing-page">Manual Testing Page</div>,
}));

// Mock the OnboardingModal
vi.mock("./components/OnboardingModal", () => ({
  OnboardingModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="onboarding-modal">
      <button onClick={onClose} data-testid="close-onboarding">
        Close
      </button>
    </div>
  ),
  useOnboarding: () => ({
    showOnboarding: false,
    closeOnboarding: vi.fn(),
  }),
}));

const renderApp = () => {
  return render(<App />);
};

describe("App", () => {
  beforeEach(() => {
    // Reset localStorage mock
    vi.clearAllMocks();
    localStorage.getItem.mockReturnValue(null);
    localStorage.setItem.mockImplementation(() => {});
  });

  it("renders without crashing", async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getByTestId("manual-testing-page")).toBeInTheDocument();
    });
  });

  it("displays skip to main content link", () => {
    renderApp();
    const skipLink = screen.getByText("Skip to main content");
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute("href", "#qa-main-content");
  });

  it("toggles theme when theme button is clicked", async () => {
    renderApp();

    const themeButton = screen.getByLabelText("Toggle color mode");
    expect(themeButton).toBeInTheDocument();

    // Initially should show "Dark Mode" (since we're in light mode)
    expect(themeButton).toHaveTextContent("Dark Mode");

    // Click to toggle to dark mode
    fireEvent.click(themeButton);

    await waitFor(() => {
      expect(localStorage.setItem).toHaveBeenCalledWith("qa-runner:theme", "dark");
    });

    // Should now show "Light Mode"
    expect(themeButton).toHaveTextContent("Light Mode");
  });

  it("loads saved theme from localStorage", () => {
    localStorage.getItem.mockReturnValue("dark");

    renderApp();

    const themeButton = screen.getByLabelText("Toggle color mode");
    expect(themeButton).toHaveTextContent("Light Mode");
  });

  it("shows help button with correct link", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null as any);

    renderApp();

    const helpButton = await screen.findByLabelText("Help and documentation");
    expect(helpButton).toBeInTheDocument();

    fireEvent.click(helpButton);
    expect(openSpy).toHaveBeenCalledWith("https://github.com/your-org/qa-runner#readme", "_blank");

    openSpy.mockRestore();
  });

  it("displays footer with version and documentation link", () => {
    renderApp();

    expect(screen.getByText("QA Runner UI - Version 0.1.0")).toBeInTheDocument();
    const docsLink = screen.getByText("documentation");
    expect(docsLink).toBeInTheDocument();
    expect(docsLink).toHaveAttribute("href", "https://github.com/your-org/qa-runner");
  });

  it("handles system theme preference when no saved theme", () => {
    // Mock system preference for dark mode
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: query === "(prefers-color-scheme: dark)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    renderApp();

    const themeButton = screen.getByLabelText("Toggle color mode");
    expect(themeButton).toHaveTextContent("Light Mode");
  });
});