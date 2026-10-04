/**
 * Annotate server — source code opted in through `codeExtensions`.
 *
 * Guards the contract the editor's single code block runs on: /api/plan and
 * /api/doc?doc=1 must say `renderAs: "code"` plus `codeLanguage` and serve the
 * file's RAW text. Also pins what must NOT change: with no `codeExtensions`
 * nothing is accepted that was not before, a code-file link inside a document
 * (no `doc=1`) keeps the popout, `markdownExtensions` alone still renders as
 * markdown, `.env` can never be registered, and the 2MB cap still applies.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "os";
import { join } from "path";
import { startAnnotateServer } from "./annotate";
import { resolveAnnotateTarget } from "../../apps/hook/server/annotate-resolution";
import { MAX_ANNOTATABLE_FILE_BYTES } from "@plannotator/shared/resolve-file";
import { resetMarkdownExtensionsCache } from "../shared/markdown-extensions";

const MINIMAL_HTML = "<html><body>Plannotator</body></html>";
const CSHARP = "namespace Demo;\n\npublic class DateParser\n{\n    public int Year => 2026;\n}\n";
const SHELL = "#!/usr/bin/env bash\necho \"deploy\"\n";

let dir: string;
let dataDir: string;
let savedPort: string | undefined;
let savedRemote: string | undefined;
let savedDataDir: string | undefined;
let savedHistory: string | undefined;

function writeConfig(config: Record<string, unknown>) {
  writeFileSync(join(dataDir, "config.json"), JSON.stringify(config));
  resetMarkdownExtensionsCache();
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pn-code-"));
  dataDir = mkdtempSync(join(tmpdir(), "pn-code-data-"));
  savedPort = process.env.PLANNOTATOR_PORT;
  savedRemote = process.env.PLANNOTATOR_REMOTE;
  savedDataDir = process.env.PLANNOTATOR_DATA_DIR;
  savedHistory = process.env.PLANNOTATOR_ANNOTATE_HISTORY;
  delete process.env.PLANNOTATOR_PORT;
  process.env.PLANNOTATOR_REMOTE = "0";
  process.env.PLANNOTATOR_DATA_DIR = dataDir;
  process.env.PLANNOTATOR_ANNOTATE_HISTORY = "0";
  resetMarkdownExtensionsCache();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(dataDir, { recursive: true, force: true });
  if (savedPort === undefined) delete process.env.PLANNOTATOR_PORT;
  else process.env.PLANNOTATOR_PORT = savedPort;
  if (savedRemote === undefined) delete process.env.PLANNOTATOR_REMOTE;
  else process.env.PLANNOTATOR_REMOTE = savedRemote;
  if (savedDataDir === undefined) delete process.env.PLANNOTATOR_DATA_DIR;
  else process.env.PLANNOTATOR_DATA_DIR = savedDataDir;
  if (savedHistory === undefined) delete process.env.PLANNOTATOR_ANNOTATE_HISTORY;
  else process.env.PLANNOTATOR_ANNOTATE_HISTORY = savedHistory;
  resetMarkdownExtensionsCache();
});

async function planPayload(filePath: string, markdown: string) {
  const server = await startAnnotateServer({ markdown, filePath, htmlContent: MINIMAL_HTML });
  try {
    const res = await fetch(`${server.url}/api/plan`);
    return (await res.json()) as { plan: string; renderAs?: string; codeLanguage?: string };
  } finally {
    server.stop();
  }
}

async function folderDoc(query: string, files: Record<string, string>) {
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  const server = await startAnnotateServer({
    markdown: "",
    filePath: dir,
    folderPath: dir,
    mode: "annotate-folder",
    htmlContent: MINIMAL_HTML,
  });
  try {
    const res = await fetch(`${server.url}/api/doc?${query}`);
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  } finally {
    server.stop();
  }
}

const resolveTarget = (rawFilePath: string) =>
  resolveAnnotateTarget({ rawFilePath, projectRoot: dir, noJina: true, renderMarkdown: false, log: () => {} });

describe("/api/plan", () => {
  test("1. an opted-in .cs file is served as code with its raw text", async () => {
    writeConfig({ codeExtensions: [".cs"] });
    const file = join(dir, "DateParser.cs");
    writeFileSync(file, CSHARP);
    const json = await planPayload(file, CSHARP);
    expect(json.renderAs).toBe("code");
    expect(json.codeLanguage).toBe("csharp");
    expect(json.plan).toBe(CSHARP);
  });

  test("a markdown file is unaffected by codeExtensions", async () => {
    writeConfig({ codeExtensions: [".cs"] });
    const file = join(dir, "notes.md");
    writeFileSync(file, "# Notes");
    const json = await planPayload(file, "# Notes");
    expect(json.renderAs).toBe("markdown");
    expect(json.codeLanguage).toBeUndefined();
  });

  test("a URL target whose path ends in .cs is not a code session", async () => {
    writeConfig({ codeExtensions: [".cs"] });
    const json = await planPayload("https://example.com/src/DateParser.cs", "# Converted");
    expect(json.renderAs).toBe("markdown");
  });
});

describe("/api/doc", () => {
  const docQuery = (name: string, extra = "") => `path=${encodeURIComponent(join(dir, name))}${extra}`;

  test("2. doc=1 serves a .cs sibling as code and leaves a .md sibling alone", async () => {
    writeConfig({ codeExtensions: [".cs"] });
    const cs = await folderDoc(docQuery("DateParser.cs", "&doc=1"), {
      "index.md": "# Index\n",
      "DateParser.cs": CSHARP,
    });
    expect(cs.status).toBe(200);
    expect(cs.json.renderAs).toBe("code");
    expect(cs.json.codeLanguage).toBe("csharp");
    expect(cs.json.markdown).toBe(CSHARP);

    const md = await folderDoc(docQuery("index.md", "&doc=1"), {});
    expect(md.json.renderAs).toBe("markdown");
    expect(md.json.codeLanguage).toBeUndefined();
  });

  test("3. without doc=1 a .cs link keeps the code-file popout", async () => {
    writeConfig({ codeExtensions: [".cs"] });
    const { status, json } = await folderDoc(docQuery("DateParser.cs"), {
      "index.md": "# Index\n",
      "DateParser.cs": CSHARP,
    });
    expect(status).toBe(200);
    expect(json.codeFile).toBe(true);
    expect(json.renderAs).not.toBe("code");
  });

  test("5. markdownExtensions alone still serves .sh as markdown", async () => {
    writeConfig({ markdownExtensions: [".sh"] });
    const { json } = await folderDoc(docQuery("deploy.sh", "&doc=1"), {
      "index.md": "# Index\n",
      "deploy.sh": SHELL,
    });
    expect(json.renderAs).toBe("markdown");
    expect(json.codeLanguage).toBeUndefined();
  });

  test("6. a .sh listed in both settings is served as code", async () => {
    writeConfig({ markdownExtensions: [".sh"], codeExtensions: [".sh"] });
    const { json } = await folderDoc(docQuery("deploy.sh", "&doc=1"), {
      "index.md": "# Index\n",
      "deploy.sh": SHELL,
    });
    expect(json.renderAs).toBe("code");
    expect(json.codeLanguage).toBe("bash");
  });
});

describe("CLI target resolution", () => {
  test("4. with no codeExtensions a .cs file is refused and the hint lists nothing new", async () => {
    writeFileSync(join(dir, "DateParser.cs"), CSHARP);
    const result = await resolveTarget("DateParser.cs");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("File type not supported: .cs");
      expect(result.message).not.toContain(".cs,");
      expect(result.message).not.toContain(".sh");
    }
  });

  test("7. .env listed in codeExtensions is dropped and the file is still refused", async () => {
    writeConfig({ codeExtensions: [".env", ".cs"] });
    writeFileSync(join(dir, ".env"), "SECRET=1\n");
    const result = await resolveTarget(".env");
    expect(result.ok).toBe(false);
  });

  test("8. the 2MB annotatable cap applies to a code file", async () => {
    writeConfig({ codeExtensions: [".cs"] });
    writeFileSync(join(dir, "Huge.cs"), "x".repeat(MAX_ANNOTATABLE_FILE_BYTES + 1));
    const result = await resolveTarget("Huge.cs");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("File too large to annotate");
  });

  test("9. DateParser.cs resolves with codeExtensions set", async () => {
    writeConfig({ codeExtensions: [".cs"] });
    writeFileSync(join(dir, "DateParser.cs"), CSHARP);
    const result = await resolveTarget("DateParser.cs");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.markdown).toBe(CSHARP);
  });

  test("folder annotate lists code files only when opted in", async () => {
    writeFileSync(join(dir, "DateParser.cs"), CSHARP);
    const before = await resolveTarget(dir);
    expect(before.ok).toBe(false);

    writeConfig({ codeExtensions: [".cs"] });
    const after = await resolveTarget(dir);
    expect(after.ok).toBe(true);
  });
});
