import * as vscode from 'vscode';

// ─── Language Runners ────────────────────────────────────────────────
interface RunnerConfig {
  /** Command template. {file} is replaced with the temp file path. */
  command: string;
  /** File extension for the temp file (with dot). */
  ext: string;
}

const RUNNERS: Record<string, RunnerConfig> = {
  javascript:   { command: 'node "{file}"',            ext: '.js'   },
  typescript:   { command: 'npx ts-node "{file}"',     ext: '.ts'   },
  python:       { command: 'python3 "{file}"',         ext: '.py'   },
  shellscript:  { command: 'bash "{file}"',            ext: '.sh'   },
  ruby:         { command: 'ruby "{file}"',            ext: '.rb'   },
  go:           { command: 'go run "{file}"',          ext: '.go'   },
  rust:         { command: 'rustc "{file}" -o "{file}.out" && "{file}.out"', ext: '.rs' },
  java:         { command: 'java "{file}"',            ext: '.java' },
  c:            { command: 'gcc "{file}" -o "{file}.out" && "{file}.out"',   ext: '.c'  },
  cpp:          { command: 'g++ "{file}" -o "{file}.out" && "{file}.out"',   ext: '.cpp' },
  php:          { command: 'php "{file}"',             ext: '.php'  },
  perl:         { command: 'perl "{file}"',            ext: '.pl'   },
  lua:          { command: 'lua "{file}"',             ext: '.lua'  },
  r:            { command: 'Rscript "{file}"',         ext: '.R'    },
};

// ─── Helpers ─────────────────────────────────────────────────────────

/** Detect the language of a fenced code block in Markdown (```lang). */
function detectMarkdownLang(line: string): string | undefined {
  const match = line.match(/^```(\w+)/);
  return match ? match[1].toLowerCase() : undefined;
}

/** Map common language aliases to VS Code language IDs. */
function normalizeLangId(lang: string): string {
  const aliases: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    sh: 'shellscript',
    bash: 'shellscript',
    zsh: 'shellscript',
    rb: 'ruby',
    rs: 'rust',
    'c++': 'cpp',
    cxx: 'cpp',
  };
  return aliases[lang] ?? lang;
}

// ─── Block Detection ─────────────────────────────────────────────────

interface CodeBlock {
  /** 0-indexed start line of the block content (exclusive of delimiters). */
  startLine: number;
  /** 0-indexed end line (inclusive). */
  endLine: number;
  /** Language ID for running. */
  languageId: string;
  /** The actual code text. */
  code: string;
  /** The line where the ▶ button / codelens should appear (the opening delimiter). */
  lensLine: number;
}

/**
 * Find all runnable code blocks in a document.
 *
 * For Markdown files  → fenced code blocks (``` ... ```)
 * For source files    → contiguous non-empty "sections" separated by blank lines,
 *                        or the whole file as one block, depending on heuristic.
 */
function findCodeBlocks(document: vscode.TextDocument): CodeBlock[] {
  if (document.languageId === 'markdown') {
    return findMarkdownBlocks(document);
  }
  return findSourceBlocks(document);
}

function findMarkdownBlocks(document: vscode.TextDocument): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  let i = 0;
  while (i < document.lineCount) {
    const lineText = document.lineAt(i).text;
    if (/^```\w+/.test(lineText)) {
      const rawLang = detectMarkdownLang(lineText) ?? 'shellscript';
      const languageId = normalizeLangId(rawLang);
      const lensLine = i;
      const startLine = i + 1;
      i++;
      // Find closing ```
      while (i < document.lineCount && !document.lineAt(i).text.startsWith('```')) {
        i++;
      }
      const endLine = i - 1;
      if (endLine >= startLine && RUNNERS[languageId]) {
        const lines: string[] = [];
        for (let l = startLine; l <= endLine; l++) {
          lines.push(document.lineAt(l).text);
        }
        blocks.push({ startLine, endLine, languageId, code: lines.join('\n'), lensLine });
      }
    }
    i++;
  }
  return blocks;
}

function findSourceBlocks(document: vscode.TextDocument): CodeBlock[] {
  // For a regular source file, treat the entire file as one block
  // AND additionally find "sections" delimited by double blank lines.
  const languageId = document.languageId;
  if (!RUNNERS[languageId]) {
    return [];
  }

  const blocks: CodeBlock[] = [];

  // Strategy: split by lines that are "## section separators"
  // (two or more consecutive blank lines). If there is only one section, return the whole file.
  const sections: { start: number; end: number }[] = [];
  let sectionStart: number | null = null;

  for (let i = 0; i < document.lineCount; i++) {
    const isEmpty = document.lineAt(i).isEmptyOrWhitespace;
    if (!isEmpty) {
      if (sectionStart === null) {
        sectionStart = i;
      }
    } else if (sectionStart !== null) {
      // Check if there are 2+ blank lines in a row -> section break
      let blankCount = 0;
      let j = i;
      while (j < document.lineCount && document.lineAt(j).isEmptyOrWhitespace) {
        blankCount++;
        j++;
      }
      if (blankCount >= 2) {
        sections.push({ start: sectionStart, end: i - 1 });
        sectionStart = null;
        i = j - 1; // skip blanks
      }
    }
  }
  if (sectionStart !== null) {
    sections.push({ start: sectionStart, end: document.lineCount - 1 });
  }

  // Always include the whole file as the first block
  const fullCode: string[] = [];
  for (let i = 0; i < document.lineCount; i++) {
    fullCode.push(document.lineAt(i).text);
  }
  blocks.push({
    startLine: 0,
    endLine: document.lineCount - 1,
    languageId,
    code: fullCode.join('\n'),
    lensLine: 0,
  });

  // If there are multiple sections, add each as its own block too
  if (sections.length > 1) {
    for (const sec of sections) {
      const lines: string[] = [];
      for (let l = sec.start; l <= sec.end; l++) {
        lines.push(document.lineAt(l).text);
      }
      blocks.push({
        startLine: sec.start,
        endLine: sec.end,
        languageId,
        code: lines.join('\n'),
        lensLine: sec.start,
      });
    }
  }

  return blocks;
}

// ─── Terminal Runner ─────────────────────────────────────────────────

let sharedTerminal: vscode.Terminal | undefined;

function getTerminal(): vscode.Terminal {
  const config = vscode.workspace.getConfiguration('runCodeBlock');
  const reuse = config.get<boolean>('reuseTerminal', true);

  // Prefer the user's currently active terminal so env vars / context are preserved
  if (reuse && vscode.window.activeTerminal) {
    return vscode.window.activeTerminal;
  }

  if (reuse && sharedTerminal && vscode.window.terminals.includes(sharedTerminal)) {
    return sharedTerminal;
  }

  sharedTerminal = vscode.window.createTerminal('Run Code Block');
  return sharedTerminal;
}

async function runBlock(block: CodeBlock): Promise<void> {
  const terminal = getTerminal();
  terminal.show(true);
  // Wrap in { } so bash treats multiline code as one compound command
  terminal.sendText(`{ ${block.code}\n}`);
}

// ─── CodeLens Provider ───────────────────────────────────────────────

class RunBlockCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const config = vscode.workspace.getConfiguration('runCodeBlock');
    if (!config.get<boolean>('showCodeLens', true)) {
      return [];
    }

    const blocks = findCodeBlocks(document);
    return blocks.map((block, index) => {
      const range = new vscode.Range(block.lensLine, 0, block.lensLine, 0);
      const isWholeFile = block.startLine === 0 && block.endLine === document.lineCount - 1 && document.languageId !== 'markdown';
      const title = isWholeFile
        ? '▶ Run Entire File'
        : block.startLine === block.endLine
          ? `▶ Run Block (line ${block.startLine + 1})`
          : `▶ Run Block (lines ${block.startLine + 1}–${block.endLine + 1})`;

      return new vscode.CodeLens(range, {
        title,
        command: 'runCodeBlock.run',
        arguments: [block],
      });
    });
  }
}

// ─── Extension Activation ────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  const codeLensProvider = new RunBlockCodeLensProvider();

  // Register CodeLens for all supported languages + markdown
  const languages = [...Object.keys(RUNNERS), 'markdown'];
  for (const lang of languages) {
    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider({ language: lang }, codeLensProvider)
    );
  }

  // Command: Run a specific block (called from CodeLens)
  context.subscriptions.push(
    vscode.commands.registerCommand('runCodeBlock.run', (block?: CodeBlock) => {
      if (block) {
        runBlock(block);
      }
    })
  );

  // Command: Run block at cursor position
  context.subscriptions.push(
    vscode.commands.registerCommand('runCodeBlock.runAtCursor', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }

      const cursorLine = editor.selection.active.line;
      const blocks = findCodeBlocks(editor.document);

      // Find the block that contains the cursor
      const block = blocks.find(
        (b) => cursorLine >= (b.lensLine) && cursorLine <= b.endLine
      );

      if (block) {
        runBlock(block);
      } else {
        vscode.window.showInformationMessage('No runnable code block found at cursor position.');
      }
    })
  );

  // Refresh CodeLens when config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('runCodeBlock')) {
        codeLensProvider.refresh();
      }
    })
  );

  // Clean up terminal reference
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((terminal) => {
      if (terminal === sharedTerminal) {
        sharedTerminal = undefined;
      }
    })
  );
}

export function deactivate() {
  sharedTerminal?.dispose();
}
