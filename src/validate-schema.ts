import * as github from "@actions/github";
import { validateAndDecodeSchemas } from "./helpers/validator";

function main() {
  const payload = github.context.payload.inputs;

  payload.env = { ...(payload.env || {}), workflowName: github.context.workflow };
  const decodedSchemas = validateAndDecodeSchemas(payload.env, JSON.parse(payload.settings));
  console.log(decodedSchemas);
}

main();
