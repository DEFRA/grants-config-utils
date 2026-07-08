# grants-config-utils

Shared utilities for validating, reading, transforming, and publishing grants configuration.

## Language

**Grant configuration**
The files that define a grant journey, release metadata, or integration payload.
_Avoid_: Application state, User answers, Runtime settings

**Configuration utility**
A reusable helper for configuration repositories or the config broker.
_Avoid_: Service feature, CLI command unless it is directly executable

**Manifest**
The list of configuration file paths that make up a release.
_Avoid_: Sitemap, Package lock, Index page

**Version**
The release identifier for a configuration package or grant configuration.
_Avoid_: Build number, Commit SHA, Timestamp

**Status**
The release state for a version, such as `draft` or `active`.
_Avoid_: Application status, HTTP status, Test status

**Validation**
Checks that configuration is structurally correct before it is published or consumed.
_Avoid_: User input validation, Browser validation, Linting unless referring to code style

**Changeset**
The release note/version marker required when changing the published package contract.
_Avoid_: Changelog entry when the `.changeset` file is meant, Commit message
