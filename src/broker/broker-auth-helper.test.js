import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAuthenticatedHeaders } from "./broker-auth-helper.js";
import { generateToken } from "../sts/grants-config-broker-token.js";

vi.mock("../sts/grants-config-broker-token.js", () => ({
  generateToken: vi.fn(),
}));

describe("Broker Auth Helper", () => {
  let mockStsClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStsClient = {
      send: vi.fn(),
    };
  });

  describe("createAuthenticatedHeaders", () => {
    it("should add Authorization header with Bearer token from generateToken", async () => {
      const mockToken = "mock-sts-token";
      vi.mocked(generateToken).mockResolvedValue(mockToken);
      const baseHeaders = { "Content-Type": "application/json" };

      const headers = await createAuthenticatedHeaders(
        { sts: mockStsClient },
        baseHeaders,
      );

      expect(generateToken).toHaveBeenCalledWith(mockStsClient);
      expect(headers).toEqual({
        "Content-Type": "application/json",
        Authorization: "Bearer mock-sts-token",
      });
    });

    it("should work with empty base headers", async () => {
      const mockToken = "mock-sts-token";
      vi.mocked(generateToken).mockResolvedValue(mockToken);

      const headers = await createAuthenticatedHeaders({ sts: mockStsClient });

      expect(headers).toEqual({
        Authorization: "Bearer mock-sts-token",
      });
    });

    it("should not mutate original base headers object", async () => {
      vi.mocked(generateToken).mockResolvedValue("token");
      const baseHeaders = { "Content-Type": "application/json" };

      const headers = await createAuthenticatedHeaders(
        { sts: mockStsClient },
        baseHeaders,
      );

      expect(headers).not.toBe(baseHeaders);
      expect(baseHeaders).toEqual({ "Content-Type": "application/json" });
      expect(baseHeaders.Authorization).toBeUndefined();
    });

    it("should preserve all base headers", async () => {
      vi.mocked(generateToken).mockResolvedValue("token");
      const baseHeaders = {
        "Content-Type": "application/json",
        "User-Agent": "test-agent",
        "X-Custom-Header": "custom-value",
      };

      const headers = await createAuthenticatedHeaders(
        { sts: mockStsClient },
        baseHeaders,
      );

      expect(headers).toHaveProperty("Content-Type", "application/json");
      expect(headers).toHaveProperty("User-Agent", "test-agent");
      expect(headers).toHaveProperty("X-Custom-Header", "custom-value");
      expect(headers).toHaveProperty("Authorization", "Bearer token");
    });
  });
});
