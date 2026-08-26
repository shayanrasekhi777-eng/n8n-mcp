# Coding Agent

The repository now includes a local autonomous coding engine under `src/coding-agent`.

## What it does

The agent can repeatedly:

1. inspect source files
2. search the workspace
3. write complete files
4. run tests/build commands
5. use command output as feedback
6. continue until it returns a `finish` action or reaches the iteration budget

This is intentionally separate from the n8n documentation database. The existing MCP server remains unchanged on the default branch.

## Install/build

```bash
npm install
npm run build
```

## Configure

Set an API key and an explicit model supported by your provider:

```bash
export OPENAI_API_KEY='...'
export CODING_AGENT_MODEL='your-model-id'
```

The model name is deliberately not hard-coded because provider/model availability changes and a fake default is worse than an explicit configuration error.

## Run

```bash
npm run coding-agent -- \
  --workspace ./my-project \
  --task "Fix the failing TypeScript tests and improve error handling"
```

Dry run:

```bash
npm run coding-agent -- \
  --workspace ./my-project \
  --task "Refactor the authentication module" \
  --dry-run
```

Useful controls:

- `--max-iterations 20`
- `--timeout-ms 120000`
- `--max-output 50000`
- `--model <model-id>`

## Network/publishing policy

Local reads, writes and test commands are supported. Network/publishing commands such as `curl`, `wget`, `npm publish`, `npm login` and `git push` are blocked unless:

```bash
export CODING_AGENT_ALLOW_NETWORK=true
```

This prevents an autonomous loop from accidentally turning a coding task into a deployment or publication task. Humans have somehow survived this long by requiring one extra confirmation click.

## Workspace boundary

File operations are constrained to the configured workspace. Path traversal such as `../secret` is rejected.

## Secrets

Common API-key, token, password and GitHub-token patterns are redacted from command output before they are returned to the model.

## Testing

The safety primitives have unit coverage in:

```text
tests/unit/coding-agent.test.ts
```

Run them with:

```bash
npm run test:unit -- tests/unit/coding-agent.test.ts
```

## Important limitation

The agent is an execution engine, not an unlimited intelligence source. Context windows, model quotas, CPU, memory, command timeouts and provider limits still exist. The design removes unnecessary application-level restrictions while keeping explicit boundaries around workspace traversal, secrets and network publication.
