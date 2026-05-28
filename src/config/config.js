import convict from "convict";
import convictFormatWithValidator from "convict-format-with-validator";

convict.addFormats(convictFormatWithValidator);

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

export const config = convict({
  serviceVersion: {
    doc: "The service version, this variable is injected into your docker container in CDP environments",
    format: String,
    nullable: true,
    default: null,
    env: "SERVICE_VERSION",
  },
  host: {
    doc: "The IP address to bind",
    format: "ipaddress",
    default: "0.0.0.0",
    env: "HOST",
  },
  port: {
    doc: "The port to bind",
    format: "port",
    default: 3001,
    env: "PORT",
  },
  serviceName: {
    doc: "Api Service Name",
    format: String,
    default: "grants-config-playground",
  },
  cdpEnvironment: {
    doc: 'The CDP environment the app is running in. With the addition of "local" for local development',
    format: [
      "local",
      "infra-dev",
      "management",
      "dev",
      "test",
      "perf-test",
      "ext-test",
      "prod",
    ],
    default: "local",
    env: "ENVIRONMENT",
  },
  log: {
    isEnabled: {
      doc: "Is logging enabled",
      format: Boolean,
      default: !isTest,
      env: "LOG_ENABLED",
    },
    level: {
      doc: "Logging level",
      format: ["fatal", "error", "warn", "info", "debug", "trace", "silent"],
      default: "info",
      env: "LOG_LEVEL",
    },
    format: {
      doc: "Format to output logs in",
      format: ["ecs", "pino-pretty"],
      default: isProduction ? "ecs" : "pino-pretty",
      env: "LOG_FORMAT",
    },
    redact: {
      doc: "Log paths to redact",
      format: Array,
      default: isProduction
        ? ["req.headers.authorization", "req.headers.cookie", "res.headers"]
        : ["req", "res", "responseTime"],
    },
  },
  httpProxy: {
    doc: "HTTP Proxy URL",
    format: String,
    nullable: true,
    default: null,
    env: "HTTP_PROXY",
  },
  tracing: {
    header: {
      doc: "CDP tracing header name",
      format: String,
      default: "x-cdp-request-id",
      env: "TRACING_HEADER",
    },
  },
  aws: {
    endpointUrl: {
      doc: "AWS Endpoint URL used for LocalStack",
      format: String,
      nullable: true,
      default: null,
      env: "AWS_ENDPOINT_URL",
    },
    region: {
      doc: "AWS Region",
      format: String,
      default: "eu-west-2",
      env: "AWS_REGION",
    },
    s3: {
      bucketName: {
        doc: "Configs S3 bucket name",
        format: String,
        default: "configs-bucket",
        env: "CONFIG_BUCKET_NAME",
      },
      forcePathStyle: {
        doc: "Force path style on S3 bucket",
        format: Boolean,
        default: true,
        env: "FORCE_PATH_STYLE",
      },
    },
  },
  configBroker: {
    auth: {
      token: {
        doc: "Bearer token for service-to-service authentication",
        format: String,
        default: "",
        env: "GRANTS_CONFIG_BROKER_AUTH_TOKEN",
        sensitive: true,
      },
      encryptionKey: {
        doc: "Encryption key for decrypting bearer token",
        format: String,
        default: "",
        env: "GRANTS_CONFIG_BROKER_ENCRYPTION_KEY",
        sensitive: true,
      },
    },
    apiEndpoint: {
      doc: "Endpoint for the config broker API",
      format: String,
      default: "http://localhost:3001",
      env: "GRANTS_CONFIG_BROKER_API_ENDPOINT",
    },
  },
});

config.validate({ allowed: "strict" });
