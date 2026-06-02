import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { config } from "../config/config.js";

let defaultTopic;
let loggerInstance;
let clientSetup = false;

let snsClient;

export const isClientSetup = () => clientSetup;

export const setupClient = (
  logger,
  {
    region = config.get("aws.region"),
    awsEndpointUrl = config.get("aws.endpointUrl"),
    publishToTopic = config.get("aws.sns.configVersionTopicArn"),
  } = {},
) => {
  snsClient = new SNSClient({
    region,
    endpoint: awsEndpointUrl,
  });
  loggerInstance = logger;
  defaultTopic = publishToTopic;
  clientSetup = true;
};

export const publishMessage = async (
  data,
  messageAttributes = {},
  topic = defaultTopic,
) => {
  if (!clientSetup) {
    throw new Error(
      "SNS client not setup. Call setupClient() before publishing messages.",
    );
  }
  loggerInstance.info(`Publish command ${topic}`);
  await snsClient.send(
    new PublishCommand({
      TopicArn: topic,
      Message: JSON.stringify(data),
      MessageAttributes: convertMessageAttributes(messageAttributes),
    }),
  );
};

/* Converts a simple key-value object into the format required by SNS for message attributes.
  Note only supports string values currently
 Example input: { key1: "value1", key2: "value2" }
 Example output: {
   key1: { DataType: "String", StringValue: "value1" },
   key2: { DataType: "String", StringValue: "value2" }
 }
*/
const convertMessageAttributes = (attributes) => {
  const convertedAttributes = {};
  for (const key in attributes) {
    convertedAttributes[key] = {
      DataType: "String",
      StringValue: attributes[key],
    };
  }
  return convertedAttributes;
};
