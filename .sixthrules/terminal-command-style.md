## Brief overview
- Project-specific rules for this repo’s workflow when running shell commands via Sixth tools.
- Primary goal: avoid zsh parse errors and keep commands copy/paste-safe.

## Command formatting
- Never use HTML-escaped operators like `&&` in commands.
- Always use literal shell operators, e.g. `&&` for chaining.
- Prefer simple, readable one-liners over heavily escaped strings.

## Shell compatibility
- Assume macOS with `/bin/zsh` as the default shell.
- Avoid syntax that depends on non-default shells unless explicitly requested.

## Tool usage expectations
- When using `execute_command`, provide commands exactly as they should be executed in the terminal (no HTML entity escaping).
- If a command needs chaining, use `&&` (or `;` when appropriate) and keep quoting minimal to reduce parsing issues.

## Error prevention
- If a command includes characters that are commonly escaped in other contexts (`&`, `<`, `>`), double-check they are not HTML-encoded before execution.
