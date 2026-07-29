import { STSClient } from "@aws-sdk/client-sts";

export const stsClientPlugin = {
  plugin: {
    name: "sts-client",
    version: "1.0.0",
    register(server) {
      const sts = new STSClient();

      server.decorate("server", "sts", sts);
      server.decorate("request", "sts", () => sts, { apply: true });

      server.events.on("stop", () => {
        server.logger.info("Closing AWS SDK clients");
        sts.destroy();
      });
    },
  },
};
