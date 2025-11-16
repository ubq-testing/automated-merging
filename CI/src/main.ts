import { authenticateOrganization, createAppClient, createMainBranch, getDefaultBranch, listOrgRepos, mergeDefaultIntoMain, openPullRequest } from "./github";
import { forkSafetyGuard } from "./guards";
import { firstValidTimestamp, logger } from "./utils";
import { AutoMergeOptions, AutoMergeResult, BranchData, MergeOutcome, Octokit, RepositoryInfo } from "./types";
export type { MergeOutcome } from "./types";

const DEFAULT_INACTIVITY_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const UP_TO_DATE = "up-to-date";

type ProcessingContext = {
  octokit: Octokit;
  org: string;
  cutoffTime: number;
  inactivityDays: number;
};

/**
 * Main entry point for auto-merging development branches
 */
export async function runAutoMerge(options: AutoMergeOptions): Promise<AutoMergeResult> {
  const inactivityDays = options.inactivityDays ?? DEFAULT_INACTIVITY_DAYS;
  const cutoffTime = Date.now() - inactivityDays * MS_PER_DAY;

  const outcomes: MergeOutcome[] = [];
  let errors = 0;

  const appClient = createAppClient(options.appId, options.privateKey);

  for (const org of options.orgs) {
    const result = await processOrganization(appClient, org, options, cutoffTime, inactivityDays);
    outcomes.push(...result.outcomes);
    errors += result.errors;

    if (result.aborted) {
      break;
    }
  }

  logger.info(`[Auto-Merge] Completed: ${outcomes.length} outcomes, ${errors} errors`);
  return { outcomes, errors };
}

/**
 * Process all repositories in a single organization
 */
async function processOrganization(
  appClient: Octokit,
  org: string,
  options: AutoMergeOptions,
  cutoffTime: number,
  inactivityDays: number
): Promise<{ outcomes: MergeOutcome[]; errors: number; aborted: boolean }> {
  logger.info(`[Auto-Merge] Processing organization: ${org}`);

  const outcomes: MergeOutcome[] = [];
  let errors = 0;

  // Authenticate for this organization
  let octokit: Octokit;
  try {
    octokit = await authenticateOrganization(appClient, org, options.appId, options.privateKey);
  } catch (error) {
    logger.error(`[Auto-Merge] Authentication failed for ${org}:`, { e: error });
    return { outcomes, errors: errors + 1, aborted: false };
  }

  // Get all repositories
  const repos = await listOrgRepos(octokit, org);
  if (!repos) {
    return { outcomes, errors: errors + 1, aborted: false };
  }

  logger.info(`[Auto-Merge] Found ${repos.length} repositories in ${org}`);

  // Process each repository
  const context: ProcessingContext = {
    octokit,
    org,
    cutoffTime,
    inactivityDays,
  };

  for (const repo of repos) {
    const result = await processRepository(context, repo);

    if (result.aborted) {
      return { outcomes, errors, aborted: true };
    }

    if (result.outcome) {
      outcomes.push(result.outcome);
    }

    if (result.error) {
      errors++;
    }
  }

  return { outcomes, errors, aborted: false };
}

/**
 * Process a single repository - check eligibility and merge if needed
 */
async function processRepository(context: ProcessingContext, repo: RepositoryInfo): Promise<{ outcome?: MergeOutcome; error?: boolean; aborted?: boolean }> {
  const { octokit, org, cutoffTime, inactivityDays } = context;
  const repoName = `${org}/${repo.name}`;
  const defaultBranch = repo.default_branch ?? "development"; // standard in the ubiquity ecosystem

  logger.info(`[Auto-Merge] Checking ${repoName}`);

  // Safety check: abort if running in a fork with open PR to upstream
  const guardResult = await checkForkSafety({ octokit, repo });
  if (guardResult.aborted) {
    logger.info(`[Auto-Merge] Aborted: ${guardResult.reason}`);
    return { aborted: true };
  }

  const outcome: MergeOutcome = {
    status: UP_TO_DATE,
    org,
    repo: repo.name,
    defaultBranch,
  };

  // Skip archived repositories
  if (repo.archived) {
    logger.info(`[Auto-Merge] Skipping ${repoName}: archived`);
    return {
      outcome: {
        ...outcome,
        status: "skipped",
        reason: "Repository archived",
      },
    };
  }

  // Get and validate default branch
  const branch = await getDefaultBranch({
    octokit,
    owner: org,
    repo: repo.name,
    defaultBranch,
  });

  if (!branch) {
    return {
      outcome: {
        ...outcome,
        status: "skipped",
        reason: `${defaultBranch} branch missing`,
      },
    };
  }

  // Check if branch is inactive
  const inactivityCheck = checkBranchInactivity({
    branch,
    cutoffTime,
    repoName,
    inactivityDays,
  });

  if (inactivityCheck.skip && inactivityCheck.reason) {
    return {
      outcome: {
        ...outcome,
        status: "skipped",
        reason: inactivityCheck.reason,
      },
    };
  }

  if (!inactivityCheck.daysSinceLastCommit) {
    return {
      outcome: {
        ...outcome,
        status: "skipped",
        reason: "Unable to determine inactivity",
      },
    };
  }

  // Attempt to merge the branch
  return await attemptMerge({
    octokit,
    defaultBranch,
    fullRepoName: repoName,
    repoName: repo.name,
    org,
    daysSinceLastCommit: inactivityCheck.daysSinceLastCommit,
    inactivityDays,
  });
}

/**
 * Check if repository is a fork with open PRs to upstream (safety guard)
 */
async function checkForkSafety({ octokit, repo }: { octokit: Octokit; repo: RepositoryInfo }): Promise<{ aborted?: boolean; reason?: string }> {
  const guard = await forkSafetyGuard({
    octokit,
    repoSlug: { owner: repo.owner.login, repo: repo.name },
  });

  if (!guard.safe) {
    return { aborted: true, reason: guard.reason };
  }

  return {};
}

/**
 * Check if a branch is inactive based on last commit date
 */
function checkBranchInactivity({
  branch,
  cutoffTime,
  repoName,
  inactivityDays,
}: {
  branch: BranchData;
  cutoffTime: number;
  repoName: string;
  inactivityDays: number;
}): { skip?: boolean; reason?: string; daysSinceLastCommit?: number } {
  const lastCommitDate = firstValidTimestamp([branch.commit.commit?.committer?.date, branch.commit.commit?.author?.date]);

  if (!lastCommitDate) {
    logger.info(`[Auto-Merge] Skipping ${repoName}: unable to determine last commit date`);

    return { skip: true, reason: "Unable to determine last commit date" };
  }

  const daysSinceLastCommit = Math.floor((Date.now() - lastCommitDate.getTime()) / MS_PER_DAY);

  if (lastCommitDate.getTime() > cutoffTime) {
    logger.info(`[Auto-Merge] Skipping ${repoName}: active (${daysSinceLastCommit} days old, threshold ${inactivityDays} days)`);
    return { skip: true, reason: "Development branch is still active" };
  }

  return { daysSinceLastCommit };
}

/**
 * Attempt to merge development branch into main
 */
async function attemptMerge({
  octokit,
  org,
  repoName,
  fullRepoName,
  daysSinceLastCommit,
  inactivityDays,
  defaultBranch,
}: {
  octokit: Octokit;
  org: string;
  repoName: string;
  fullRepoName: string;
  daysSinceLastCommit: number;
  inactivityDays: number;
  defaultBranch: string;
}): Promise<{ outcome?: MergeOutcome; error?: boolean }> {
  logger.info(`[Auto-Merge] Merging ${fullRepoName} (inactive for ${daysSinceLastCommit} days)`);

  try {
    const result = await mergeDefaultIntoMain({
      octokit,
      defaultBranch,
      owner: org,
      repo: repoName,
      inactivityDays,
    });
    return await handleMergeResult({
      octokit,
      result,
      org,
      repoName,
      fullRepoName,
      defaultBranch,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Base does not exist")) {
      // Main branch does not exist, likely inside a fork/QA-organization - create it and retry
      await createMainBranch({ octokit, org, repoName, defaultBranch });
      logger.info(`[Auto-Merge] Created main branch for ${fullRepoName}, retrying merge...`);
      return await attemptMerge({
        octokit,
        org,
        repoName,
        fullRepoName,
        daysSinceLastCommit,
        inactivityDays,
        defaultBranch,
      });
    }
    logger.error(`[Auto-Merge] Merge failed for ${fullRepoName}:`, { e: error });
    return { error: true };
  }
}

/**
 * Handle the result of a merge attempt
 */
async function handleMergeResult({
  octokit,
  result,
  org,
  repoName,
  fullRepoName,
  defaultBranch,
}: {
  octokit: Octokit;
  result: { status: number; sha?: string };
  org: string;
  repoName: string;
  fullRepoName: string;
  defaultBranch: string;
}): Promise<{ outcome: MergeOutcome }> {
  const outcome: MergeOutcome = {
    status: UP_TO_DATE,
    org,
    repo: repoName,
    defaultBranch,
  };

  if (result.status === 201) {
    logger.info(`[Auto-Merge] ✓ Merged ${fullRepoName} (SHA: ${result.sha})`);
    return {
      outcome: {
        ...outcome,
        status: "merged",
        sha: result.sha ?? "unknown",
      },
    };
  } else if (result.status === 204) {
    logger.info(`[Auto-Merge] ✓ ${fullRepoName} already up-to-date`);
    return { outcome: { ...outcome, status: UP_TO_DATE } };
  } else if (result.status === 409) {
    logger.info(`[Auto-Merge] ✗ Merge conflict in ${fullRepoName}`);
    await openPullRequest({ octokit, org, repoName, defaultBranch });
    return { outcome: { ...outcome, status: "conflict" } };
  }

  // Fallback for unexpected status codes
  return {
    outcome: {
      ...outcome,
      status: "skipped",
      reason: `Unexpected status: ${result.status}`,
    },
  };
}
