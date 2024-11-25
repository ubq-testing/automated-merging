import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { server } from "./__mocks__/node";
import { pluginSettingsSchema } from "../src/types";
import { Value } from "@sinclair/typebox/value";

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

process.env.PLUGIN_GITHUB_TOKEN = "test-token";

const setOutput = jest.fn();
const setFailed = jest.fn();
jest.mock("@actions/core", () => ({
  setOutput,
  setFailed,
}));

describe("Configuration tests", () => {
  it("Should deny the configuration if the required reviewers are less than 1", async () => {
    const errors = [
      ...Value.Errors(pluginSettingsSchema, {
        approvalsRequired: {
          collaborator: 0,
          contributor: 0,
        },
        mergeTimeout: {
          collaborator: "3.5 days",
          contributor: "7 days",
        },
      }),
    ];
    expect(errors[0]).toMatchObject({
      message: "Expected number to be greater or equal to 1",
      path: "/approvalsRequired/collaborator",
      schema: {
        default: 1,
        minimum: 1,
        type: "number",
      },
      type: 39,
      value: 0,
    });
    expect(errors[1]).toMatchObject({
      message: "Expected number to be greater or equal to 1",
      path: "/approvalsRequired/contributor",
      schema: {
        default: 2,
        minimum: 1,
        type: "number",
      },
      type: 39,
      value: 0,
    });
  });
});
