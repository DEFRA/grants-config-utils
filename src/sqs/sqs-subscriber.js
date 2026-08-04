import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { setTimeout } from "node:timers/promises";
import { withTraceParent } from "./trace-parent.js";
const DEFAULT_POLL_TIMEOUT_MS = 30000;

export class SqsSubscriber {
  constructor(options) {
    this.queueUrl = options.queueUrl;
    this.onMessage = options.onMessage;
    this.logger = options.logger;
    this.isRunning = false;
    this.timeoutOnPollErrorMs =
      options.timeoutOnErrorMs || DEFAULT_POLL_TIMEOUT_MS;

    this.sqsClient = new SQSClient({
      region: options.region,
      endpoint: options.awsEndpointUrl,
    });
  }

  async start() {
    this.isRunning = true;
    await this.poll();
  }

  async stop() {
    this.isRunning = false;
  }

  async poll() {
    this.logger.info(`Started polling SQS queue: ${this.queueUrl}`);

    while (this.isRunning) {
      try {
        const messages = await this.getMessages();
        await Promise.all(messages.map((m) => this.processMessage(m)));
      } catch (err) {
        this.logger.error(
          `Error polling SQS queue ${this.queueUrl}: ${err.message}`,
        );
        await setTimeout(this.timeoutOnPollErrorMs);
      }
    }

    this.logger.info(`Stopped polling SQS queue: ${this.queueUrl}`);
  }

  async processMessage(message) {
    this.logger.info(`Processing SQS message ${message.MessageId}`);

    try {
      const body = JSON.parse(message.Body);
      await withTraceParent(body.traceparent, () =>
        this.onMessage(
          body,
          this.extractMessageAttributes(message),
          message.Attributes.SentTimestamp,
        ),
      );
      await this.deleteMessage(message);
    } catch (error) {
      this.logger.error(
        { error },
        `Error processing SQS message ${message.MessageId}`,
      );
    }
  }

  async getMessages() {
    const response = await this.sqsClient.send(
      new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 20,
        AttributeNames: ["All"],
        MessageAttributeNames: ["All"],
      }),
    );

    return response.Messages || [];
  }

  async sendMessage(message) {
    // we could pass in attributes and send them on, but we don't need them yet
    const params = {
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(message),
    };
    await this.sqsClient.send(new SendMessageCommand(params));
  }

  async deleteMessage(message) {
    await this.sqsClient.send(
      new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: message.ReceiptHandle,
      }),
    );
  }

  extractMessageAttributes(message) {
    const attributes = {};
    for (const key in message.MessageAttributes) {
      if (Object.hasOwn(message.MessageAttributes, key)) {
        const attr = message.MessageAttributes[key];
        if (attr.DataType === "String" || attr.DataType === "Number") {
          attributes[key] = attr.StringValue;
        } else if (attr.DataType === "String.Array") {
          attributes[key] = JSON.parse(attr.StringValue);
        } else {
          attributes[key] = attr.BinaryValue;
        }
      }
    }
    return attributes;
  }
}
