# Run Code Block — VS Code Extension

Run any code block with a single click. Works in **source files** and **Markdown fenced code blocks**.

## Install

```bash
npm install
npm install -g @vscode/vsce
vsce package
code --install-extension run-code-block-*.vsix
# code --uninstall-extension reecepbcups.run-code-block
```

## Features

- **▶ Run buttons** appear above every code block via CodeLens — just click to execute
- **Keyboard shortcut** `Ctrl+Shift+R` (`Cmd+Shift+R` on Mac) runs the block at your cursor
- **Markdown support** — detects fenced code blocks (` ```python ... ``` `) and runs them with the right interpreter
- **Source file support** — offers "Run Entire File" plus individual sections separated by double blank lines
- **14 languages** supported out of the box: JavaScript, TypeScript, Python, Bash, Ruby, Go, Rust, Java, C, C++, PHP, Perl, Lua, R
- **Custom runners** — override the run command for any language in settings
- **Reusable terminal** — runs all output in a single terminal to avoid clutter

## Usage

### In Markdown files
Any fenced code block with a language tag gets a ▶ button:

````markdown
```python
print("Hello, world!")
```
````

### In source files
- A **▶ Run Entire File** button appears at the top
- Sections separated by **two or more blank lines** get individual ▶ buttons

### Keyboard shortcut
Place your cursor inside a code block and press `Ctrl+Shift+R` / `Cmd+Shift+R`.

## Settings

| Setting                        | Default | Description                                          |
| ------------------------------ | ------- | ---------------------------------------------------- |
| `runCodeBlock.showCodeLens`    | `true`  | Show ▶ Run buttons above code blocks                 |
| `runCodeBlock.reuseTerminal`   | `true`  | Reuse the same terminal for all runs                 |
| `runCodeBlock.customRunners`   | `{}`    | Override run commands per language (see below)        |

### Custom Runners

Add to your `settings.json`:

```json
{
  "runCodeBlock.customRunners": {
    "python": "python3.11 \"{file}\"",
    "javascript": "bun \"{file}\""
  }
}
```

Use `{file}` as a placeholder for the temporary file path.

## Requirements

You need the relevant language runtime installed on your system (e.g., `node`, `python3`, `go`, `gcc`, etc.).
