import * as github from "@actions/github";
import { TransformDecodeCheckError } from "@sinclair/typebox/value";
import { returnDataToKernel } from "./action";
import { validateAndDecodeSchemas } from "./helpers/validator";

async function main() {
  const payload = github.context.payload.inputs;

  payload.env = { ...(payload.env || {}), workflowName: github.context.workflow };
  let finalErrors;
  try {
    const { errors } = validateAndDecodeSchemas(payload.env, JSON.parse(payload.settings));
    finalErrors = errors;
  } catch (e) {
    if (e instanceof TransformDecodeCheckError) {
      finalErrors = [e.error];
    } else {
      finalErrors = [e];
    }
  }
  console.log("====", finalErrors);
  await returnDataToKernel(process.env.GITHUB_TOKEN, "", { errors: finalErrors }, "configuration_validation");
}

main()
  .then(() => {
    console.log("Configuration validated.");
  })
  .catch((e) => {
    console.error("Failed to validate configuration", e);
  });
