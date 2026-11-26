const REQUIRED_CHECKS = ["validate-changeset-check", "Run Pull Request Checks"];

const METHOD_NOT_ALLOWED = 405;
const SLEEP_TIME = 5000;
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
 * @param {object}   [args.dispatch]    Workflow to dispatch after merge
 *   ({ workflow_id, ref, inputs }); defaults to the main publish flow. The
 *   hotfix flow passes publish-hotfix.yml on the hotfix branch.
 */
export const mergeReleasePR = async ({
  github,
  context,
  core,
  waitFor = sleep,
  maxAttempts = 10,
  dispatch,
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

  await createChecks(github, owner, repo, releasePR);

  let merged = false;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts && !merged; attempt++) {
    await waitFor(SLEEP_TIME * attempt);
    const result = await attemptMerge(
      github,
      owner,
      repo,
      releasePR.number,
      core,
      attempt,
    );
    merged = result.merged;
    lastError = result.error ?? lastError;
  }

  if (!merged) {
    throw (
      lastError ??
      new Error(
        `Release PR #${releasePR.number} did not become mergeable after ${maxAttempts} attempts`,
      )
    );
  }

  const target = dispatch ?? {
    workflow_id: "publish.yml",
    ref: "main",
    inputs: {
      run_name: process.env.RELEASE_MSG,
      commit_message: process.env.RELEASE_MSG,
    },
  };

  await github.rest.actions.createWorkflowDispatch({
    owner,
    repo,
    workflow_id: target.workflow_id,
    ref: target.ref,
    headers: {
      "X-GitHub-Api-Version": "2022-11-28",
    },
    inputs: target.inputs,
  });

  await github.rest.git.deleteRef({
    owner,
    repo,
    ref: `heads/${releasePR.head.ref}`,
  });
};

/**
 * One polling attempt to merge the PR
 * @returns {Promise<{ merged: boolean, error?: Error }>}
 */
async function attemptMerge(github, owner, repo, pullNumber, core, attempt) {
  const { data: pr } = await github.rest.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
  });

  if (pr.merged) {
    return { merged: true };
  }
  if (pr.mergeable !== true) {
    // null = GitHub still computing mergeability; false = not mergeable yet
    core.info(
      `Attempt ${attempt}: mergeable_state=${pr.mergeable_state}, waiting`,
    );
    return { merged: false };
  }

  try {
    await github.rest.pulls.merge({
      owner,
      repo,
      pull_number: pullNumber,
      merge_method: "squash",
    });
    return { merged: true };
  } catch (err) {
    if (
      err.status === METHOD_NOT_ALLOWED &&
      /already merged/i.test(err.message)
    ) {
      return { merged: true };
    }
    core.info(
      `Attempt ${attempt}: merge rejected (${err.status}: ${err.message}), retrying`,
    );
    return { merged: false, error: err };
  }
}

async function createChecks(github, owner, repo, releasePR) {
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
}
