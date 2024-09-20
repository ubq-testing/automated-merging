import * as github from "@actions/github";
import { returnDataToKernel } from "./action";
import { validateAndDecodeSchemas } from "./helpers/validator";

async function main() {
  const payload = github.context.payload.inputs;

  payload.env = { ...(payload.env || {}), workflowName: github.context.workflow };
  const decodedSchemas = validateAndDecodeSchemas(payload.env, JSON.parse(payload.settings));
  console.log(decodedSchemas);
  await returnDataToKernel(process.env.GITHUB_TOKEN, "", decodedSchemas, "configuration_validated");
}

main()
  .then(() => {
    console.log("Configuration validated.");
  })
  .catch((e) => {
    console.error("Failed to validate configuration", e);
  });
