# Coding Agent Final Audit

## Baseline

Repository: `shayanrasekhi777-eng/n8n-mcp`

Baseline branch: `main`

Upgrade branch: `feature/sovereign-coding-agent`

The existing project already has a substantial MCP server, n8n management layer, validation system, SQLite-backed node database, Docker support and a large automated-test surface.

## Added components

| Component | Purpose |
|---|---|
| `src/coding-agent/index.ts` | Autonomous coding engine |
| `src/coding-agent/cli.ts` | Command-line entrypoint |
| `tests/unit/coding-agent.test.ts` | Safety primitive tests |
| `docs/CODING_AGENT.md` | Usage and configuration |
| `docs/CODING_AGENT_FINAL_AUDIT.md` | Architecture/audit record |

## Agent loop

```text
Task
  ↓
Model decision
  ↓
read/search/write/run
  ↓
command/test feedback
  ↓
new model decision
  ↓
finish OR iteration budget
```

## Capability profile

- Project-local file inspection
- Recursive text search
- File creation and replacement
- Test/build command execution
- Iterative repair loop
- Configurable iteration budget
- Configurable command timeout
- Configurable output budget
- Dry-run mode
- Explicit model selection
- Workspace path confinement
- Secret-pattern redaction
- Explicit network/publishing opt-in

## Why this is not marketed as literally unlimited

No software can remove provider quotas, model context limits, memory, CPU, disk, operating-system permissions or network constraints. The implementation therefore removes arbitrary application-level restrictions where practical while keeping hard operational boundaries that prevent accidental data leakage or publication.

## Security posture

1. File paths cannot escape the configured workspace.
2. Common credential patterns are redacted before model feedback.
3. Network/publishing commands are opt-in.
4. Autonomous iteration is bounded.
5. Dry-run is available for inspection before writes.
6. Existing production MCP behavior is isolated on `main`.

## Verification status

The branch was created from `main` and the new source/tests/docs were committed there. The GitHub Actions API currently reports no workflow run for this branch, so a remote CI pass cannot honestly be claimed from the available integration. The next authoritative verification is:

```bash
npm install
npm run typecheck
npm run test:unit -- tests/unit/coding-agent.test.ts
npm run build
```

A green result from those commands should be treated as the release gate before merging.
