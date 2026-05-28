import { getBucketName, uploadBlob } from "./s3-interactions.js";
import { createS3Client } from "./s3-client.js";

vi.mock("./s3-client.js");

const bucketName = "configs-bucket";

describe("s3-interactions", () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  beforeEach(() => {
    createS3Client.mockReturnValueOnce(mockS3Client);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const mockPutObjectResponse = { ETag: '"mock-etag"' };
  const mockS3Client = {
    send: vi.fn(() => Promise.resolve(mockPutObjectResponse)),
  };

  describe("uploadBlob", () => {
    it("should upload a blob to the S3 bucket with specified key", async () => {
      const key = "test-key";
      const body = "test-data";

      const result = await uploadBlob(mockLogger, key, body);

      expect(createS3Client).toHaveBeenCalledTimes(1);
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
