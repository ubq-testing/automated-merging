import type { ForkGuardResult, Octokit } from "./types";
import { logger } from "./utils";

/**
 * Safety check: prevents running in a fork that has an open PR to upstream.
 * This avoids accidentally merging branches in a fork during testing.
 */
export async function forkSafetyGuard({ octokit, repoSlug }: { octokit: Octokit; repoSlug: { owner: string; repo: string } }): Promise<ForkGuardResult> {
  try {
    const { data: repo } = await octokit.rest.repos.get({
      owner: repoSlug.owner,
      repo: repoSlug.repo,
    });

    if (!repo.fork) {
      logger.info(`[Fork Guard] ${repoSlug.owner}/${repoSlug.repo} is not a fork`);
      return { safe: true };
    }

    const parent = repo.parent?.full_name;
    if (!parent) {
      logger.info(`[Fork Guard] Fork detected but parent unknown`);
      return { safe: false, reason: "fork detected with unknown parent" };
    }

    const [upOwner, upRepo] = parent.split("/");
    const { data: pulls } = await octokit.rest.pulls.list({
      owner: upOwner,
      repo: upRepo,
      state: "open",
      head: `${repoSlug.owner}:main`,
    });

    if (pulls.length > 0) {
      logger.info(`[Fork Guard] Found open PR from ${repoSlug.owner}:main to ${parent}`);
      return {
        safe: false,
        reason: `open PR from ${repoSlug.owner}:main to ${parent}`,
      };
    }

    logger.info(`[Fork Guard] No open PRs found, safe to proceed`);
    return { safe: true };
  } catch (error) {
    logger.error(`[Fork Guard] Check failed:`, { e: error });
    return { safe: false, reason: "fork guard check failed" };
  }
}
