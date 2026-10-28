import { readFileSync, existsSync, lstatSync, readdirSync } from "node:fs";
import YAML from "yaml";
import { config } from "../config/config.js";
import { listFiles, uploadBlob } from "../s3/s3-interactions.js";
import {
  isClientSetup,
  publishMessage,
  setupClient,
} from "../sns/sns-client.js";

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
    const contents = updateContentsWithInternalData(
      localPath,
      readFileSync(localPath, "utf8"),
    );
    await uploadBlob(logger, s3Path, contents);
  }

  logger.info(
    `successfully uploaded '${allConfigFiles.length}' files across '${configsAtServiceVersion.length}' configs`,
  );
};

const updateContentsWithInternalData = (localPath, contents) => {
  // allowlist file
  if (localPath.endsWith("allowlist.yaml")) {
    const devSBIs = (config.get("allowlist.devSBIs") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const testSBIs = (config.get("allowlist.testSBIs") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const perfTestSBIs = (config.get("allowlist.perfTestSBIs") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const extTestSBIs = (config.get("allowlist.extTestSBIs") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const prodSBIs = (config.get("allowlist.prodSBIs") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const allowlist = YAML.parse(contents);

    if (devSBIs.length > 0) {
      allowlist["dev"].sbis = devSBIs;
    }
    if (testSBIs.length > 0) {
      allowlist["test"].sbis = testSBIs;
    }
    if (perfTestSBIs.length > 0) {
      allowlist["perf-test"].sbis = perfTestSBIs;
    }
    if (extTestSBIs.length > 0) {
      allowlist["ext-test"].sbis = extTestSBIs;
    }
    if (prodSBIs.length > 0) {
      allowlist["prod"].sbis = prodSBIs;
    }

    return YAML.stringify(allowlist);
  }

  // no internal data to add, return original contents
  return contents;
};

const notifyConfigBrokerServiceVersionAvailable = async (
  configsAtServiceVersion,
  logger,
) => {
  const configSNSTopic = config.get("aws.sns.configVersionTopicArn");
  const configPublishStatus = config.get("configPublish.status");
  const configPublishUser = config.get("configPublish.user");

  // iterate each grant configuration, notify config available at current service version
  for (const configAtServiceVersion of configsAtServiceVersion) {
    await sendConfigMessageToBroker(
      configSNSTopic,
      configAtServiceVersion,
      configPublishStatus,
      configPublishUser,
      logger,
    );
  }
};

const sendConfigMessageToBroker = async (
  configSNSTopic,
  configAtServiceVersion,
  configPublishStatus,
  configPublishUser,
  logger,
) => {
  const { grant, version, files } = configAtServiceVersion;
  // files is an array of tuples, we only want the S3 paths here
  const s3Paths = files.map(([_, s3Path]) => s3Path);

  const payload = {
    grant,
    version,
    files: s3Paths,
    status: configPublishStatus,
    user: configPublishUser,
  };

  if (setToUseSNS(configSNSTopic)) {
    await sendViaSNS(payload, configSNSTopic, logger);
  } else {
    logger.error(`config SNS topic not set, so cannot release config`);
  }
};

const sendViaSNS = async (payload, configSNSTopic, logger) => {
  if (!isClientSetup()) {
    setupClient(logger.child({}), {
      region: config.get("aws.region"),
      endpoint: config.get("aws.endpointUrl"),
      publishToTopic: config.get("aws.sns.configVersionTopicArn"),
    });
  }

  await publishMessage(payload);

  logger.info(
    `successfully notified the config broker about '${payload.grant}' at version '${payload.version}' via SNS`,
  );
};

const setToUseSNS = (configSNSTopic) => {
  return (
    configSNSTopic &&
    configSNSTopic !== config.default("aws.sns.configVersionTopicArn")
  );
};
