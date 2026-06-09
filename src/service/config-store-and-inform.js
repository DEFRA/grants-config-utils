import { readFileSync, existsSync, lstatSync, readdirSync } from "node:fs";
import { config } from "../config/config.js";
import { listFiles, uploadBlob } from "../s3/s3-interactions.js";
import { createApiHeadersForConfigBroker } from "../broker/broker-auth-helper.js";
import { isClientSetup, publishMessage, setupClient } from '../sns/sns-client.js'

const configsDirectory = "configurations";

export const storeConfigVersionAndInformBroker = async (logger) => {
  if (!configsDirectoryExists(logger)) {
    return; // exit early, configurations directory not found
  }

  const configsAtServiceVersion = constructConfigsAtServiceVersion();

  if (await configAlreadyPublished(configsAtServiceVersion, logger)) {
    return; // exit early, broker already published config
  }

  await storeConfigAtServiceVersion(configsAtServiceVersion, logger);

  await notifyConfigBrokerServiceVersionAvailable(
    configsAtServiceVersion,
    logger,
  );
};

const configsDirectoryExists = (logger) => {
  const directoryExists =
    existsSync(configsDirectory) && lstatSync(configsDirectory).isDirectory();

  if (!directoryExists) {
    logger.warn(
      `config folder '${configsDirectory}' not found, so performing the file upload`,
    );
  }

  return directoryExists;
};

const constructConfigsAtServiceVersion = () => {
  const version = config.get("serviceVersion");

  // all top-level directories are considered separate grant configurations
  const configDirs = readdirSync(configsDirectory, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  // iterate each grant configuration, collecting: grant, version and files
  return configDirs.map((grant) => {
    const files = readdirSync(`${configsDirectory}/${grant}`, {
      withFileTypes: true,
      recursive: true,
    })
      .filter((dirent) => dirent.isFile())
      .map((dirent) => {
        const configPath = `${configsDirectory}/${grant}`;

        const direntWithoutConfigPath = dirent.parentPath
          ? `${dirent.parentPath.replace(configPath, "")}/${dirent.name}`
          : `${dirent.name}`;

        const localPath = `${configPath}${direntWithoutConfigPath}`;
        const s3Path = `${grant}/${version}${direntWithoutConfigPath}`;
        return [localPath, s3Path];
      });

    return { grant, version, files };
  });
};

const configAlreadyPublished = async (configsAtServiceVersion, logger) => {
  for (const { grant, version } of configsAtServiceVersion) {
    const files = await listFiles(logger, `${grant}/${version}/metadata.json`);
    if (files.length > 0) {
      logger.warn(
        `grant config '${grant}' at version '${version}' already published, not safe to store`,
      );
      return true;
    }
  }
  return false;
};

const storeConfigAtServiceVersion = async (configsAtServiceVersion, logger) => {
  // upload all files across all grant configurations at once
  const allConfigFiles = configsAtServiceVersion.flatMap(
    (grant) => grant.files,
  );
  for (const [localPath, s3Path] of allConfigFiles) {
    logger.info(`uploading '${s3Path}' to S3`);
    await uploadBlob(logger, s3Path, readFileSync(localPath, "utf8"));
  }

  logger.info(
    `successfully uploaded '${allConfigFiles.length}' files across '${configsAtServiceVersion.length}' configs`,
  );
};

const notifyConfigBrokerServiceVersionAvailable = async (
  configsAtServiceVersion,
  logger,
) => {
  const configBrokerEndpoint = config.get("configBroker.apiEndpoint");
  const configPublishStatus = config.get("configPublish.status");

  // iterate each grant configuration, notify config available at current service version
  for (const configAtServiceVersion of configsAtServiceVersion) {
    await sendConfigMessageToBroker(
      configBrokerEndpoint,
      configAtServiceVersion,
      configPublishStatus,
      logger,
    );
  }
};

const sendConfigMessageToBroker = async (
  configBrokerEndpoint,
  configAtServiceVersion,
  configPublishStatus,
  logger,
) => {
  // TODO BH check service topic set instead
  if (!configBrokerEndpoint?.length) {
    logger.warn(
      `config broker endpoint not set, so skipping release config call`,
    );
    return;
  }

  const { grant, version, files } = configAtServiceVersion;
  // files is an array of tuples, we only want the S3 paths here
  const s3Paths = files.map(([_, s3Path]) => s3Path);

  const payload = {
    grant,
    version,
    files: s3Paths,
    status: configPublishStatus,
  };

  // if (!isClientSetup()) {
  //   setupClient(logger.child({}), {
  //     region: config.get('aws.region'),
  //     endpoint: config.get('aws.endpointUrl'),
  //     publishToTopic: config.get('aws.sns.configUpdateTopicArn')
  //   })
  // }
  //
  // const { manifest, versionMajor, versionMinor, versionPatch, ...rest } =
  //     notifyDetails
  // await publishMessage(manifest, rest)
  const url = new URL(`/api/release-config`, configBrokerEndpoint);
  try {
    const response = await fetch(url.href, {
      method: "POST",
      headers: {
        ...createApiHeadersForConfigBroker(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      logger.info(
        `successfully notified the config broker about '${grant}' at version '${version}'`,
      );
    } else {
      logger.error(
        `call to release config failed with status '${response.status}' and text '${response.statusText}'`,
      );
    }
  } catch (err) {
    logger.error("call to release config failed", err);
  }
};
