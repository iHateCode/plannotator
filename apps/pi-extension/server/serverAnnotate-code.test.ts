/**
 * Annotate server (Pi/Node): source code opted in through `codeExtensions`
 *
 * Node mirror of packages/server/annotate.code.test.ts (tests 1 to 6). Both
 * runtimes must say `renderAs: "code"` plus `codeLanguage` and serve the
 * file's RAW text on /api/plan and /api/doc?doc=1, or the same .cs renders as
 * highlighted code under Claude Code and as running text under Pi.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startAnnotateServer } from "./serverAnnotate.ts";
import { resetMarkdownExtensionsCache } from "../generated/markdown-extensions.ts";

const MINIMAL_HTML = "<html><body>editor</body></html>";
const CSHARP = "namespace Demo;\n\npublic class DateParser\n{\n    public int Year => 2026;\n}\n";
const SHELL = "#!/usr/bin/env bash\necho \"deploy\"\n";

describe("pi annotate server: code files", () => {
	let dir: string;
	let dataDir: string;
	let savedPort: string | undefined;
	let savedRemote: string | undefined;
	let savedDataDir: string | undefined;
	let savedHistory: string | undefined;

	function writeConfig(config: Record<string, unknown>) {
		writeFileSync(join(dataDir, "config.json"), JSON.stringify(config), "utf-8");
		resetMarkdownExtensionsCache();
	}

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "pn-pi-code-"));
		dataDir = mkdtempSync(join(tmpdir(), "pn-pi-code-data-"));
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
			return (await (await fetch(`${server.url}/api/plan`)).json()) as {
				plan: string; renderAs?: string; codeLanguage?: string;
			};
		} finally {
			server.stop();
		}
	}

	async function folderDoc(query: string, files: Record<string, string>) {
		for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text, "utf-8");
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

	const docQuery = (name: string, extra = "") => `path=${encodeURIComponent(join(dir, name))}${extra}`;

	test("1. /api/plan serves an opted-in .cs file as code with its raw text", async () => {
		writeConfig({ codeExtensions: [".cs"] });
		const file = join(dir, "DateParser.cs");
		writeFileSync(file, CSHARP, "utf-8");
		const json = await planPayload(file, CSHARP);
		expect(json.renderAs).toBe("code");
		expect(json.codeLanguage).toBe("csharp");
		expect(json.plan).toBe(CSHARP);
	});

	test("2. /api/doc?doc=1 serves a .cs sibling as code and leaves a .md sibling alone", async () => {
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

	test("4. with no codeExtensions a .cs file is served as before, never as code", async () => {
		const file = join(dir, "DateParser.cs");
		writeFileSync(file, CSHARP, "utf-8");
		const plan = await planPayload(file, CSHARP);
		expect(plan.renderAs).toBe("markdown");
		expect(plan.codeLanguage).toBeUndefined();

		const doc = await folderDoc(docQuery("DateParser.cs", "&doc=1"), { "index.md": "# Index\n" });
		expect(doc.json.renderAs).not.toBe("code");
		expect(doc.json.codeLanguage).toBeUndefined();
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
