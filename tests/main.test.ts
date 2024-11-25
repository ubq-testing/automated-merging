import { drop } from "@mswjs/data";
import { http, HttpResponse } from "msw";
import * as githubHelpers from "../src/helpers/github";
import { db } from "./__mocks__/db";
import { server } from "./__mocks__/node";
import { expect, describe, beforeAll, beforeEach, afterAll, afterEach, it, jest } from "@jest/globals";
import { Context, pluginSettingsSchema } from "../src/types";
import seed from "./__mocks__/seed.json";
import { Logs } from "@ubiquity-os/ubiquity-os-logger";
import { Value } from "@sinclair/typebox/value";
import { customOctokit as Octokit } from "@ubiquity-os/plugin-sdk/octokit";

const mergePullRequest = jest.fn();

beforeAll(async () => {
  server.listen();

  const githubHelpers = await import(githubHelpersPath);
  jest.unstable_mockModule(githubHelpersPath, () => {
    return {
      __esModule: true,
      ...githubHelpers,
      mergePullRequest,
    };
  });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const htmlUrl = "https://github.com/ubiquibot/automated-merging/pull/1";
const issueParams = { owner: "ubiquibot", repo: "automated-merging", issue_number: 1 };
const workflow = "workflow";
const githubHelpersPath = "../src/helpers/github";
const monitor = "ubiquibot/automated-merging";

describe("Action tests", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.resetModules();
    drop(db);
    for (const table of Object.keys(seed)) {
      const tableName = table as keyof typeof seed;
      for (const row of seed[tableName]) {
        db[tableName].create(row);
      }
    }
  });

  it("Should not close a PR that is not past the threshold", async () => {
    server.use(
      http.get(
        "https://api.github.com/repos/:org/:repo/pulls/:id/merge",
        () => {
          return HttpResponse.json({}, { status: 404 });
        },
        { once: true }
      ),
      http.get(
        "https://api.github.com/repos/:org/:repo/issues/:id/timeline",
        () => {
          return HttpResponse.json([{ id: 1, created_at: new Date() }]);
        },
        { once: true }
      )
    );

    const plugin = (await import("../src/plugin")).plugin;
    const context = createContext({
      repos: { monitor: [monitor], ignore: [] },
      allowedReviewerRoles: ["COLLABORATOR", "MEMBER", "OWNER"],
    });
    await expect(plugin(context)).resolves.toEqual(undefined);
    expect(mergePullRequest).not.toHaveBeenCalled();
  });

  it("Should close a PR that is past the threshold", async () => {
    const lastActivityDate = new Date();
    lastActivityDate.setDate(new Date().getDate() - 8);
    server.use(
      http.get(
        "https://api.github.com/repos/:org/:repo/pulls/:id/merge",
        () => {
          return HttpResponse.json({}, { status: 404 });
        },
        { once: true }
      ),
      http.get(
        "https://api.github.com/repos/:org/:repo/issues/:id/timeline",
        () => {
          return HttpResponse.json([{ id: 1, created_at: lastActivityDate }]);
        },
        { once: true }
      )
    );

    const plugin = (await import("../src/plugin")).plugin;
    const context = createContext({ repos: { monitor: [monitor], ignore: [] } });

    await expect(plugin(context)).resolves.toEqual(undefined);
    expect(mergePullRequest).toHaveBeenCalled();
  });

  it("Should not close a PR if non-approved reviews are present", async () => {
    server.use(
      http.get(
        "https://api.github.com/repos/:org/:repo/pulls/:id/reviews",
        () => {
          return HttpResponse.json([
            { id: 1, state: "COMMENTED", author_association: "CONTRIBUTOR" },
            { id: 2, state: "APPROVED", author_association: "NONE" },
          ]);
        },
        { once: true }
      )
    );

    const plugin = (await import("../src/plugin")).plugin;
    const context = createContext({ repos: { monitor: [monitor], ignore: [] } });

    await expect(plugin(context)).resolves.toEqual(undefined);
    expect(mergePullRequest).not.toHaveBeenCalled();
  });

  it("Should pick the timeout according to the assignees status", async () => {
    const contributorMergeTimeout = "7 days";
    const collaboratorMergeTimeout = "3.5 days";
    const collaboratorMinimumApprovalsRequired = 2;
    const contributorMinimumApprovalsRequired = 1;
    const context = createContext({
      mergeTimeout: {
        contributor: contributorMergeTimeout,
        collaborator: collaboratorMergeTimeout,
      },
      approvalsRequired: {
        collaborator: collaboratorMinimumApprovalsRequired,
        contributor: contributorMinimumApprovalsRequired,
      },
      allowedReviewerRoles: ["COLLABORATOR", "MEMBER", "OWNER"],
    });

    await expect(githubHelpers.getMergeTimeoutAndApprovalRequiredCount(context, "COLLABORATOR")).resolves.toEqual({
      mergeTimeout: collaboratorMergeTimeout,
      requiredApprovalCount: collaboratorMinimumApprovalsRequired,
    });
    server.use(
      http.get(
        "https://api.github.com/repos/:org/:repo/collaborators/:login",
        () => {
          return HttpResponse.json("Not a collaborator", { status: 404 });
        },
        { once: true }
      )
    );
    await expect(githubHelpers.getMergeTimeoutAndApprovalRequiredCount(context, "CONTRIBUTOR")).resolves.toEqual(null);
  });

  it("Should check if the CI tests are all passing", async () => {
    server.use(
      http.get(
        "https://api.github.com/repos/:org/:repo/commits/:id/check-suites",
        () => {
          return HttpResponse.json({ check_suites: [{ id: 1, url: "https://test-url/suites" }] });
        },
        { once: true }
      )
    );
    server.use(
      http.get(
        "https://api.github.com/repos/:org/:repo/check-suites/:id/check-runs",
        () => {
          return HttpResponse.json({ check_runs: [{ id: 1, name: "Run", url: "https://test-url/runs", conclusion: "success", status: "completed" }] });
        },
        { once: true }
      )
    );
    const context = createContext({ allowedReviewerRoles: ["COLLABORATOR", "MEMBER", "OWNER"] });
    await expect(githubHelpers.isCiGreen(context, "1", issueParams)).resolves.toEqual(true);
  });

  it("Should throw an error if the search fails", async () => {
    server.use(
      http.get("https://api.github.com/search/issues", () => {
        return HttpResponse.json({ error: "Some error" }, { status: 500 });
      })
    );
    const plugin = (await import("../src/plugin")).plugin;
    const context = createContext({ repos: { monitor: [monitor], ignore: [] } });
    await expect(plugin(context)).rejects.toThrow();
  });
});

function createContext(config?: object): Context {
  return {
    eventName: "push",
    payload: {
      pull_request: {
        html_url: htmlUrl,
        assignees: [{ login: "ubiquibot" }],
      },
      repository: {
        id: 1,
        name: "daemon-merging",
        owner: {
          id: 1,
          login: "ubiquity-os-marketplace",
        },
      },
    },
    config: Value.Decode(pluginSettingsSchema, Value.Default(pluginSettingsSchema, { ...config })),
    octokit: new Octokit(),
    logger: new Logs("debug"),
    env: {
      workflowName: workflow,
    },
  } as unknown as Context;
}
