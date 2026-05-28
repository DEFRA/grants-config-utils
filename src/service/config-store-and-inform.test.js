import { storeConfigVersionAndInformBroker } from "./config-store-and-inform.js";
import { readFileSync, existsSync, lstatSync, readdirSync } from "node:fs";
import { uploadBlob } from "../s3/s3-interactions.js";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  lstatSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(() => "file-content"),
}));

vi.mock("../config/config.js", () => ({
  config: {
    get: (key) => {
      const values = {
        serviceVersion: "1.2.3",
        serviceName: "grants-config-playground",
        "configBroker.apiEndpoint": "https://broker.unit.test",
      };
      return values[key];
    },
  },
}));

vi.mock("../s3/s3-interactions.js", () => ({
  uploadBlob: vi.fn(),
}));

vi.mock("../broker/broker-auth-helper.js", () => ({
  createApiHeadersForConfigBroker: vi.fn(() => ({
    authorization: "Bearer token",
  })),
}));

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe("storeConfigVersionAndInformBroker", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          json: vi.fn().mockResolvedValue({}),
        }),
      ),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should exit early when configurations directory does not exist or not a directory", async () => {
    existsSync.mockReturnValue(true);
    lstatSync.mockReturnValue({ isDirectory: () => false });

    await expect(
      storeConfigVersionAndInformBroker(mockLogger),
    ).resolves.not.toThrow();

    expect(mockLogger.warn).toHaveBeenCalledWith(
      "config folder 'configurations' not found, so performing the file upload",
    );
    expect(readFileSync).not.toHaveBeenCalled();
    expect(uploadBlob).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.skip("should still inform config broker but skip storing when already exists", async () => {
    // TODO BH implement in next PR
  });

  it("should store config and inform config broker", async () => {
    existsSync.mockReturnValue(true);
    lstatSync.mockReturnValue({ isDirectory: () => true });
    readdirSync
      .mockReturnValueOnce([{ name: "grant-1", isDirectory: () => true }])
      .mockReturnValueOnce([
        {
          name: "main.json",
          isFile: () => true,
          parentPath: "configurations/grant-1",
        },
      ]);

    await storeConfigVersionAndInformBroker(mockLogger);

    expect(mockLogger.info).toHaveBeenCalledWith(
      "uploading 'grant-1/1.2.3/main.json' to S3",
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      "successfully uploaded '1' files across '1' configs",
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      "successfully notified the config broker about 'grant-1' at version '1.2.3'",
    );
    expect(readFileSync).toHaveBeenCalledTimes(1);
    expect(uploadBlob).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("should call config broker for each config (subdirectory) found in configurations folder", async () => {
    existsSync.mockReturnValue(true);
    lstatSync.mockReturnValue({ isDirectory: () => true });
    readdirSync
      .mockReturnValueOnce([
        { name: "grant-1", isDirectory: () => true },
        { name: "grant-2", isDirectory: () => true },
      ])
      .mockReturnValueOnce([
        {
          name: "main.json",
          isFile: () => true,
          parentPath: "configurations/grant-1",
        },
        {
          name: "submain.json",
          isFile: () => true,
          parentPath: "configurations/grant-1",
        },
      ])
      .mockReturnValueOnce([
        {
          name: "main.json",
          isFile: () => true,
          parentPath: "configurations/grant-2",
        },
      ]);

    await storeConfigVersionAndInformBroker(mockLogger);

    expect(mockLogger.info).toHaveBeenCalledWith(
      "uploading 'grant-1/1.2.3/main.json' to S3",
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      "uploading 'grant-1/1.2.3/submain.json' to S3",
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      "uploading 'grant-2/1.2.3/main.json' to S3",
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      "successfully uploaded '3' files across '2' configs",
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      "successfully notified the config broker about 'grant-1' at version '1.2.3'",
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      "successfully notified the config broker about 'grant-2' at version '1.2.3'",
    );
    expect(readFileSync).toHaveBeenCalledTimes(3);
    expect(uploadBlob).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.skip("should check storage for each config (subdirectory) found in configurations folder", async () => {
    // TODO BH implement in next PR
  });
});
