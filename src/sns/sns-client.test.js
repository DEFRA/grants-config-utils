import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { isClientSetup, publishMessage, setupClient } from "./sns-client.js";
import { config } from "../config/config.js";

vi.mock("./metrics.js");
vi.mock("@aws-sdk/client-sns", () => ({
  SNSClient: vi.fn(),
  PublishCommand: vi.fn(),
}));

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
};

const topicArn = "arn:aws:sns:us-east-1:123456789012:MyTopic";

describe("publish", () => {
  it("error thrown if client not set up", async () => {
    const message = {
      key: "value",
    };

    const send = vi.fn();

    SNSClient.mockReturnValue({
      send,
    });

    expect(isClientSetup()).toBe(false);

    await expect(publishMessage(message)).rejects.toThrow(
      "SNS client not setup. Call setupClient() before publishing messages.",
    );

    expect(PublishCommand).toHaveBeenCalledTimes(0);

    expect(send).toHaveBeenCalledTimes(0);
  });

  it("publishes a message to a topic", async () => {
    const message = {
      key: "value",
    };

    const send = vi.fn();

    SNSClient.mockImplementation(function () {
      return { send };
    });

    PublishCommand.mockImplementation(function (params) {
      return params;
    });
    setupClient(mockLogger, {
      region: "us-east-1",
      awsEndpointUrl: "http://localhost:4566",
      publishToTopic: topicArn,
    });

    expect(isClientSetup()).toBe(true);

    await publishMessage(message);

    expect(PublishCommand).toHaveBeenCalledWith({
      TopicArn: topicArn,
      Message: '{"key":"value"}',
      MessageAttributes: {},
    });

    expect(send).toHaveBeenCalledWith({
      TopicArn: topicArn,
      Message: '{"key":"value"}',
      MessageAttributes: {},
    });
  });

  it("publishes a message including custom message attribute", async () => {
    const message = {
      key: "value",
    };

    const send = vi.fn();

    SNSClient.mockImplementation(function () {
      return { send };
    });

    PublishCommand.mockImplementation(function (params) {
      return params;
    });
    setupClient(mockLogger, {
      region: "us-east-1",
      awsEndpointUrl: "http://localhost:4566",
    });

    await publishMessage(
      message,
      { customAttribute: "customValue" },
      "specialTopicArn",
    );

    expect(PublishCommand).toHaveBeenCalledWith({
      TopicArn: "specialTopicArn",
      Message: '{"key":"value"}',
      MessageAttributes: {
        customAttribute: {
          DataType: "String",
          StringValue: "customValue",
        },
      },
    });

    expect(send).toHaveBeenCalledWith({
      TopicArn: "specialTopicArn",
      Message: '{"key":"value"}',
      MessageAttributes: {
        customAttribute: {
          DataType: "String",
          StringValue: "customValue",
        },
      },
    });
  });

  it("sets up client with defaults if config object is not supplied", async () => {
    const send = vi.fn();
    SNSClient.mockImplementation(function () {
      return { send };
    });

    config.set("aws.region", "eu-west-1");
    config.set("aws.endpointUrl", "http://localhost:4566");
    config.set("aws.sns.configVersionTopicArn", "default-topic-arn");

    setupClient(mockLogger);

    expect(SNSClient).toHaveBeenCalledWith(
      expect.objectContaining({
        region: "eu-west-1",
        endpoint: "http://localhost:4566",
      }),
    );

    const message = { key: "value" };
    await publishMessage(message);

    expect(PublishCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        TopicArn: "default-topic-arn",
      }),
    );
  });
});
