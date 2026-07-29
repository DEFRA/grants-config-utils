import { describe, it, expect, vi, beforeEach } from "vitest";
import { GetWebIdentityTokenCommand } from "@aws-sdk/client-sts";
import { generateToken } from "./grants-config-broker-token.js";

vi.mock("@aws-sdk/client-sts", () => {
  return {
    GetWebIdentityTokenCommand: vi.fn(),
  };
});

describe("grants-config-broker-token", () => {
  let stsClient;

  beforeEach(() => {
    vi.clearAllMocks();
    stsClient = {
      send: vi.fn(),
    };
  });

  it("should generate a token successfully", async () => {
    const mockToken = "mock-web-identity-token";
    stsClient.send.mockResolvedValue({ WebIdentityToken: mockToken });

    const token = await generateToken(stsClient);

    expect(token).toBe(mockToken);
    expect(GetWebIdentityTokenCommand).toHaveBeenCalledWith({
      SigningAlgorithm: "RS256",
      Audience: ["grants-config-broker"],
      DurationSeconds: 60,
    });
    expect(stsClient.send).toHaveBeenCalledWith(
      expect.any(GetWebIdentityTokenCommand),
    );
  });

  it("should throw an error if stsClient.send fails", async () => {
    const mockError = new Error("STS Error");
    stsClient.send.mockRejectedValue(mockError);

    await expect(generateToken(stsClient)).rejects.toThrow("STS Error");
  });
});
