# Contributing

## Coding Standard

- The code needs to adhere to the [Defra JavaScript Standards](https://defra.github.io/software-development-standards/standards/javascript_standards/)
- Use [neostandard](https://github.com/neostandard/neostandard) to lint your code

## Commit Messages

Use [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/).

By default, a commit into the trunk will cause a `minor` version increment. If you need either a `major` or `patch` version, append `#major` or `#patch` to the commit message.

## Making changes

Install [pre-commit](https://pre-commit.com/), as it is used to scan commits for secrets using [Gitleaks](https://github.com/gitleaks/gitleaks).

To make changes to this library, please follow the steps below:
1. Make the changes as usual to the codebase. Ensure your changes are exported via the index.js file!
2. Run `npm run version:create` OR `npx @changesets/cli` to create a changeset file. This will guide you through the process of documenting your changes.`
3. Ensure the changeset .md file is added to the commit (should be done automatically now).
4. Push to branch, and create a pull request.
5. Github actions will verify the build
6. After review, merge the pull request.
7. Github action will automatically increment the version and publish to NPM.

