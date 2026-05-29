import { getBucketName, listFiles, uploadBlob } from "./s3-interactions.js";
import { createS3Client } from "./s3-client.js";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";

vi.mock("./s3-client.js");

const bucketName = "configs-bucket";

describe("s3-interactions", () => {
  const mockS3Client = { send: vi.fn() };
  const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  beforeEach(() => {
    createS3Client.mockReturnValueOnce(mockS3Client);
  });

  afterEach(() => {
    vi.clearAllMocks();
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
            Bucket: bucketName,
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
            Bucket: bucketName,
            Key: key,
            Body: body,
          },
        }),
      );
      expect(result).toEqual(mockPutObjectResponse);
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Uploaded document: ${key}, ETag: ${mockPutObjectResponse.ETag}`,
      );
    });

    it("should throw an error if the upload fails", async () => {
      const key = "test-key";
      const body = "test-data";

      const mockError = new Error("Upload failed");
      mockS3Client.send.mockRejectedValueOnce(mockError);
      createS3Client.mockReturnValueOnce(mockS3Client);

      mockS3Client.send.mockRejectedValueOnce(mockError);

      await expect(uploadBlob(mockLogger, key, body)).rejects.toThrow(
        "Upload failed",
      );

      expect(createS3Client).not.toHaveBeenCalled();
      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Bucket: bucketName,
            Key: key,
            Body: body,
          },
        }),
      );
    });
  });

  describe("getBucketName", () => {
    it("should return the bucket name", async () => {
      const result = getBucketName();
      expect(result).toEqual("configs-bucket");
    });
  });
});
