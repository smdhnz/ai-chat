# Built-in Image Generation Tool

This directory is adapted from the built-in `imagegen` skill in `openai/codex`.

In pi this skill is paired with the extension tool `imagegen` installed at `.pi/extensions/imagegen/index.ts` (project-local) or `~/.pi/agent/extensions/imagegen/index.ts` (global). The original Codex callable interface is recorded in:

`mcp-image_gen-tool.json`

The copied skill files retain the upstream layout:

- `SKILL.md`
- `agents/openai.yaml`
- `assets/`
- `references/`
- `scripts/`
- `LICENSE.txt`

Use `SKILL.md` as the primary instruction source. Use the pi tool `imagegen` for generation. Use `mcp-image_gen-tool.json` only as a local record of the original Codex built-in tool schema.
