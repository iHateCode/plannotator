/**
 * Annotate server: source files opted in through `codeExtensions`.
 *
 * A listed extension is served as `renderAs: "code"` with `codeLanguage`; an
 * unlisted one keeps the markdown route; an oversized one is refused. Pi
 * mirrors this in apps/pi-extension/server/serverAnnotate-code.test.ts.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startAnnotateServer } from "./annotate";
import { resolveAnnotateTarget } from "../../apps/hook/server/annotate-resolution";
import { resetMarkdownExtensionsCache } from "../shared/markdown-extensions";
import { MAX_ANNOTATABLE_FILE_BYTES } from "@plannotator/core/annotatable";
import { NO_BROWSER } from "../../tests/helpers/no-browser";

const MINIMAL_HTML = "<html><body>Plannotator</body></html>";
const CS = "class A { }\n";

const ENV_KEYS = ["PLANNOTATOR_PORT", "PLANNOTATOR_REMOTE", "PLANNOTATOR_DATA_DIR", "PLANNOTATOR_ANNOTATE_HISTORY", "PLANNOTATOR_BROWSER"] as const;
let dir: string;
let saved: Record<string, string | undefined>;

function writeConfig(codeExtensions: unknown) {
  mkdirSync(process.env.PLANNOTATOR_DATA_DIR!, { recursive: true });
  writeFileSync(join(process.env.PLANNOTATOR_DATA_DIR!, "config.json"), JSON.stringify({ codeExtensions }));
  resetMarkdownExtensionsCache();
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pn-codeext-"));
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  delete process.env.PLANNOTATOR_PORT;
  process.env.PLANNOTATOR_REMOTE = "0";
  process.env.PLANNOTATOR_DATA_DIR = join(dir, ".data");
  process.env.PLANNOTATOR_ANNOTATE_HISTORY = "0";
  process.env.PLANNOTATOR_BROWSER = NO_BROWSER;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  resetMarkdownExtensionsCache();
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

async function folderServer() {
  return startAnnotateServer({ markdown: "", filePath: dir, folderPath: dir, mode: "annotate-folder", htmlContent: MINIMAL_HTML });
}

describe("/api/plan", () => {
  test("a listed source file is code with its language, and the list rides the payload", async () => {
    writeConfig([".cs"]);
    const file = join(dir, "A.cs");
    writeFileSync(file, CS);
    const server = await startAnnotateServer({ markdown: CS, filePath: file, htmlContent: MINIMAL_HTML });
    try {
      const json = (await (await fetch(`${server.url}/api/plan`)).json()) as Record<string, unknown>;
      expect(json.renderAs).toBe("code");
      expect(json.codeLanguage).toBe("csharp");
      expect(json.plan).toBe(CS);
      expect(json.codeExtensions).toEqual([".cs"]);
    } finally {
      server.stop();
    }
  });

  test("an unlisted source file keeps the markdown route", async () => {
    writeConfig([".sh"]);
    const file = join(dir, "A.cs");
    writeFileSync(file, CS);
    const server = await startAnnotateServer({ markdown: CS, filePath: file, htmlContent: MINIMAL_HTML });
    try {
      const json = (await (await fetch(`${server.url}/api/plan`)).json()) as Record<string, unknown>;
      expect(json.renderAs).toBe("markdown");
      expect(json.codeLanguage).toBeUndefined();
    } finally {
      server.stop();
    }
  });
});

describe("/api/doc and the file browser", () => {
  test("a listed file opens from a folder as code", async () => {
    writeConfig([".sh", ".txt"]);
    const sh = join(dir, "run.sh");
    const txt = join(dir, "notes.txt");
    writeFileSync(sh, "echo hi\n");
    writeFileSync(txt, "plain\n");
    const server = await folderServer();
    try {
      const doc = async (p: string) => (await (await fetch(`${server.url}/api/doc?path=${encodeURIComponent(p)}&doc=1`)).json()) as Record<string, unknown>;
      const shDoc = await doc(sh);
      expect(shDoc.renderAs).toBe("code");
      expect(shDoc.codeLanguage).toBe("bash");
      // .txt listed: code, drawn plain (no language).
      const txtDoc = await doc(txt);
      expect(txtDoc.renderAs).toBe("code");
      expect(txtDoc.codeLanguage).toBeUndefined();
      const files = JSON.stringify(await (await fetch(`${server.url}/api/reference/files?dirPath=${encodeURIComponent(dir)}`)).json());
      expect(files).toContain("run.sh");
    } finally {
      server.stop();
    }
  });

  test("an unlisted source file is refused from a folder", async () => {
    writeConfig([]);
    const file = join(dir, "run.sh");
    writeFileSync(file, "echo hi\n");
    const server = await folderServer();
    try {
      const res = await fetch(`${server.url}/api/doc?path=${encodeURIComponent(file)}&doc=1`);
      const json = (await res.json()) as Record<string, unknown>;
      expect(json.renderAs).not.toBe("code");
    } finally {
      server.stop();
    }
  });

  test("a listed file over 2MB is refused", async () => {
    writeConfig([".sh"]);
    const file = join(dir, "big.sh");
    writeFileSync(file, "x".repeat(MAX_ANNOTATABLE_FILE_BYTES + 1));
    const server = await folderServer();
    try {
      const res = await fetch(`${server.url}/api/doc?path=${encodeURIComponent(file)}&doc=1`);
      expect(res.ok).toBe(false);
    } finally {
      server.stop();
    }
  });
});

describe("CLI target resolution", () => {
  test("a listed file resolves; an unlisted one does not; .env never does", async () => {
    writeConfig([".cs", ".env"]);
    writeFileSync(join(dir, "A.cs"), CS);
    writeFileSync(join(dir, "run.sh"), "echo\n");
    writeFileSync(join(dir, ".env"), "SECRET=1\n");
    const resolve = (rawFilePath: string) =>
      resolveAnnotateTarget({ rawFilePath, projectRoot: dir, noJina: true, renderMarkdown: false, log: () => {} });
    expect((await resolve("A.cs")).ok).toBe(true);
    expect((await resolve("run.sh")).ok).toBe(false);
    expect((await resolve(".env")).ok).toBe(false);
  });
});
