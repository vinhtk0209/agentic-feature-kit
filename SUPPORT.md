# Support

Agentic Feature Kit is a self-managed developer toolkit, not a hosted service. Use the route below
that matches the request and provide only sanitized, reproducible evidence.

## Choose the right route

- Reproducible defects: open the repository **bug report form**.
- Bounded capability proposals: open the repository **feature request form**.
- Vulnerabilities or sensitive findings: use
  [GitHub Private Vulnerability Reporting](https://github.com/vinhtk0209/agentic-feature-kit/security/advisories/new)
  and follow the [security policy](SECURITY.md).
- Contribution process questions: review [CONTRIBUTING.md](CONTRIBUTING.md) before opening a feature
  request.

Do not put a vulnerability, credential, private specification, customer data, or sensitive log in a
public issue.

## Reproduction evidence

A useful report identifies:

- the exact kit, provider bundle, and shared-core versions;
- provider surface, operating system, Node version, and install method;
- the smallest synthetic input that reproduces the behavior;
- expected and actual results;
- exact commands and sanitized output;
- whether generated artifacts, external services, or credentials were involved.

Evidence should be sufficient to repeat the failure without access to a private repository. A
screenshot or success statement alone is not a complete reproduction.

## Supported questions

Public support covers documented local installation, provider discovery, shared-core contracts,
deterministic bundle verification, and reproducible behavior on declared runtimes. Maintainers may
ask for a smaller fixture before investigating a repository-specific report.

## Unsupported use cases

The project does not provide:

- a hosted runtime, managed control plane, or production operations service;
- custom project credentials, authentication refresh flows, or private source access;
- guaranteed compatibility with every framework, provider feature, marketplace, or enterprise
  topology;
- recovery of modified generated bundles or direct edits to installed provider directories;
- legal, compliance, security certification, or incident-response services.

## Service boundary

There is no support SLA. Responses, prioritization, fixes, backports, and release timing are
best-effort and depend on reproducibility, impact, project scope, and maintainer capacity.

Opening an issue does not authorize external writes, provider execution, database access, sync,
publication, a release, or a compatibility change.
