# Security Policy

Agentic Feature Kit handles repository context, local commands, evidence, and optional provider or
source integrations. Please report vulnerabilities privately so they can be investigated without
exposing users, credentials, or private specifications.

## Supported versions

Before the first public release, only the current default branch is considered for best-effort
security fixes. Historical tags, extracted preview bundles, and unmerged branches are not supported
release lines.

After a public release exists, this table will identify supported release lines and their end dates.
Until then, source availability and a package version do not imply production support.

## Report a vulnerability

Use [GitHub Private Vulnerability Reporting](https://github.com/vinhtk0209/agentic-feature-kit/security/advisories/new).
Do not use a public issue, pull request, discussion, or commit comment for a suspected vulnerability.

If the private advisory form is unavailable, avoid public disclosure and retry after confirming you
are signed in to GitHub. The project does not publish a personal or corporate reporting address.

## What to include

Provide the minimum information needed to reproduce and assess the issue:

- affected commit, package, provider bundle, and version if known;
- operating system, Node version, and relevant provider surface;
- a minimal synthetic reproduction and expected versus observed behavior;
- impact, preconditions, and whether the issue is already public;
- sanitized logs or evidence hashes when useful.

Do not include credentials, access tokens, private specifications, customer data, raw logs, or
unnecessary personal data. Replace sensitive values with synthetic placeholders and describe the
redaction.

## Safe harbor

Good-faith research intended to improve this project is welcome when it:

- avoids privacy violations, service disruption, data destruction, and persistence;
- uses only accounts, repositories, and systems you are authorized to test;
- stops after obtaining enough evidence to demonstrate the issue;
- reports privately and allows reasonable coordination before disclosure.

This statement does not authorize testing third-party providers or systems and is not legal advice.

## Response and disclosure

The project aims to acknowledge a complete report within three business days and provide an initial
triage update within seven business days. These targets are best-effort and create no service-level agreement.
Complexity, maintainer availability, and third-party coordination may change timing.

The reporter and maintainers should agree on a disclosure plan appropriate to impact and remediation
availability. Credit is offered when requested and safe. Public disclosure must exclude secrets,
private specifications, affected-user data, and operational details that remain unsafe to release.

Security fixes still require scoped review, tests, evidence, and release authorization. A private
report does not authorize a direct push, publication, tag, provider action, or credential use.
