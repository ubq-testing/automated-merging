import * as github from "@actions/github";
import { Octokit } from "@octokit/rest";
import { validateAndDecodeSchemas } from "./helpers/validator";
import { plugin } from "./plugin";
import { PluginInputs } from "./types";

/**
 * How a GitHub action executes the plugin.
 */
export async function run() {
  const payload = github.context.payload.inputs;

  payload.env = { ...(payload.env || {}), workflowName: github.context.workflow };
  const { envDecoded, settingsDecoded, errors } = validateAndDecodeSchemas(payload.env, JSON.parse(payload.settings));
  if (errors) {
    throw new Error(`Invalid schema detected.`);
  }
  const inputs: PluginInputs = {
    stateId: payload.stateId,
    eventName: payload.eventName,
    eventPayload: JSON.parse(payload.eventPayload),
    settings: settingsDecoded,
    authToken: payload.authToken,
    ref: payload.ref,
  };

  await plugin(inputs, envDecoded);

  return returnDataToKernel(process.env.GITHUB_TOKEN, inputs.stateId, {});
}

export async function returnDataToKernel(repoToken: string, stateId: string, output: object, eventType = "return_data_to_ubiquibot_kernel") {
  console.log("returning data to kernel", {
    repoToken: repoToken,
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    event_type: eventType,
    client_payload: {
      state_id: stateId,
      output: JSON.stringify(output),
    },
  });
  const octokit = new Octokit({ auth: repoToken });
  return octokit.repos.createDispatchEvent({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    event_type: eventType,
    client_payload: {
      state_id: stateId,
      output: JSON.stringify(output),
    },
  });
}
