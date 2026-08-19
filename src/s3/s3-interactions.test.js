import { createS3Client } from "./s3-client.js";
import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

vi.mock("./s3-client.js");

const defaultBucketName = "configs-bucket";

describe("s3-interactions", () => {
  const mockS3Client = Object.assign(Object.create(S3Client.prototype), {
    send: vi.fn(),
  });
  const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  let initialiseClient, listFiles, listAllFiles, uploadBlob, getBucketName;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    createS3Client.mockReturnValue(mockS3Client);

    const s3Interactions = await import("./s3-interactions.js");
    initialiseClient = s3Interactions.initialiseClient;
    listFiles = s3Interactions.listFiles;
    listAllFiles = s3Interactions.listAllFiles;
    uploadBlob = s3Interactions.uploadBlob;
    getBucketName = s3Interactions.getBucketName;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("initialiseClient", () => {
    it("should initialise S3 client with default config values when no options provided", () => {
      const client = initialiseClient();

      expect(createS3Client).toHaveBeenCalledWith({
        region: "eu-west-2",
        endpoint: null,
        forcePathStyle: true,
      });
      expect(client).toBe(mockS3Client);
      expect(getBucketName()).toBe(defaultBucketName);
    });

    it("should initialise S3 client with default config values when empty object provided", () => {
      const client = initialiseClient({});

      expect(createS3Client).toHaveBeenCalledWith({
        region: "eu-west-2",
        endpoint: null,
        forcePathStyle: true,
      });
      expect(client).toBe(mockS3Client);
      expect(getBucketName()).toBe(defaultBucketName);
    });

    it("should initialise S3 client with custom optional configuration options", () => {
      const customOptions = {
        region: "us-east-1",
        endpoint: "http://localhost:4566",
        forcePathStyle: false,
        bucketNameOverride: "custom-bucket",
      };

      const client = initialiseClient(customOptions);

      expect(createS3Client).toHaveBeenCalledWith({
        region: "us-east-1",
        endpoint: "http://localhost:4566",
        forcePathStyle: false,
      });
      expect(client).toBe(mockS3Client);
      expect(getBucketName()).toBe("custom-bucket");
    });

    it("should fallback omitted options to default config values when partial options provided", () => {
      const partialOptions = {
        region: "ap-southeast-1",
        bucketNameOverride: "my-custom-bucket",
      };

      const client = initialiseClient(partialOptions);

      expect(createS3Client).toHaveBeenCalledWith({
        region: "ap-southeast-1",
        endpoint: null,
        forcePathStyle: true,
      });
      expect(client).toBe(mockS3Client);
      expect(getBucketName()).toBe("my-custom-bucket");
    });

    it("should return the existing client on subsequent calls and not re-initialise", () => {
      const client1 = initialiseClient({
        region: "us-west-2",
        bucketNameOverride: "initial-bucket",
      });

      const client2 = initialiseClient({
        region: "eu-west-1",
        bucketNameOverride: "second-bucket",
      });

      expect(createS3Client).toHaveBeenCalledTimes(1);
      expect(client1).toBe(mockS3Client);
      expect(client2).toBe(mockS3Client);
      expect(getBucketName()).toBe("initial-bucket");
    });
  });

  describe("listFiles", () => {
    it("should list files with a given prefix", async () => {
      const prefix = "test-prefix";
      const mockListResponse = {
        Contents: [
          { Key: "test-prefix/file1.txt" },
          { Key: "test-prefix/file2.txt" },
        ],
      };

      mockS3Client.send.mockResolvedValueOnce(mockListResponse);

      const result = await listFiles(mockLogger, prefix);

      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Bucket: defaultBucketName,
            Prefix: prefix,
          },
        }),
      );

      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(ListObjectsV2Command),
      );
      expect(result).toEqual(mockListResponse.Contents);
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Found 2 files using prefix ${prefix}`,
      );
    });

    it("should list files using custom bucketNameOverride if initialised beforehand", async () => {
      initialiseClient({ bucketNameOverride: "custom-list-bucket" });

      const prefix = "custom-prefix";
      const mockListResponse = {
        Contents: [{ Key: "custom-prefix/doc.json" }],
      };

      mockS3Client.send.mockResolvedValueOnce(mockListResponse);

      const result = await listFiles(mockLogger, prefix);

      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Bucket: "custom-list-bucket",
            Prefix: prefix,
          },
        }),
      );
      expect(result).toEqual(mockListResponse.Contents);
    });

    it("should return an empty array if no files are found", async () => {
      const prefix = "empty-prefix";
      const mockListResponse = {
        Contents: undefined,
      };

      mockS3Client.send.mockResolvedValueOnce(mockListResponse);

      const result = await listFiles(mockLogger, prefix);

      expect(result).toEqual([]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Found 0 files using prefix ${prefix}`,
      );
    });

    it("should throw an error if listing fails", async () => {
      const prefix = "fail-prefix";
      const mockError = new Error("List failed");

      mockS3Client.send.mockRejectedValueOnce(mockError);

      await expect(listFiles(mockLogger, prefix)).rejects.toThrow(
        "List failed",
      );
    });
  });

  describe("listAllFiles", () => {
    it("should list all files in the bucket", async () => {
      const mockListResponse = {
        Contents: [{ Key: "file1.txt" }, { Key: "file2.txt" }],
        IsTruncated: false,
      };

      mockS3Client.send.mockResolvedValueOnce(mockListResponse);

      const result = await listAllFiles(mockLogger);

      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Bucket: defaultBucketName,
          },
        }),
      );
      expect(result).toEqual([{ Key: "file1.txt" }, { Key: "file2.txt" }]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Found 2 files in bucket ${defaultBucketName}`,
      );
    });

    it("should paginate across multiple pages of files", async () => {
      const page1 = {
        Contents: [{ Key: "file1.txt" }],
        IsTruncated: true,
        NextContinuationToken: "token-page-2",
      };
      const page2 = {
        Contents: [{ Key: "file2.txt" }, { Key: "file3.txt" }],
        IsTruncated: false,
      };

      mockS3Client.send
        .mockResolvedValueOnce(page1)
        .mockResolvedValueOnce(page2);

      const result = await listAllFiles(mockLogger);

      expect(mockS3Client.send).toHaveBeenCalledTimes(2);
      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: defaultBucketName,
          }),
        }),
      );
      expect(result).toEqual([
        { Key: "file1.txt" },
        { Key: "file2.txt" },
        { Key: "file3.txt" },
      ]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Found 3 files in bucket ${defaultBucketName}`,
      );
    });

    it("should list all files using custom bucketNameOverride if initialised beforehand", async () => {
      initialiseClient({ bucketNameOverride: "custom-list-all-bucket" });

      const mockListResponse = {
        Contents: [{ Key: "doc.json" }],
        IsTruncated: false,
      };

      mockS3Client.send.mockResolvedValueOnce(mockListResponse);

      const result = await listAllFiles(mockLogger);

      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Bucket: "custom-list-all-bucket",
          },
        }),
      );
      expect(result).toEqual([{ Key: "doc.json" }]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Found 1 files in bucket custom-list-all-bucket",
      );
    });

    it("should return an empty array if bucket has no files", async () => {
      const mockListResponse = {
        Contents: [],
        IsTruncated: false,
      };

      mockS3Client.send.mockResolvedValueOnce(mockListResponse);

      const result = await listAllFiles(mockLogger);

      expect(result).toEqual([]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Found 0 files in bucket ${defaultBucketName}`,
      );
    });

    it("should throw an error if listing fails", async () => {
      const mockError = new Error("List all failed");

      mockS3Client.send.mockRejectedValueOnce(mockError);

      await expect(listAllFiles(mockLogger)).rejects.toThrow("List all failed");
    });
  });

  describe("uploadBlob", () => {
    it("should upload a blob to the S3 bucket with specified key", async () => {
      const key = "test-key";
      const body = "test-data";

      const mockPutObjectResponse = { ETag: '"mock-etag"' };
      mockS3Client.send.mockResolvedValueOnce(mockPutObjectResponse);

      const result = await uploadBlob(mockLogger, key, body);

      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Bucket: defaultBucketName,
            Key: key,
            Body: body,
          },
        }),
      );
      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(PutObjectCommand),
      );
      expect(result).toEqual(mockPutObjectResponse);
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Uploaded document: ${key}, ETag: ${mockPutObjectResponse.ETag}`,
      );
    });

    it("should upload blob using custom bucketNameOverride if initialised beforehand", async () => {
      initialiseClient({ bucketNameOverride: "custom-upload-bucket" });

      const key = "test-custom-key";
      const body = "test-custom-data";

      const mockPutObjectResponse = { ETag: '"custom-etag"' };
      mockS3Client.send.mockResolvedValueOnce(mockPutObjectResponse);

      const result = await uploadBlob(mockLogger, key, body);

      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Bucket: "custom-upload-bucket",
            Key: key,
            Body: body,
          },
        }),
      );
      expect(result).toEqual(mockPutObjectResponse);
    });

    it("should throw an error if the upload fails", async () => {
      const key = "test-key";
      const body = "test-data";

      const mockError = new Error("Upload failed");
      mockS3Client.send.mockRejectedValueOnce(mockError);

      await expect(uploadBlob(mockLogger, key, body)).rejects.toThrow(
        "Upload failed",
      );

      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Bucket: defaultBucketName,
            Key: key,
            Body: body,
          },
        }),
      );
    });
  });

  describe("getBucketName", () => {
    it("should return undefined before initialisation", () => {
      const result = getBucketName();
      expect(result).toBeUndefined();
    });

    it("should return the default bucket name after default initialisation", () => {
      initialiseClient();
      const result = getBucketName();
      expect(result).toEqual("configs-bucket");
    });

    it("should return the overridden bucket name after custom initialisation", () => {
      initialiseClient({ bucketNameOverride: "overridden-bucket-name" });
      const result = getBucketName();
      expect(result).toEqual("overridden-bucket-name");
    });
  });
});
