import * as core from "@actions/core";
import * as github from "@actions/github";
import { TransformDecodeCheckError, ValueError } from "@sinclair/typebox/value";
import { returnDataToKernel } from "./action";
import { validateAndDecodeSchemas } from "./helpers/validator";

async function main() {
  const payload = github.context.payload.inputs;

  payload.env = { ...(payload.env || {}), workflowName: github.context.workflow };
  let finalErrors: ValueError[] = [];
  try {
    validateAndDecodeSchemas(payload.env, JSON.parse(payload.settings));
  } catch (e) {
    if (e instanceof TransformDecodeCheckError) {
      finalErrors = [e.error];
    } else {
      finalErrors = [e as ValueError];
    }
  }
  return { payload, errors: finalErrors };
}

main()
  .then((payload) => {
    console.log("Configuration validated.");
    return payload;
  })
  .catch((e) => {
    console.error("Failed to validate configuration", e);
    core.setFailed(e);
    return e;
  })
  .then(async (payload) => {
    await returnDataToKernel(process.env.GITHUB_TOKEN, payload.stateId, { errors: payload.errors }, "configuration_validation");
  })
  .catch((e) => {
    console.error("Failed to return the data to the kernel.", e);
  });
