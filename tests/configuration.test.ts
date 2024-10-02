import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { server } from "./__mocks__/node";

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("Configuration tests", () => {
  it("Should deny the configuration if the required reviewers are less than 1", async () => {
    jest.mock("@actions/github", () => ({
      context: {
        repo: {
          owner: {
            login: "ubiquibot",
          },
        },
        workflow: "workflow",
        payload: {
          inputs: {
            eventName: "pull_request.opened",
            settings: JSON.stringify({
              approvalsRequired: {
                collaborator: 0,
                contributor: 0,
              },
              mergeTimeout: {
                collaborator: "3.5 days",
                contributor: "7 days",
              },
            }),
            eventPayload: JSON.stringify({
              pull_request: {
                html_url: "https://github.com/ubiquibot/automated-merging/pull/1",
              },
              env: {
                workflowName: "workflow",
              },
            }),
            env: {
              workflowName: "workflow",
            },
          },
        },
      },
    }));
    const run = (await import("../src/action")).run;
    await expect(run()).rejects.toMatchObject({
      errors: [
        {
          message: "Expected number to be greater or equal to 1",
          path: "/approvalsRequired/collaborator",
          schema: {
            default: 1,
            minimum: 1,
            type: "number",
          },
          type: 39,
          value: 0,
        },
        {
          message: "Expected number to be greater or equal to 1",
          path: "/approvalsRequired/contributor",
          schema: {
            default: 2,
            minimum: 1,
            type: "number",
          },
          type: 39,
          value: 0,
        },
      ],
    });
  });
});
