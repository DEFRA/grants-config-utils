import { config } from "../config/config.js";
import { createS3Client } from "./s3-client.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";

let s3client;

const bucketName = config.get("aws.s3.bucketName");

const initialiseClient = () => {
  if (!s3client) {
    s3client = createS3Client({
      region: config.get("aws.region"),
      endpoint: config.get("aws.endpointUrl"),
      forcePathStyle: config.get("aws.s3.forcePathStyle"),
    });
  }
  return s3client;
};

export const uploadBlob = async (logger, filename, contents) => {
  const client = initialiseClient();

  const params = {
    Bucket: bucketName,
    Key: filename,
    Body: contents,
  };

  const result = await client.send(new PutObjectCommand(params));
  logger.info(`Uploaded document: ${filename}, ETag: ${result.ETag}`);

  return result;
};

export const getBucketName = () => bucketName;
