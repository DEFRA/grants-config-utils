import { config } from "../config/config.js";
import { createS3Client } from "./s3-client.js";
import {
  ListObjectsV2Command,
  paginateListObjectsV2,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

let s3client;

let bucketName;

export const initialiseClient = ({
  region,
  endpoint,
  forcePathStyle,
  bucketNameOverride,
} = {}) => {
  if (!s3client) {
    s3client = createS3Client({
      region: region ?? config.get("aws.region"),
      endpoint: endpoint ?? config.get("aws.endpointUrl"),
      forcePathStyle: forcePathStyle ?? config.get("aws.s3.forcePathStyle"),
    });
    bucketName = bucketNameOverride ?? config.get("aws.s3.bucketName");
  }

  return s3client;
};

export const listFiles = async (logger, prefix) => {
  const client = initialiseClient();
  const params = {
    Bucket: bucketName,
    Prefix: prefix,
  };

  const result = await client.send(new ListObjectsV2Command(params));
  logger.info(
    `Found ${result.Contents?.length ?? 0} files using prefix ${prefix}`,
  );

  return result.Contents ?? [];
};

export const listAllFiles = async (logger) => {
  const client = initialiseClient();
  const paginator = paginateListObjectsV2(
    { client },
    {
      Bucket: bucketName,
    },
  );

  const objectKeys = [];
  for await (const { Contents } of paginator) {
    objectKeys.push(...Contents.map((obj) => ({ Key: obj.Key })));
  }
  logger.info(`Found ${objectKeys.length ?? 0} files in bucket ${bucketName}`);
  return objectKeys;
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
