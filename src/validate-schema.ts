import * as core from "@actions/core";
import * as github from "@actions/github";
import { TransformDecodeCheckError, TransformDecodeError } from "@sinclair/typebox/value";
import { returnDataToKernel } from "./action";
import { validateAndDecodeSchemas } from "./helpers/validator";

async function main() {
  const payload = github.context.payload.inputs;

  payload.env = { ...(payload.env || {}), workflowName: github.context.workflow };
  try {
    validateAndDecodeSchemas(payload.env, JSON.parse(payload.settings));
  } catch (errors) {
    console.error(errors);
    if (errors instanceof TransformDecodeCheckError || errors instanceof TransformDecodeError) {
      throw { errors: [errors.error], payload };
    } else {
      throw { errors, payload };
    }
  }
  return { errors: [], payload };
}

main()
  .then((payload) => {
    console.log("Configuration validated.");
    return payload;
  })
  .catch((e) => {
    console.error("Failed to validate configuration", e);
    core.setFailed(e.errors);
    return e;
  })
  .then(async (payload) => {
    console.log("returning data to kernel!");
    await returnDataToKernel(process.env.GITHUB_TOKEN, payload.stateId, { errors: payload.errors }, "configuration_validation");
  })
  .catch((e) => {
    console.error("Failed to return the data to the kernel.", e);
  });
