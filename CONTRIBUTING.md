# Contributing

## Coding Standards

- The code needs to adhere to the [Defra JavaScript Standards](https://defra.github.io/software-development-standards/standards/javascript_standards/)
- Use [neostandard](https://github.com/neostandard/neostandard) to lint your code

## Commit Messages

Use [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/).

## Making changes

To make changes to this library, please follow the steps below:

1. Make the changes as usual to the codebase. Ensure your changes are exported in package.json!
2. Run `npm run version:create`. This will guide you through the process of documenting your changes.
3. Ensure the changeset .md file is added to the commit.
4. Push to branch, and create a pull request.
5. Github actions will verify the build
6. After review, merge the pull request.
7. A second PR will be created by the release action.
8. Merge this PR
9. Github actions will automatically increment the version and publish to NPM.
