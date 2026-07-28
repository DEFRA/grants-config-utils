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
    sns: {
      configVersionTopicArn: {
        doc: "ARN of the SNS topic to publish new config version events",
        format: String,
        default: "arn:aws:sns:eu-west-2:000000000000:gfr__sns___config_version",
        env: "GFR__SNS__CONFIG_VERSION_ARN",
      },
    },
  },
  configBroker: {
    serviceAuth: {
      audience: {
        doc: "JWT audience sent in the token request",
        format: String,
        default: "grants-config-broker",
        env: "BACKEND_SERVICE_AUTH_AUDIENCE",
      },
      tokenDuration: {
        doc: "Token lifetime in seconds (max 900)",
        format: Number,
        default: 60,
        env: "BACKEND_SERVICE_AUTH_TOKEN_DURATION",
      },
    },
    apiEndpoint: {
      doc: "Endpoint for the config broker API",
      format: String,
      default: "http://localhost:3001",
      env: "GRANTS_CONFIG_BROKER_API_ENDPOINT",
    },
  },
  configPublish: {
    status: {
      doc: "Config publish status",
      format: String,
      default: "active",
      env: "GRANTS_CONFIG_PUBLISH_STATUS",
    },
  },
});

config.validate({ allowed: "strict" });
