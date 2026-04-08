import { describe, it, expect, vi, beforeEach } from "vitest";
import { isFromCache, withRetry, parseError, parseJson, safeText } from "../qa/api";

describe("API Utilities", () => {
  describe("isFromCache", () => {
    it("returns true when sw-cache header is 'true'", () => {
      const mockResponse = {
        headers: {
          get: vi.fn().mockReturnValue("true"),
        },
        status: 200,
      } as unknown as Response;

      expect(isFromCache(mockResponse)).toBe(true);
    });

    it("returns true when status is 503", () => {
      const mockResponse = {
        headers: {
          get: vi.fn().mockReturnValue(null),
        },
        status: 503,
      } as unknown as Response;

      expect(isFromCache(mockResponse)).toBe(true);
    });

    it("returns false for normal responses", () => {
      const mockResponse = {
        headers: {
          get: vi.fn().mockReturnValue(null),
        },
        status: 200,
      } as unknown as Response;

      expect(isFromCache(mockResponse)).toBe(false);
    });
  });

  describe("safeText", () => {
    it("returns string values unchanged", () => {
      expect(safeText("hello")).toBe("hello");
      expect(safeText("")).toBe("");
    });

    it("returns empty string for non-string values", () => {
      expect(safeText(123)).toBe("");
      expect(safeText(null)).toBe("");
      expect(safeText(undefined)).toBe("");
      expect(safeText({})).toBe("");
      expect(safeText([])).toBe("");
    });
  });

  describe("parseError", () => {
    it("parses JSON error responses", async () => {
      const mockResponse = {
        status: 400,
        text: vi.fn().mockResolvedValue('{"error": "Bad Request"}'),
      } as unknown as Response;

      const error = await parseError(mockResponse);
      expect(error.message).toBe("Bad Request");
    });

    it("falls back to default message for non-JSON responses", async () => {
      const mockResponse = {
        status: 500,
        text: vi.fn().mockResolvedValue("Internal Server Error"),
        url: "http://example.com",
      } as unknown as Response;

      const error = await parseError(mockResponse);
      expect(error.message).toBe("Request failed (500): Internal Server Error");
    });

    it("handles text parsing errors gracefully", async () => {
      const mockResponse = {
        status: 404,
        text: vi.fn().mockRejectedValue(new Error("Network error")),
      } as unknown as Response;

      const error = await parseError(mockResponse);
      expect(error.message).toBe("Request failed (404)");
    });
  });

  describe("parseJson", () => {
    it("parses valid JSON responses", async () => {
      const mockResponse = {
        json: vi.fn().mockResolvedValue({ success: true }),
        url: "http://example.com",
        status: 200,
      } as unknown as Response;

      const result = await parseJson<{ success: boolean }>(mockResponse);
      expect(result).toEqual({ success: true });
    });

    it("throws error for invalid JSON", async () => {
      const mockResponse = {
        json: vi.fn().mockRejectedValue(new Error("Invalid JSON")),
        text: vi.fn().mockResolvedValue("not json"),
        url: "http://example.com",
        status: 200,
      } as unknown as Response;

      await expect(parseJson(mockResponse)).rejects.toThrow(
        "Invalid JSON response from http://example.com (200): not json"
      );
    });
  });

  describe("withRetry", () => {
    it("returns result on successful operation", async () => {
      const operation = vi.fn().mockResolvedValue("success");

      const result = await withRetry(operation);

      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("retries on failure and eventually succeeds", async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce("success");

      const result = await withRetry(operation, { maxRetries: 1, baseDelay: 10 });

      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it("throws error after max retries", async () => {
      const operation = vi.fn().mockRejectedValue(new Error("Network error"));

      await expect(withRetry(operation, { 
        maxRetries: 2, 
        baseDelay: 10,
        retryCondition: () => true // Always retry for this test
      })).rejects.toThrow("Network error");

      expect(operation).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it("respects retry condition", async () => {
      const operation = vi.fn().mockRejectedValue(new Error("Custom error"));
      const retryCondition = vi.fn().mockReturnValue(false);

      await expect(
        withRetry(operation, { maxRetries: 1, retryCondition })
      ).rejects.toThrow("Custom error");

      expect(operation).toHaveBeenCalledTimes(1); // no retries
      expect(retryCondition).toHaveBeenCalledWith(expect.any(Error));
    });

    it("uses exponential backoff", async () => {
      const operation = vi.fn().mockRejectedValue(new Error("Network error"));
      const delays: number[] = [];

      // Mock setTimeout to capture delays
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = vi.fn((callback, delay) => {
        delays.push(delay as number);
        // Call immediately for testing
        callback();
        return {} as any;
      }) as any;

      const promise = withRetry(operation, {
        maxRetries: 2,
        baseDelay: 100,
        maxDelay: 1000
      });

      try {
        await promise;
      } catch {
        // Expected to fail
      }

      // Should have delays close to 100ms, then 200ms (allowing for jitter)
      expect(delays[0]).toBeGreaterThan(95);
      expect(delays[0]).toBeLessThan(115); // 100ms + 10% jitter
      expect(delays[1]).toBeGreaterThan(190);
      expect(delays[1]).toBeLessThan(230); // 200ms + 10% jitter

      global.setTimeout = originalSetTimeout;
    });
  });
});