/**
 * Annotate server (Pi/Node): source files opted in through `codeExtensions`.
 *
 * Node mirror of packages/server/annotate.codeExtensions.test.ts: both
 * runtimes must name `renderAs: "code"` plus `codeLanguage` for a listed file
 * and leave an unlisted one on the markdown route.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startAnnotateServer } from "./serverAnnotate.ts";
import { resetMarkdownExtensionsCache } from "../generated/markdown-extensions.ts";
import { NO_BROWSER } from "../../../tests/helpers/no-browser.ts";

const MINIMAL_HTML = "<html><body>editor</body></html>";
const CS = "class A { }\n";

describe("pi annotate server: codeExtensions", () => {
	const ENV_KEYS = ["PLANNOTATOR_PORT", "PLANNOTATOR_REMOTE", "PLANNOTATOR_DATA_DIR", "PLANNOTATOR_ANNOTATE_HISTORY", "PLANNOTATOR_BROWSER"] as const;
	let dir: string;
	let saved: Record<string, string | undefined>;

	function writeConfig(codeExtensions: unknown) {
		mkdirSync(process.env.PLANNOTATOR_DATA_DIR!, { recursive: true });
		writeFileSync(join(process.env.PLANNOTATOR_DATA_DIR!, "config.json"), JSON.stringify({ codeExtensions }));
		resetMarkdownExtensionsCache();
	}

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "pn-pi-codeext-"));
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

	test("/api/plan: a listed file is code with its language; an unlisted one is markdown", async () => {
		writeConfig([".cs"]);
		const cs = join(dir, "A.cs");
		const sh = join(dir, "run.sh");
		writeFileSync(cs, CS);
		writeFileSync(sh, "echo\n");
		for (const [file, text, renderAs, codeLanguage] of [
			[cs, CS, "code", "csharp"],
			[sh, "echo\n", "markdown", undefined],
		] as const) {
			const server = await startAnnotateServer({ markdown: text, filePath: file, htmlContent: MINIMAL_HTML });
			try {
				const json = (await (await fetch(`${server.url}/api/plan`)).json()) as Record<string, unknown>;
				expect(json.renderAs).toBe(renderAs);
				expect(json.codeLanguage).toBe(codeLanguage);
				expect(json.codeExtensions).toEqual([".cs"]);
			} finally {
				server.stop();
			}
		}
	});

	test("/api/doc: a listed file in a folder is code; a listed .txt is code with no language", async () => {
		writeConfig([".sh", ".txt"]);
		const sh = join(dir, "run.sh");
		const txt = join(dir, "notes.txt");
		writeFileSync(sh, "echo hi\n");
		writeFileSync(txt, "plain\n");
		const server = await startAnnotateServer({ markdown: "", filePath: dir, folderPath: dir, mode: "annotate-folder", htmlContent: MINIMAL_HTML });
		try {
			const doc = async (p: string) =>
				(await (await fetch(`${server.url}/api/doc?path=${encodeURIComponent(p)}&doc=1`)).json()) as Record<string, unknown>;
			const shDoc = await doc(sh);
			expect(shDoc.renderAs).toBe("code");
			expect(shDoc.codeLanguage).toBe("bash");
			const txtDoc = await doc(txt);
			expect(txtDoc.renderAs).toBe("code");
			expect(txtDoc.codeLanguage).toBeUndefined();
		} finally {
			server.stop();
		}
	});
});
