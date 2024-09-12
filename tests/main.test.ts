import { drop } from "@mswjs/data";
import { Octokit } from "@octokit/rest";
import { http, HttpResponse } from "msw";
import * as githubHelpers from "../src/helpers/github";
import { db } from "./__mocks__/db";
import { server } from "./__mocks__/node";
import { expect, describe, beforeAll, beforeEach, afterAll, afterEach, it, jest } from "@jest/globals";
import { Context } from "../src/types";
import seed from "./__mocks__/seed.json";

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const htmlUrl = "https://github.com/ubiquibot/automated-merging/pull/1";
const actionsGithubPackage = "@actions/github";
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
    jest.mock(actionsGithubPackage, () => ({
      context: {
        repo: {
          owner: {
            login: "ubiquibot",
          },
        },
        workflow,
        payload: {
          inputs: {
            eventName: "push",
            settings: JSON.stringify({
              repos: { monitor: [monitor] },
              allowedReviewerRoles: ["COLLABORATOR", "MEMBER", "OWNER"],
            }),
            eventPayload: JSON.stringify({
              pull_request: {
                html_url: htmlUrl,
              },
              repository: {
                owner: "ubiquibot",
              },
            }),
            env: {
              workflowName: workflow,
            },
          },
        },
      },
    }));
    const mergePullRequest = jest.fn();
    jest.mock(githubHelpersPath, () => {
      const actualModule = jest.requireActual(githubHelpersPath) as object;
      return {
        __esModule: true,
        ...actualModule,
        mergePullRequest,
      };
    });
    const run = (await import("../src/action")).run;
    await expect(run()).resolves.toMatchObject({ status: 200 });
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
    jest.mock(actionsGithubPackage, () => ({
      context: {
        repo: {
          owner: {
            login: "ubiquibot",
          },
        },
        workflow,
        payload: {
          inputs: {
            eventName: "push",
            settings: JSON.stringify({
              repos: { monitor: [monitor] },
            }),
            eventPayload: JSON.stringify({
              pull_request: {
                html_url: htmlUrl,
              },
              repository: {
                owner: "ubiquibot",
              },
            }),
            env: {
              workflowName: workflow,
            },
          },
        },
      },
    }));
    const mergePullRequest = jest.fn();
    jest.mock(githubHelpersPath, () => {
      const actualModule = jest.requireActual(githubHelpersPath) as object;
      return {
        __esModule: true,
        ...actualModule,
        mergePullRequest,
      };
    });
    const run = (await import("../src/action")).run;
    await expect(run()).resolves.toMatchObject({ status: 200 });
    expect(mergePullRequest).toHaveBeenCalled();
  });

  it("Should not close a PR if non-approved reviews are present", async () => {
    server.use(
      http.get(
        "https://api.github.com/repos/:org/:repo/pulls/:id/reviews",
        () => {
          return HttpResponse.json([{ id: 1, state: "COMMENTED", author_association: "CONTRIBUTOR" }, { id: 2, state: "APPROVED", author_association: "NONE" }]);
        },
        { once: true }
      )
    );
    jest.mock(actionsGithubPackage, () => ({
      context: {
        repo: {
          owner: {
            login: "ubiquibot",
          },
        },
        workflow,
        payload: {
          inputs: {
            eventName: "push",
            settings: JSON.stringify({
              repos: { monitor: [monitor] },
            }),
            eventPayload: JSON.stringify({
              pull_request: {
                html_url: htmlUrl,
              },
              repository: {
                owner: "ubiquibot",
              },
            }),
            env: {
              workflowName: workflow,
            },
          },
        },
      },
    }));
    const mergePullRequest = jest.fn();
    jest.mock(githubHelpersPath, () => {
      const actualModule = jest.requireActual(githubHelpersPath) as object;
      return {
        __esModule: true,
        ...actualModule,
        mergePullRequest,
      };
    });
    const run = (await import("../src/action")).run;
    await expect(run()).resolves.toMatchObject({ status: 200 });
    expect(mergePullRequest).not.toHaveBeenCalled();
  });

  it("Should pick the timeout according to the assignees status", async () => {
    const contributorMergeTimeout = "7 days";
    const collaboratorMergeTimeout = "3.5 days";
    const collaboratorMinimumApprovalsRequired = 2;
    const contributorMinimumApprovalsRequired = 1;
    const context = {
      logger: {
        debug: console.log,
      },
      payload: {
        pull_request: {
          assignees: [{ login: "ubiquibot" }],
        },
      },
      config: {
        mergeTimeout: {
          contributor: contributorMergeTimeout,
          collaborator: collaboratorMergeTimeout,
        },
        approvalsRequired: {
          collaborator: collaboratorMinimumApprovalsRequired,
          contributor: contributorMinimumApprovalsRequired,
        },
        allowedReviewerRoles: ["COLLABORATOR", "MEMBER", "OWNER"],
      },
      octokit: new Octokit(),
    } as unknown as Context;
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
    await expect(githubHelpers.getMergeTimeoutAndApprovalRequiredCount(context, "CONTRIBUTOR")).resolves.toEqual({
      mergeTimeout: contributorMergeTimeout,
      requiredApprovalCount: contributorMinimumApprovalsRequired,
    });
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
    const context = {
      logger: {
        debug: console.log,
      },
      payload: {
        pull_request: {
          assignees: [{ login: "ubiquibot" }],
        },
      },
      workflow: "other workflow",
      config: {
        allowedReviewerRoles: ["COLLABORATOR", "MEMBER", "OWNER"],
      },
      octokit: new Octokit(),
      env: {
        workflowName: workflow,
      },
    } as unknown as Context;
    await expect(githubHelpers.isCiGreen(context, "1", issueParams)).resolves.toEqual(true);
  });

  it("Should throw an error if the search fails", async () => {
    server.use(
      http.get("https://api.github.com/search/issues", () => {
        return HttpResponse.json({ error: "Some error" }, { status: 500 });
      })
    );
    jest.mock(actionsGithubPackage, () => ({
      context: {
        repo: {
          owner: {
            login: "ubiquibot",
          },
        },
        workflow,
        payload: {
          inputs: {
            eventName: "push",
            settings: JSON.stringify({
              repos: { monitor: [monitor] },
            }),
            eventPayload: JSON.stringify({
              pull_request: {
                html_url: htmlUrl,
              },
              repository: {
                owner: "ubiquibot",
              },
            }),
            env: {
              workflowName: workflow,
            },
          },
        },
      },
    }));
    const run = (await import("../src/action")).run;
    await expect(run()).rejects.toThrow();
  });
});
