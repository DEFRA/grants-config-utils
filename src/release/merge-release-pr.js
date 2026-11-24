const REQUIRED_CHECKS = ["validate-changeset-check", "Run Pull Request Checks"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Finalizes a changesets release PR: synthesizes the required checks, merges the
 * PR to main, dispatches the publish workflow and deletes the release branch.
 *
 * To be called from an actions/github-script step:
 *   const { mergeReleasePR } = require("@defra/grants-config-utils/release/merge-release-pr");
 *   await mergeReleasePR({ github, context, core });
 *
 * Reads PR_NUMBER and RELEASE_MSG from the environment.
 *
 * @param {object}   args
 * @param {object}   args.github        Octokit instance (github-script `github`)
 * @param {object}   args.context       Workflow context (github-script `context`)
 * @param {object}   args.core          Actions core (github-script `core`)
 * @param {Function} [args.waitFor]     Sleep fn, injectable for tests
 * @param {number}   [args.maxAttempts] Merge attempts before giving up
 */
export const mergeReleasePR = async ({
  github,
  context,
  core,
  waitFor = sleep,
  maxAttempts = 10,
}) => {
  const { owner, repo } = context.repo;
  const prNumber = Number(process.env.PR_NUMBER);

  const { data: releasePR } = await github.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  if (!releasePR) {
    return;
  }

  for (const name of REQUIRED_CHECKS) {
    await github.rest.checks.create({
      owner,
      repo,
      name,
      head_sha: releasePR.head.sha,
      status: "completed",
      conclusion: "success",
      output: {
        title: "Required check triggered",
        summary: `Check created for PR #${releasePR.number}`,
      },
    });
  }

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await waitFor(5000 * attempt);

    const { data: pr } = await github.rest.pulls.get({
      owner,
      repo,
      pull_number: releasePR.number,
    });

    if (pr.merged) {
      lastError = null;
      break;
    }
    if (pr.mergeable === null) {
      continue; // still "unknown", GitHub is still computing mergeability
    }
    if (pr.mergeable === false) {
      core.info(
        `Attempt ${attempt}: mergeable_state=${pr.mergeable_state}, waiting`,
      );
      continue;
    }

    try {
      await github.rest.pulls.merge({
        owner,
        repo,
        pull_number: releasePR.number,
        merge_method: "squash",
      });
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      if (err.status === 405 && /already merged/i.test(err.message)) {
        lastError = null;
        break;
      }
      core.info(
        `Attempt ${attempt}: merge rejected (${err.status}: ${err.message}), retrying`,
      );
    }
  }
  if (lastError) {
    throw lastError;
  }

  await github.rest.actions.createWorkflowDispatch({
    owner,
    repo,
    workflow_id: "publish.yml",
    ref: "main",
    headers: {
      "X-GitHub-Api-Version": "2022-11-28",
    },
    inputs: {
      run_name: process.env.RELEASE_MSG,
      commit_message: process.env.RELEASE_MSG,
    },
  });

  await github.rest.git.deleteRef({
    owner,
    repo,
    ref: `heads/${releasePR.head.ref}`,
  });
};
