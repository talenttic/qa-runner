import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOfflineSupport } from "../hooks/useOfflineSupport";

// Mock navigator.onLine
const mockNavigator = {
  onLine: true,
};

Object.defineProperty(navigator, "onLine", {
  get: () => mockNavigator.onLine,
  configurable: true,
});

// Mock service worker registration
const mockServiceWorker = {
  register: vi.fn().mockResolvedValue({
    addEventListener: vi.fn(),
    active: { state: "activated" },
  }),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

Object.defineProperty(navigator, "serviceWorker", {
  value: mockServiceWorker,
  configurable: true,
});

describe("useOfflineSupport", () => {
  let events: { [key: string]: EventListener[] } = {};

  beforeEach(() => {
    events = {};
    mockNavigator.onLine = true;

    // Mock addEventListener/removeEventListener
    global.addEventListener = vi.fn((event, listener) => {
      if (!events[event]) events[event] = [];
      events[event].push(listener as EventListener);
    });

    global.removeEventListener = vi.fn((event, listener) => {
      if (events[event]) {
        const index = events[event].indexOf(listener as EventListener);
        if (index > -1) events[event].splice(index, 1);
      }
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns initial online state", () => {
    const { result } = renderHook(() => useOfflineSupport());

    expect(result.current.isOnline).toBe(true);
    expect(result.current.isServiceWorkerRegistered).toBe(false);
    expect(result.current.lastSyncTime).toBeUndefined();
  });

  it("updates online state when navigator.onLine changes", () => {
    const { result } = renderHook(() => useOfflineSupport());

    act(() => {
      mockNavigator.onLine = false;
      // Simulate online/offline events
      events["offline"]?.forEach(listener => listener(new Event("offline")));
    });

    expect(result.current.isOnline).toBe(false);
  });

  it("registers service worker on mount", async () => {
    await act(async () => {
      renderHook(() => useOfflineSupport());
    });

    await vi.waitFor(() => {
      expect(mockServiceWorker.register).toHaveBeenCalledWith(
        "/sw.js",
        expect.objectContaining({ scope: "/" }),
      );
    });
  });

  it("handles service worker registration failure gracefully", () => {
    mockServiceWorker.register.mockRejectedValueOnce(new Error("Registration failed"));

    const { result } = renderHook(() => useOfflineSupport());

    // Should not crash and should still work
    expect(result.current.isOnline).toBe(true);
  });

  it("updates service worker registration status", async () => {
    const { result } = renderHook(() => useOfflineSupport());

    await vi.waitFor(() => {
      expect(result.current.isServiceWorkerRegistered).toBe(true);
    });
  });

  it("cleans up event listeners on unmount", () => {
    const { unmount } = renderHook(() => useOfflineSupport());

    unmount();

    expect(global.removeEventListener).toHaveBeenCalledWith("online", expect.any(Function));
    expect(global.removeEventListener).toHaveBeenCalledWith("offline", expect.any(Function));
  });
});