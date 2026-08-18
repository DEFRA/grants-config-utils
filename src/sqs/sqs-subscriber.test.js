import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { SqsSubscriber } from "./sqs-subscriber.js";

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
};

vi.mock("@aws-sdk/client-sqs");

const timeoutSleepMs = 100;

let consumer;
let onMessage;

beforeEach(async () => {
  onMessage = vi.fn().mockResolvedValue();

  consumer = new SqsSubscriber({
    queueUrl: "https://sqs.eu-west-2.amazonaws.com/123456789012/test-queue",
    onMessage,
    logger: mockLogger,
    region: "eu-west-2",
    awsEndpointUrl: "http://localhost:4566",
    timeoutOnErrorMs: timeoutSleepMs,
  });
});

describe("constructor", () => {
  it("instantiates with options", () => {
    expect(consumer.queueUrl).toBe(
      "https://sqs.eu-west-2.amazonaws.com/123456789012/test-queue",
    );
    expect(consumer.onMessage).toBe(onMessage);
    expect(consumer.isRunning).toBe(false);
    expect(SQSClient).toHaveBeenCalledWith({
      endpoint: "http://localhost:4566",
      region: "eu-west-2",
    });
  });
});

describe("start", () => {
  it("sets isRunning to true and starts polling", async () => {
    consumer.poll = vi.fn().mockResolvedValue();

    await consumer.start();

    expect(consumer.isRunning).toBe(true);
    expect(consumer.poll).toHaveBeenCalled();
  });
});

describe("stop", () => {
  it("sets isRunning to false", async () => {
    consumer.isRunning = true;

    await consumer.stop();

    expect(consumer.isRunning).toBe(false);
  });
});

describe("error on polling", () => {
  it("error when polling waits for timeout period before running again, and logs errors", async () => {
    const timeCaptures = [];
    consumer.sqsClient.send.mockImplementationOnce(() => {
      timeCaptures.push(Date.now());
      throw new Error("Test polling error");
    });

    consumer.sqsClient.send.mockImplementationOnce(() => {
      timeCaptures.push(Date.now());
      consumer.isRunning = false; // stop now
      throw new Error("Test polling error");
    });

    await consumer.start();

    expect(timeCaptures[1] - timeCaptures[0]).toBeGreaterThanOrEqual(
      timeoutSleepMs - 2,
    ); //2ms tolerance
    expect(mockLogger.error).toHaveBeenCalledWith(
      "Error polling SQS queue https://sqs.eu-west-2.amazonaws.com/123456789012/test-queue: Test polling error",
    );
  });
});

describe("message processing", () => {
  it("processes and deletes messages correctly", async () => {
    const mockMessages = [
      {
        MessageId: "msg-1",
        Body: '{ "message" : "Test message 1" }',
        ReceiptHandle: "receipt-1",
        MessageAttributes: {
          Attribute1: {
            StringValue: "Value1",
            DataType: "String",
          },
          Attribute2: {
            StringValue: "1",
            DataType: "Number",
          },
          Attribute3: {
            BinaryValue: new TextEncoder().encode("Value3"),
            DataType: "Binary",
          },
        },
        Attributes: {
          SentTimestamp: "1780599163000",
        },
      },
    ];

    consumer.sqsClient.send.mockImplementation(async (command) => {
      if (command instanceof ReceiveMessageCommand) {
        return { Messages: mockMessages };
      }
      if (command instanceof DeleteMessageCommand) {
        return {};
      }
      return {};
    });

    consumer.onMessage.mockReset();

    consumer.onMessage.mockImplementationOnce(() => {
      consumer.isRunning = false; // just take 1 message
      return Promise.resolve("processed");
    });

    await consumer.start();

    expect(ReceiveMessageCommand).toHaveBeenCalledWith({
      QueueUrl: consumer.queueUrl,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 20,
      AttributeNames: ["All"],
      MessageAttributeNames: ["All"],
    });

    expect(onMessage).toHaveBeenCalledWith(
      { message: "Test message 1" },
      {
        Attribute1: "Value1",
        Attribute2: "1",
        Attribute3: new TextEncoder().encode("Value3"),
        messageId: "msg-1",
      },
      "1780599163000",
    );

    expect(DeleteMessageCommand).toHaveBeenCalledWith({
      QueueUrl: consumer.queueUrl,
      ReceiptHandle: "receipt-1",
    });
  });

  it("handles errors gracefully in processing", async () => {
    const mockMessages = [
      {
        MessageId: "msg-1",
        Body: '{ "message" : "Test message 1" }',
        ReceiptHandle: "receipt-1",
        Attributes: {
          SentTimestamp: "1780599163000",
        },
      },
    ];

    // mock the fetch part to return our test message
    consumer.sqsClient.send.mockImplementation(async (command) => {
      if (command instanceof ReceiveMessageCommand) {
        return { Messages: mockMessages };
      }
      return {};
    });

    consumer.onMessage.mockReset();

    const err = new Error("Test error");

    consumer.onMessage.mockImplementationOnce(() => {
      consumer.isRunning = false; // just take 1 message
      return Promise.reject(err);
    });

    await consumer.start();

    expect(mockLogger.error).toHaveBeenCalledWith(
      { error: err },
      "Error processing SQS message msg-1",
    );
  });
});

describe("sendMessage", () => {
  it("sends a message via client", async () => {
    const mockMessage = {
      grant: "grant-1",
      version: "1.2.3",
    };

    await consumer.sendMessage(mockMessage);

    expect(SendMessageCommand).toHaveBeenCalledWith({
      QueueUrl: consumer.queueUrl,
      MessageBody: '{"grant":"grant-1","version":"1.2.3"}',
    });
    expect(consumer.sqsClient.send).toHaveBeenCalledWith(
      expect.any(SendMessageCommand),
    );
  });
});

describe("deleteMessage", () => {
  it("deletes a message", async () => {
    const mockMessage = {
      MessageId: "msg-1",
      ReceiptHandle: "receipt-1",
    };

    await consumer.deleteMessage(mockMessage);

    expect(DeleteMessageCommand).toHaveBeenCalledWith({
      QueueUrl: consumer.queueUrl,
      ReceiptHandle: "receipt-1",
    });
    expect(consumer.sqsClient.send).toHaveBeenCalled();
  });
});
