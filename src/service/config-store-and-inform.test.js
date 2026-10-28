import { storeConfigVersionAndInformBroker } from "./config-store-and-inform.js";
import { readFileSync, existsSync, lstatSync, readdirSync } from "node:fs";
import YAML from "yaml";
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
    config.set("configPublish.user", "tom_the_cat");
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
        user: "tom_the_cat",
      });
    });

    it("should not store or inform when already published by config broker", async () => {
      listFiles.mockReturnValueOnce([{ Contents: ["fake-content-1"] }]);

      await storeConfigVersionAndInformBroker(mockLogger);

      expect(listFiles).toHaveBeenCalledTimes(1);
      expect(readFileSync).not.toHaveBeenCalled();
      expect(uploadBlob).not.toHaveBeenCalled();
      expect(publishMessage).not.toHaveBeenCalled();
    });

    it("should stop and print error if no mechanism setup to contact config-broker", async () => {
      config.set(
        "aws.sns.configVersionTopicArn",
        config.default("aws.sns.configVersionTopicArn"),
      );

      await storeConfigVersionAndInformBroker(mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "config SNS topic not set, so cannot release config",
      );

      expect(listFiles).toHaveBeenCalledTimes(1);
      expect(isClientSetup).not.toHaveBeenCalled();
      expect(setupClient).not.toHaveBeenCalled();
      expect(publishMessage).not.toHaveBeenCalled();
    });

    it("should call config broker for each config (subdirectory) found in configurations folder", async () => {
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
        "successfully notified the config broker about 'grant-1' at version '1.2.3' via SNS",
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        "successfully notified the config broker about 'grant-2' at version '1.2.3' via SNS",
      );
      expect(listFiles).toHaveBeenCalledTimes(2);
      expect(readFileSync).toHaveBeenCalledTimes(3);
      expect(uploadBlob).toHaveBeenCalledTimes(3);
      expect(publishMessage).toHaveBeenCalledTimes(2);
    });

    it("should special-case allowlist.yaml files by adding all internal only data (SBIs)", async () => {
      const initialYaml =
        "dev:\n  sbis: []\ntest:\n  sbis: []\nperf-test:\n  sbis: []\next-test:\n  sbis: []\nprod:\n  sbis: []\n";

      config.set("allowlist.devSBIs", "1, 2");
      config.set("allowlist.testSBIs", "3, 4");
      config.set("allowlist.perfTestSBIs", "5, 6");
      config.set("allowlist.extTestSBIs", "7, 8");
      config.set("allowlist.prodSBIs", "9, 10");

      readFileSync.mockReturnValueOnce(initialYaml);
      readdirSync.mockRestore();
      readdirSync
        .mockReturnValueOnce([{ name: "grant-1", isDirectory: () => true }])
        .mockReturnValueOnce([
          {
            name: "allowlist.yaml",
            isFile: () => true,
            parentPath: "configurations/grant-1",
          },
        ]);

      await storeConfigVersionAndInformBroker(mockLogger);

      expect(uploadBlob).toHaveBeenCalledWith(
        mockLogger,
        "grant-1/1.2.3/allowlist.yaml",
        expect.any(String),
      );

      const uploadedContent = uploadBlob.mock.calls[0][2];
      const parsedContent = YAML.parse(uploadedContent);

      expect(parsedContent["dev"].sbis).toEqual(["1", "2"]);
      expect(parsedContent["test"].sbis).toEqual(["3", "4"]);
      expect(parsedContent["perf-test"].sbis).toEqual(["5", "6"]);
      expect(parsedContent["ext-test"].sbis).toEqual(["7", "8"]);
      expect(parsedContent["prod"].sbis).toEqual(["9", "10"]);
    });

    it("should not modify non-allowlist files", async () => {
      const content = "some: content";
      readFileSync.mockReturnValueOnce(content);

      readdirSync.mockRestore();
      readdirSync
        .mockReturnValueOnce([{ name: "grant-1", isDirectory: () => true }])
        .mockReturnValueOnce([
          {
            name: "other.yaml",
            isFile: () => true,
            parentPath: "configurations/grant-1",
          },
        ]);

      await storeConfigVersionAndInformBroker(mockLogger);

      const uploadedContent = uploadBlob.mock.calls[0][2];
      expect(uploadedContent).toBe(content);
    });

    it("should handle empty or malformed SBI configuration gracefully", async () => {
      const initialYaml =
        "dev:\n  sbis: []\ntest:\n  sbis: []\nperf-test:\n  sbis: []\next-test:\n  sbis: []\nprod:\n  sbis: []\n";
      config.set("allowlist.devSBIs", " , 123, , 456 "); // should filter empty and trim
      config.set("allowlist.testSBIs", ""); // should skip
      config.set("allowlist.perfTestSBIs", null); // should skip
      config.set("allowlist.extTestSBIs", undefined); // should skip
      config.set("allowlist.prodSBIs", "   "); // should skip

      readFileSync.mockReturnValueOnce(initialYaml);
      readdirSync.mockRestore();
      readdirSync
        .mockReturnValueOnce([{ name: "grant-1", isDirectory: () => true }])
        .mockReturnValueOnce([
          {
            name: "allowlist.yaml",
            isFile: () => true,
            parentPath: "configurations/grant-1",
          },
        ]);

      await storeConfigVersionAndInformBroker(mockLogger);

      const uploadedContent = uploadBlob.mock.calls[0][2];
      const parsedContent = YAML.parse(uploadedContent);
      expect(parsedContent["dev"].sbis).toEqual(["123", "456"]);
      expect(parsedContent["test"].sbis).toEqual([]);
    });

    it("should handle missing sections in allowlist.yaml by throwing error", async () => {
      const initialYaml = "dev:\n  sbis: []\n";
      // test section is missing in initialYaml
      config.set("allowlist.testSBIs", "123");

      readFileSync.mockReturnValueOnce(initialYaml);
      readdirSync.mockRestore();
      readdirSync
        .mockReturnValueOnce([{ name: "grant-1", isDirectory: () => true }])
        .mockReturnValueOnce([
          {
            name: "allowlist.yaml",
            isFile: () => true,
            parentPath: "configurations/grant-1",
          },
        ]);

      await expect(
        storeConfigVersionAndInformBroker(mockLogger),
      ).rejects.toThrow();
    });
  });
});
