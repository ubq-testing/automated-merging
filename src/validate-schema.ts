import * as core from "@actions/core";
import * as github from "@actions/github";
import { TransformDecodeCheckError, TransformDecodeError } from "@sinclair/typebox/value";
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
    if (e instanceof TransformDecodeCheckError || e instanceof TransformDecodeError) {
      finalErrors = [e.error];
    } else {
      finalErrors = [e];
    }
  }
  await returnDataToKernel(process.env.GITHUB_TOKEN, payload.stateId, { errors: finalErrors }, "configuration_validation");
}

main()
  .then(() => {
    console.log("Configuration validated.");
  })
  .catch((e) => {
    console.error("Failed to validate configuration", e);
    core.setFailed(e);
  });
