# grants-config-utils

NPM module for providing utils for publishing grants config

## Usage

### Installation

```
npm install --save @defra/grants-config-utils

```

## Making changes

Refer to the [contributing documentation](CONTRIBUTING.md).

## Environment Variables

The following variables are used in this module:

- `SERVICE_VERSION` - **Required** This is the CDP service version that should be injected automatically in all consuming services
- `AWS_REGION` - **Required** Region where the service is deployed
- `CONFIG_BUCKET_NAME` - **Required** The S3 bucket where the config is to be stored
- `FORCE_PATH_STYLE` - Optional flag to force path style URLs when using S3 bucket (default true)
- `AWS_ENDPOINT_URL` - Optional AWS endpoint URL for local development
- `GRANTS_CONFIG_PUBLISH_STATUS` - Optional override for status used on publish of config versions (default 'active')

Depending on which mechanism is used to publish config versions, the following environment variables may be required:

**To publish asynchronously via SNS (Recommended)**

- `GFR__SNS__CONFIG_VERSION_ARN` - **Required** ARN of the SNS topic to publish config version events to

**To publish synchronously via REST API**

- `GRANTS_CONFIG_BROKER_AUTH_TOKEN` - **Required** Auth token for the grants config broker API
- `GRANTS_CONFIG_BROKER_ENCRYPTION_KEY` - **Required** Encryption key for the grants config broker API
- `GRANTS_CONFIG_BROKER_API_ENDPOINT` - **Required** Endpoint for the grants config broker API

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government license v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable information providers in the public sector to license the use and re-use of their information under a common open licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
