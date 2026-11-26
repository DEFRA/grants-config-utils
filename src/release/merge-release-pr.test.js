import { mergeReleasePR } from "./merge-release-pr.js";

const noWait = () => Promise.resolve();
const context = { repo: { owner: "defra", repo: "grants-config-playground" } };
const core = { info: vi.fn() };
const releasePR = {
  number: 42,
  head: { sha: "abc123", ref: "changeset-release/main" },
};

// Fake Octokit whose pulls.get returns a scripted sequence of PR states
// (reproducing GitHub settling mergeability), and whose pulls.merge runs a
// scripted behaviour (reproducing the ruleset rejecting an early merge).
const makeGithub = ({ getStates, mergeImpl = () => ({}) }) => {
  let i = 0;
  const states = [{ data: releasePR }, ...getStates.map((data) => ({ data }))];
  return {
    rest: {
      pulls: {
        get: vi.fn(async () => states[Math.min(i++, states.length - 1)]),
        merge: vi.fn(async () => mergeImpl()),
      },
      checks: { create: vi.fn(async () => ({})) },
      actions: { createWorkflowDispatch: vi.fn(async () => ({})) },
      git: { deleteRef: vi.fn(async () => ({})) },
    },
  };
};

const rejected = (status, message) => () => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

beforeEach(() => {
  process.env.PR_NUMBER = String(releasePR.number);
  process.env.RELEASE_MSG = "Create new config version #patch";
});

describe("mergeReleasePR", () => {
  it("returns early without side effects if the release PR is not found", async () => {
    const github = {
      rest: {
        pulls: {
          get: vi.fn(async () => ({ data: undefined })),
          merge: vi.fn(),
        },
        checks: { create: vi.fn() },
        actions: { createWorkflowDispatch: vi.fn() },
        git: { deleteRef: vi.fn() },
      },
    };

    await mergeReleasePR({ github, context, core, waitFor: noWait });

    expect(github.rest.checks.create).not.toHaveBeenCalled();
    expect(github.rest.pulls.merge).not.toHaveBeenCalled();
    expect(github.rest.actions.createWorkflowDispatch).not.toHaveBeenCalled();
    expect(github.rest.git.deleteRef).not.toHaveBeenCalled();
  });

  it("creates both required checks before merging", async () => {
    const github = makeGithub({
      getStates: [{ merged: false, mergeable: true }],
    });

    await mergeReleasePR({ github, context, core, waitFor: noWait });

    expect(github.rest.checks.create).toHaveBeenCalledTimes(2);
    expect(github.rest.checks.create.mock.calls.map((c) => c[0].name)).toEqual([
      "validate-changeset-check",
      "Run Pull Request Checks",
    ]);
  });

  it("waits out mergeable:null (unknown) then merges once settled", async () => {
    const github = makeGithub({
      getStates: [
        { merged: false, mergeable: null },
        { merged: false, mergeable: null },
        { merged: false, mergeable: true, mergeable_state: "clean" },
      ],
    });

    await mergeReleasePR({ github, context, core, waitFor: noWait });

    expect(github.rest.pulls.merge).toHaveBeenCalledTimes(1);
  });

  it("retries when the ruleset rejects the merge, then succeeds", async () => {
    let attempt = 0;
    const github = makeGithub({
      getStates: [
        { merged: false, mergeable: true, mergeable_state: "blocked" },
      ],
      mergeImpl: () => {
        if (attempt++ === 0) {
          const err = new Error("Required status check is expected");
          err.status = 422;
          throw err;
        }
        return {};
      },
    });

    await mergeReleasePR({ github, context, core, waitFor: noWait });

    expect(github.rest.pulls.merge).toHaveBeenCalledTimes(2);
  });

  it("treats already-merged (405) as success without throwing", async () => {
    const github = makeGithub({
      getStates: [{ merged: false, mergeable: true }],
      mergeImpl: rejected(405, "Pull Request is already merged"),
    });

    await expect(
      mergeReleasePR({ github, context, core, waitFor: noWait }),
    ).resolves.toBeUndefined();
  });

  it("short-circuits without merging if the PR is already merged", async () => {
    const github = makeGithub({
      getStates: [{ merged: true }],
      mergeImpl: rejected(500, "should not be called"),
    });

    await mergeReleasePR({ github, context, core, waitFor: noWait });

    expect(github.rest.pulls.merge).not.toHaveBeenCalled();
  });

  it("dispatches publish and deletes the branch only after a successful merge", async () => {
    const github = makeGithub({
      getStates: [{ merged: false, mergeable: true }],
    });

    await mergeReleasePR({ github, context, core, waitFor: noWait });

    expect(github.rest.actions.createWorkflowDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ workflow_id: "publish.yml", ref: "main" }),
    );
    expect(github.rest.git.deleteRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: "heads/changeset-release/main" }),
    );
  });

  it("dispatches a custom workflow when a dispatch override is given (hotfix)", async () => {
    const github = makeGithub({
      getStates: [{ merged: false, mergeable: true }],
    });
    const dispatch = {
      workflow_id: "publish-hotfix.yml",
      ref: "hotfix-urgent",
      inputs: { description: "Create new hotfix config version #patch" },
    };

    await mergeReleasePR({ github, context, core, waitFor: noWait, dispatch });

    expect(github.rest.actions.createWorkflowDispatch).toHaveBeenCalledWith(
      expect.objectContaining(dispatch),
    );
  });

  it("throws and skips dispatch if the PR never becomes mergeable", async () => {
    const github = makeGithub({
      getStates: [
        { merged: false, mergeable: false, mergeable_state: "blocked" },
      ],
      mergeImpl: rejected(500, "merge should not be attempted"),
    });

    await expect(
      mergeReleasePR({
        github,
        context,
        core,
        waitFor: noWait,
        maxAttempts: 3,
      }),
    ).rejects.toThrow();
    expect(github.rest.pulls.merge).not.toHaveBeenCalled();
    expect(github.rest.actions.createWorkflowDispatch).not.toHaveBeenCalled();
    expect(github.rest.git.deleteRef).not.toHaveBeenCalled();
  });

  it("throws the last error and skips dispatch after exhausting attempts", async () => {
    const github = makeGithub({
      getStates: [
        { merged: false, mergeable: true, mergeable_state: "blocked" },
      ],
      mergeImpl: rejected(422, "ruleset violation"),
    });

    await expect(
      mergeReleasePR({
        github,
        context,
        core,
        waitFor: noWait,
        maxAttempts: 3,
      }),
    ).rejects.toThrow("ruleset violation");
    expect(github.rest.pulls.merge).toHaveBeenCalledTimes(3);
    expect(github.rest.actions.createWorkflowDispatch).not.toHaveBeenCalled();
  });
});
