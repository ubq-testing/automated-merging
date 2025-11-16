import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { drop } from "@mswjs/data";
import { forkSafetyGuard } from "../src/guards";
import { db, resetState } from "./__mocks__/db";
import { server } from "./__mocks__/node";
import type { Octokit } from "../src/types";
import { logger } from "../src/utils";
import { LogReturn } from "@ubiquity-os/ubiquity-os-logger";

const FORK_OWNER = "fork-owner";
const THIS_REPO = "this-repo";
const UPSTREAM_THIS_REPO = "upstream-owner/this-repo";

function createMockOctokit(): Octokit {
  return {
    rest: {
      repos: {
        get: async ({ owner, repo }: { owner: string; repo: string }) => {
          const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          return { data: await response.json() };
        },
      },
      pulls: {
        list: async ({ owner, repo, state, head }: { owner: string; repo: string; state?: string; head?: string }) => {
          const url = new URL(`https://api.github.com/repos/${owner}/${repo}/pulls`);
          if (state) url.searchParams.set("state", state);
          if (head) url.searchParams.set("head", head);
          const response = await fetch(url.toString());
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          return { data: await response.json() };
        },
      },
    },
  } as unknown as Octokit;
}

beforeAll(() => {
  server.listen();
});

afterEach(() => {
  drop(db);
  resetState();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

describe("forkSafetyGuard", () => {
  beforeEach(() => {
    drop(db);
    resetState();
  });

  it("Should return safe when repository is not a fork", async () => {
    const loggerInfoSpy = jest.spyOn(logger, "info").mockImplementation(() => ({}) as LogReturn);

    db.repos.create({
      id: 1,
      owner: "test-owner",
      name: "test-repo",
      archived: false,
      fork: false,
      default_branch: "main",
      parent: {
        full_name: null,
      },
    });

    const octokit = createMockOctokit();
    const result = await forkSafetyGuard({ octokit, repoSlug: { owner: "test-owner", repo: "test-repo" } });

    expect(result.safe).toBe(true);
    expect(loggerInfoSpy).toHaveBeenCalledWith(expect.stringContaining("is not a fork"));

    loggerInfoSpy.mockRestore();
  });

  it("Should return unsafe when fork has open PR to upstream", async () => {
    const loggerInfoSpy = jest.spyOn(logger, "info").mockImplementation(() => ({}) as LogReturn);

    db.repos.create({
      id: 1,
      owner: FORK_OWNER,
      name: THIS_REPO,
      archived: false,
      fork: true,
      default_branch: "main",
      parent: {
        full_name: UPSTREAM_THIS_REPO,
      },
    });

    db.pulls.create({
      id: 1,
      owner: "upstream-owner",
      repo: THIS_REPO,
      number: 1,
      state: "open",
      head: "fork-owner:main",
    });

    const octokit = createMockOctokit();
    const result = await forkSafetyGuard({ octokit, repoSlug: { owner: FORK_OWNER, repo: THIS_REPO } });

    expect(result.safe).toBe(false);
    if (!result.safe) {
      expect(result.reason).toContain("open PR from fork-owner:main to upstream-owner/this-repo");
    }
    expect(loggerInfoSpy).toHaveBeenCalledWith(expect.stringContaining("Found open PR"));

    loggerInfoSpy.mockRestore();
  });

  it("Should return safe when fork has no open PRs to upstream", async () => {
    const loggerInfoSpy = jest.spyOn(logger, "info").mockImplementation(() => ({}) as LogReturn);

    db.repos.create({
      id: 1,
      owner: FORK_OWNER,
      name: THIS_REPO,
      archived: false,
      fork: true,
      default_branch: "main",
      parent: {
        full_name: UPSTREAM_THIS_REPO,
      },
    });

    const octokit = createMockOctokit();
    const result = await forkSafetyGuard({ octokit, repoSlug: { owner: FORK_OWNER, repo: THIS_REPO } });

    expect(result.safe).toBe(true);
    expect(loggerInfoSpy).toHaveBeenCalledWith(expect.stringContaining("No open PRs found"));

    loggerInfoSpy.mockRestore();
  });

  it("Should return unsafe when fork is detected but parent is unknown", async () => {
    const loggerInfoSpy = jest.spyOn(logger, "info").mockImplementation(() => ({}) as LogReturn);

    db.repos.create({
      id: 1,
      owner: FORK_OWNER,
      name: THIS_REPO,
      archived: false,
      fork: true,
      default_branch: "main",
      parent: {
        full_name: null,
      },
    });

    const octokit = createMockOctokit();
    const result = await forkSafetyGuard({ octokit, repoSlug: { owner: FORK_OWNER, repo: THIS_REPO } });

    expect(result.safe).toBe(false);
    if (!result.safe) {
      expect(result.reason).toBe("fork detected with unknown parent");
    }
    expect(loggerInfoSpy).toHaveBeenCalledWith(expect.stringContaining("Fork detected but parent unknown"));

    loggerInfoSpy.mockRestore();
  });

  it("Should return unsafe on API check failure", async () => {
    const loggerErrorSpy = jest.spyOn(logger, "error").mockImplementation(() => ({}) as LogReturn);

    const octokit = createMockOctokit();
    const result = await forkSafetyGuard({ octokit, repoSlug: { owner: "any-owner", repo: "any-repo" } });

    expect(result.safe).toBe(false);
    if (!result.safe) {
      expect(result.reason).toBe("fork guard check failed");
    }

    loggerErrorSpy.mockRestore();
  });

  it("Should identify fork with closed PRs as safe", async () => {
    const loggerInfoSpy = jest.spyOn(logger, "info").mockImplementation(() => ({}) as LogReturn);

    db.repos.create({
      id: 1,
      owner: FORK_OWNER,
      name: THIS_REPO,
      archived: false,
      fork: true,
      default_branch: "main",
      parent: {
        full_name: UPSTREAM_THIS_REPO,
      },
    });

    db.pulls.create({
      id: 1,
      owner: "upstream-owner",
      repo: THIS_REPO,
      number: 1,
      state: "closed",
      head: "fork-owner:main",
    });

    const octokit = createMockOctokit();
    const result = await forkSafetyGuard({ octokit, repoSlug: { owner: FORK_OWNER, repo: THIS_REPO } });

    expect(result.safe).toBe(true);
    expect(loggerInfoSpy).toHaveBeenCalledWith(expect.stringContaining("No open PRs found"));

    loggerInfoSpy.mockRestore();
  });
});
