import { GetWebIdentityTokenCommand } from "@aws-sdk/client-sts";
import { config } from "../config/config.js";

const serviceAuthAudience = config.get("configBroker.serviceAuth.audience");
const serviceAuthTokenDuration = config.get(
  "configBroker.serviceAuth.tokenDuration",
);

export const generateToken = async (stsClient) => {
  const input = {
    SigningAlgorithm: "RS256",
    Audience: [serviceAuthAudience],
    DurationSeconds: serviceAuthTokenDuration,
  };
  const command = new GetWebIdentityTokenCommand(input);

  const { WebIdentityToken } = await stsClient.send(command);
  return WebIdentityToken;
};
