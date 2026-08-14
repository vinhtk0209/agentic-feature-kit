# P17-021 Control Panel RBAC Input Evidence

Date: 2026-08-14
Task: P17-021 — Distributed Control Panel UI and Remote Operations Console
Evidence tier: input/architecture contract only
Verdict: GREEN proposal checkpoint; implementation remains blocked

## Scope and safety boundary

This checkpoint defines the operator decision required for the P17-021 RBAC and
separation-of-duties readiness item. It adds no dashboard route, database migration, test identity,
Control Plane mutation, worker enrollment, remote execution, sync, deployment, publication, or push.

The 2026-08-14 kit and dashboard backups were verified before the scope opened:

- kit snapshot: 20,014,415 bytes;
- dashboard snapshot: 5,431,899 bytes; and
- both git worktrees were clean before proposal changes.

## Authoritative reconciliation

The canonical task remains `backlog`, `readiness.complete=false`, with all ten missing inputs. It
still depends on P17-014, P17-015, and P17-016.

Current dashboard authorization was inspected directly:

- `src/lib/rbac.ts` resolves one global role by email and applies a numeric rank;
- `migrations/0005_user_roles.sql` keys global role rows by email and has no tenant/resource scope;
- `src/app/api/roles/route.ts` and migration 0008 provide guarded, audited global role management;
- current roles are viewer, operator, admin, and env-pinned super admin; and
- there is no dedicated approver, self-approval rule, action/resource capability matrix, or
  tenant-scoped decision contract.

This evidence supports the gap; it does not claim the existing RBAC is defective for its current
local-admin purpose.

## Proposed contract

ADR-004 recommends the exact `I1/A1/S1/M1/D1/B1/U1/E1` choice set:

- stable verified subject UUID and server-resolved tenant membership;
- additive tenant/resource capability bindings instead of Control Panel role-rank inheritance;
- distinct requester and approver, material-hash-bound approval, and new approval per retry;
- an exact viewer/operator/approver/administrator action matrix;
- atomic CAS plus decision, audit, idempotency, accepted mutation, and outbox persistence;
- dual-signer, 15-minute, cancel/revoke-only break-glass;
- server-authoritative available actions and closed UI reason states; and
- synthetic two-tenant, six-subject browser identities with a real network-separated disposable
  worker for release E2E.

Recommended operator statement:

`APPROVE P17-021 RBAC v1: identity=I1, authz=A1, duties=S1, matrix=M1, decision=D1, breakglass=B1, ui=U1, e2e=E1.`

Approval removes only the named RBAC readiness gap. It cannot make P17-021 ready while its other
dependencies and inputs remain incomplete.

## Files in the proposal checkpoint

- `docs/design/adr-004-control-panel-rbac-action-governance.md`
- `scripts/post-17-control-panel-rbac.test.ts`
- `package.json`
- `docs/evidence/post-17-control-panel-rbac-input-2026-08-14.md`

## Focused proof

`npm run test:post-17-control-panel-rbac`

```text
post-17-control-panel-rbac.test: PASS (21 sections, I1/A1/S1/M1/D1/B1/U1/E1 proposed, P17-021 still has 10 gaps)
```

Companion contract proof:

```text
post-17-roadmap.test: PASS (22 tasks, 4 initiatives)
post-17-control-plane-topology.test: PASS (21 sections, T1/M1/X1/R1/E1/S1 proposed, P17-014 still input-blocked)
post-17-privacy-decision.test: PASS (16 sections, 5 data classes, T1/R1/C1/L1/E1 proposed, P17-016 still input-blocked)
package-json: PASS
git diff --check: exit 0
```

The bounded secret scan used the same regular expression against a known-positive synthetic string
and the exact proposal files. Result:

```text
SECRET_SCAN_POSITIVE_CONTROL=1
SECRET_SCAN_HITS=0
```

## Full regression proof

`npm run test:kit`

```text
exit code: 0
elapsed: 217.6 seconds
new RBAC validator: PASS in the registered full-suite chain
version: v3.25 stamps agree
feature index: in sync
lesson annotations: 60/60 paired
```

The emitted `verify_records` messages are existing simulated test-path warnings inside the suite;
the command exited zero and no live verification or sync action was performed.

## Browser and external-evidence boundary

No browser run is claimed for this checkpoint because no production UI or runtime route changed.
Browser evidence becomes mandatory only after the information architecture, identities, Control
Plane, privacy, evidence adapter, worker, and E2E topology inputs are accepted and implemented.

No external credentials were read or displayed. No external database, identity provider, target
repository, remote worker, sync target, or Git remote was changed.

## Remaining gate

P17-021 remains input-blocked. The immediate next decision is explicit operator acceptance or
replacement of `I1/A1/S1/M1/D1/B1/U1/E1`. Even after acceptance, nine other canonical gaps remain
unless separately completed and evidenced.
