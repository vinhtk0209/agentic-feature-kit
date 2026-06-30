# Discovery Subagent Protocol

Reusable contract for offloading **heavy, read-only discovery** to a subagent so the
main context stays lean. The main thread keeps the *decision*; the agent does the
*crawling* and returns only a compact, structured report — never raw file dumps.

## When to delegate

Delegate only when discovery is **large** — e.g. a reuse survey across many shared
components, or a symbol search whose result set is wide. For a quick lookup (one or two
files, a single grep) do it inline; spawning an agent costs more than it saves.

Rule of thumb: delegate if you expect to read **> ~8 files** or **> ~400 lines** to answer.

## Contract (what the agent MUST and MUST NOT do)

- **Read-only.** The agent never writes, edits, or runs build/test. Tools: search + read only.
- **Return a report, not transcripts.** No pasted file bodies. Quote at most the minimal
  signature/snippet (≤ 5 lines) needed to judge fit.
- **Hard cap the output** at ~40 lines. If more candidates exist, rank and keep the top ones,
  then note "+N more (not shown)".
- **Cite paths** as `path:line` so the main thread can open anything worth a closer look.
- **No recommendations beyond fit.** State what exists and how well it matches; the main
  thread decides reuse vs. build.

## Agent invocation template

> Substitute `{{CONCEPT}}` (the feature concept / symbols being searched), `{{SHARED_PATH}}`
> (e.g. `PROJECT_CTX.shared_components_path` such as `src/generic/`), and `{{HAS_CODEGRAPH}}`
> (true if the CodeGraph MCP is available in this repo) before spawning.

```
Agent({
  description: "Reuse survey — {{CONCEPT}}",
  subagent_type: "Explore",
  prompt: """
    You are a READ-ONLY discovery agent. Do NOT write, edit, or run any build/test command.

    GOAL: find existing components/utilities reusable for: {{CONCEPT}}

    SEARCH STRATEGY (in order):
    - If {{HAS_CODEGRAPH}} is true: use the CodeGraph MCP first —
      `codegraph_explore "{{CONCEPT}}"` then `codegraph query "Table|List|Toolbar|Modal|Form|..."`.
      It indexes every symbol (higher recall than name-grep) and shows callers, so you can
      judge real fit and usage.
    - Otherwise (or to corroborate): grep {{SHARED_PATH}} for matching component/util names.

    RETURN — a single compact report, ≤ 40 lines, in exactly this shape. No file dumps.

      ## Reuse candidates — {{CONCEPT}}
      <ComponentName> — path:line
        fits: <one line: what it does + how it matches the concept>
        used by: <N callers, or "none found"> (only if CodeGraph available)
        gap: <what the feature needs that it lacks, or "none">
      ... (rank by fit; top candidates only; if more exist add "+N more (not shown)")

      ## Verdict
      <1–2 lines: strongest reuse option, or "no close match — custom component justified">
  """
})
```

## After the agent returns

Use the report to fill the **`src/generic/ Reuse`** section of the B6.5 Design Review.
If the verdict is "no close match", carry its one-line justification into that section.
Do **not** re-crawl what the agent already covered — trust the report; open a cited
`path:line` only if you need to confirm a specific detail before deciding.
