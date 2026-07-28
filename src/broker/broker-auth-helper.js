import { generateToken } from "../sts/grants-config-broker-token.js";

const AUTH_SCHEME = "Bearer";

/**
 * Creates headers for authenticating with the config-broker API using service to service authentication
 * @param {object} requestOrServer - Request or Server object
 * @param {object} baseHeaders - Base headers to extend
 * @returns {object} Headers with authentication if token is available
 */
export async function createAuthenticatedHeaders(
  requestOrServer,
  baseHeaders = {},
) {
  const headers = { ...baseHeaders };

  const authCredentials = await generateToken(requestOrServer);
  headers.Authorization = `${AUTH_SCHEME} ${authCredentials}`;

  return headers;
}
