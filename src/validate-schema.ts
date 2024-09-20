import * as github from "@actions/github";
import { returnDataToKernel } from "./action";
import { validateAndDecodeSchemas } from "./helpers/validator";

async function main() {
  const payload = github.context.payload.inputs;

  payload.env = { ...(payload.env || {}), workflowName: github.context.workflow };
  const { errors } = validateAndDecodeSchemas(payload.env, JSON.parse(payload.settings));
  console.log(errors);
  await returnDataToKernel(process.env.GITHUB_TOKEN, "", { errors }, "configuration_validation");
}

main()
  .then(() => {
    console.log("Configuration validated.");
  })
  .catch((e) => {
    console.error("Failed to validate configuration", e);
  });
