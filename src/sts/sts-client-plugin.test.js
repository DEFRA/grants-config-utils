import { stsClientPlugin } from "./sts-client-plugin.js";
import { STSClient } from "@aws-sdk/client-sts";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@aws-sdk/client-sts", () => {
  return {
    STSClient: vi.fn().mockImplementation(function () {
      this.destroy = vi.fn();
      return this;
    }),
  };
});

describe("stsClientPlugin", () => {
  let server;

  beforeEach(() => {
    vi.clearAllMocks();

    server = {
      decorate: vi.fn(),
      events: {
        on: vi.fn(),
      },
      logger: {
        info: vi.fn(),
      },
    };
  });

  it("should have correct name and version", () => {
    expect(stsClientPlugin.plugin.name).toBe("sts-client");
    expect(stsClientPlugin.plugin.version).toBe("1.0.0");
  });

  it("should register the plugin and decorate server and request", () => {
    stsClientPlugin.plugin.register(server);

    expect(STSClient).toHaveBeenCalled();
    const mockStsInstance = vi.mocked(STSClient).mock.results[0].value;
    expect(server.decorate).toHaveBeenCalledWith(
      "server",
      "sts",
      mockStsInstance,
    );
    expect(server.decorate).toHaveBeenCalledWith(
      "request",
      "sts",
      expect.any(Function),
      { apply: true },
    );

    const decorateRequestFn = server.decorate.mock.calls.find(
      (call) => call[0] === "request",
    )[2];
    expect(decorateRequestFn()).toBe(mockStsInstance);
  });

  it("should handle server stop event", () => {
    let stopHandler;
    server.events.on.mockImplementation((event, handler) => {
      if (event === "stop") {
        stopHandler = handler;
      }
    });
    stsClientPlugin.plugin.register(server);
    expect(server.events.on).toHaveBeenCalledWith("stop", expect.any(Function));
    expect(stopHandler).toBeDefined();

    stopHandler();

    const mockStsInstance = vi.mocked(STSClient).mock.results[0].value;
    expect(server.logger.info).toHaveBeenCalledWith("Closing AWS SDK clients");
    expect(mockStsInstance.destroy).toHaveBeenCalled();
  });
});
