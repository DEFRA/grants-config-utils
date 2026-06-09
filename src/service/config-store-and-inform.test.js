import { storeConfigVersionAndInformBroker } from "./config-store-and-inform.js";
import { readFileSync, existsSync, lstatSync, readdirSync } from "node:fs";
import { listFiles, uploadBlob } from "../s3/s3-interactions.js";
import {
  isClientSetup,
  publishMessage,
  setupClient,
} from "../sns/sns-client.js";
import { config } from "../config/config.js";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  lstatSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(() => "file-content"),
}));

vi.mock("../s3/s3-interactions.js", () => ({
  listFiles: vi.fn(() => []),
  uploadBlob: vi.fn(),
}));

vi.mock("../broker/broker-auth-helper.js", () => ({
  createApiHeadersForConfigBroker: vi.fn(() => ({
    authorization: "Bearer token",
  })),
}));

vi.mock("../sns/sns-client.js");

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => mockLogger),
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

    config.set("serviceVersion", "1.2.3");
    config.set("serviceName", "grants-config-playground");
    config.set("configBroker.apiEndpoint", "https://broker.unit.test");
    config.set("configPublish.status", "active");
    config.set(
      "aws.sns.configVersionTopicArn",
      "arn:aws:sns:us-east-1:123456789012:config-version-topic",
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
    expect(listFiles).not.toHaveBeenCalled();
    expect(readFileSync).not.toHaveBeenCalled();
    expect(uploadBlob).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  describe("when configurations exist", () => {
    beforeEach(() => {
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
    });

    it("should store config and inform config broker via REST API if SNS not setup", async () => {
      //reset topic to default, should indicate not setup
      config.set(
        "aws.sns.configVersionTopicArn",
        config.default("aws.sns.configVersionTopicArn"),
      );
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
      expect(listFiles).toHaveBeenCalledTimes(1);
      expect(readFileSync).toHaveBeenCalledTimes(1);
      expect(uploadBlob).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        "https://broker.unit.test/api/release-config",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            authorization: "Bearer token",
          },
          body: JSON.stringify({
            grant: "grant-1",
            version: "1.2.3",
            files: ["grant-1/1.2.3/main.json"],
            status: "active",
          }),
        },
      );
    });

    it("should store config and inform config broker via SNS if setup", async () => {
      await storeConfigVersionAndInformBroker(mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "uploading 'grant-1/1.2.3/main.json' to S3",
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        "successfully uploaded '1' files across '1' configs",
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        "successfully notified the config broker about 'grant-1' at version '1.2.3' via SNS",
      );
      expect(listFiles).toHaveBeenCalledTimes(1);
      expect(readFileSync).toHaveBeenCalledTimes(1);
      expect(uploadBlob).toHaveBeenCalledTimes(1);
      expect(isClientSetup).toHaveBeenCalledTimes(1);
      expect(setupClient).toHaveBeenCalledTimes(1);
      expect(publishMessage).toHaveBeenCalledWith({
        grant: "grant-1",
        version: "1.2.3",
        files: ["grant-1/1.2.3/main.json"],
        status: "active",
      });
    });

    it("should not store or inform when already published by config broker", async () => {
      listFiles.mockReturnValueOnce([{ Contents: ["fake-content-1"] }]);

      await storeConfigVersionAndInformBroker(mockLogger);

      expect(listFiles).toHaveBeenCalledTimes(1);
      expect(readFileSync).not.toHaveBeenCalled();
      expect(uploadBlob).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    });

    it("should stop and print warning if no mechanism setup to contact config-broker", async () => {
      config.set(
        "aws.sns.configVersionTopicArn",
        config.default("aws.sns.configVersionTopicArn"),
      );
      config.set("configBroker.apiEndpoint", "");

      await storeConfigVersionAndInformBroker(mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "config SNS topic not set, and config broker endpoint not set, so skipping release config call",
      );

      expect(listFiles).toHaveBeenCalledTimes(1);
      expect(fetch).not.toHaveBeenCalled();
      expect(isClientSetup).not.toHaveBeenCalled();
      expect(setupClient).not.toHaveBeenCalled();
      expect(publishMessage).not.toHaveBeenCalled();
    });

    it("should call config broker for each config (subdirectory) found in configurations folder", async () => {
      //reset topic to default, should indicate not setup
      config.set(
        "aws.sns.configVersionTopicArn",
        config.default("aws.sns.configVersionTopicArn"),
      );
      readdirSync.mockRestore();
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
      expect(listFiles).toHaveBeenCalledTimes(2);
      expect(readFileSync).toHaveBeenCalledTimes(3);
      expect(uploadBlob).toHaveBeenCalledTimes(3);
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });
});
