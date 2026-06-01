import convict from "convict";
import convictFormatWithValidator from "convict-format-with-validator";

convict.addFormats(convictFormatWithValidator);

export const config = convict({
  serviceVersion: {
    doc: "The service version, this variable is injected into your docker container in CDP environments",
    format: String,
    nullable: true,
    default: null,
    env: "SERVICE_VERSION",
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
