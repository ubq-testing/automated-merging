import { runAutoMerge } from "./main";
import { logger, parseOrgs, requireEnv } from "./utils";

async function main(): Promise<void> {
  const appId = requireEnv("APP_ID");
  const privateKey = requireEnv("APP_PRIVATE_KEY");
  const orgs = parseOrgs(requireEnv("TARGET_ORGS"));
  const inactivityDaysRaw = process.env.INACTIVITY_DAYS;
  const inactivityDays = inactivityDaysRaw ? Number.parseInt(inactivityDaysRaw, 10) : undefined;

  const result = await runAutoMerge({ appId, privateKey, orgs, inactivityDays });

  for (const o of result.outcomes) {
    switch (o.status) {
      case "merged":
        logger.info(`✅ ${o.org}/${o.repo}: merged ${o.defaultBranch} into main (${o.sha}).`);
        break;
      case "up-to-date":
        logger.info(`ℹ️  ${o.org}/${o.repo}: main already contains ${o.defaultBranch}.`);
        break;
      case "conflict":
        logger.info(`⚠️  ${o.org}/${o.repo}: merge conflict detected.`);
        break;
      case "skipped":
        logger.info(`⏭️  ${o.org}/${o.repo}: ${o.reason}.`);
        break;
    }
  }

  if (result.errors > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("❌ Unhandled error", err);
  process.exitCode = 1;
});
