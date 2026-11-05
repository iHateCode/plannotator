import { describe, expect, test } from "bun:test";
import {
	annotateDocumentRenderKind,
	codeDocumentLanguage,
	documentRenderKindForPath,
	isAnnotatableTextPath,
	isDocumentRenderKind,
	normalizeCodeExtensions,
	normalizeMarkdownExtensions,
	shouldStripFrontmatter,
} from "./annotatable";

const CONFIG_AND_DATA = [
	"config.yaml",
	"ci.YML",
	"package.json",
	"tsconfig.jsonc",
	"settings.json5",
	"pyproject.toml",
	"setup.ini",
	"setup.cfg",
	"nginx.conf",
	"app.properties",
	"rows.csv",
	"rows.tsv",
	"server.log",
	"pom.xml",
	".env.example",
] as const;

describe("config and data files in the annotatable seam", () => {
	test("every config or data extension is annotatable text with the code render kind", () => {
		for (const path of CONFIG_AND_DATA) {
			expect(isAnnotatableTextPath(path)).toBe(true);
			expect(documentRenderKindForPath(`/repo/${path}`)).toBe("code");
		}
	});

	test("markdown, .txt, diagrams and AsciiDoc keep their own kinds", () => {
		expect(documentRenderKindForPath("notes.md")).toBeNull();
		expect(documentRenderKindForPath("notes.txt")).toBeNull();
		expect(documentRenderKindForPath("flow.mmd")).toBe("mermaid");
		expect(documentRenderKindForPath("guide.adoc")).toBe("asciidoc");
		expect(documentRenderKindForPath("config.yaml.bak")).toBeNull();
		// `.env` is refused outright, never rendered.
		expect(documentRenderKindForPath(".env")).toBeNull();
	});

	test("isDocumentRenderKind accepts code", () => {
		expect(isDocumentRenderKind("code")).toBe(true);
		expect(isDocumentRenderKind("markdown")).toBe(false);
	});

	test("a code session needs a local file opened as itself", () => {
		expect(annotateDocumentRenderKind({ filePath: "/repo/pyproject.toml" })).toBe("code");
		expect(annotateDocumentRenderKind({ filePath: "https://x.dev/openapi.json" })).toBeNull();
		expect(annotateDocumentRenderKind({ filePath: "/repo", mode: "annotate-folder" })).toBeNull();
	});

	test("each file names its grammar; .cfg and .conf are never guessed", () => {
		expect(codeDocumentLanguage("/repo/ci.YML")).toBe("yaml");
		expect(codeDocumentLanguage("package.json")).toBe("json");
		expect(codeDocumentLanguage("tsconfig.jsonc")).toBe("jsonc");
		expect(codeDocumentLanguage("settings.json5")).toBe("json5");
		expect(codeDocumentLanguage("pyproject.toml")).toBe("toml");
		expect(codeDocumentLanguage("setup.ini")).toBe("ini");
		expect(codeDocumentLanguage("app.properties")).toBe("ini");
		expect(codeDocumentLanguage("pom.xml")).toBe("xml");
		expect(codeDocumentLanguage("rows.csv")).toBe("csv");
		expect(codeDocumentLanguage("rows.tsv")).toBe("tsv");
		expect(codeDocumentLanguage("server.log")).toBe("log");
		expect(codeDocumentLanguage(".env.example")).toBe("dotenv");
		expect(codeDocumentLanguage("setup.cfg")).toBeUndefined();
		expect(codeDocumentLanguage("nginx.conf")).toBeUndefined();
		expect(codeDocumentLanguage(null)).toBeUndefined();
	});

	test("a multi-document YAML keeps its leading --- block", () => {
		expect(shouldStripFrontmatter("k8s.yaml")).toBe(false);
	});

	test("a configured markdown extra cannot claim a code extension", () => {
		// Extras (#1307) are markdown by definition; the built-ins win.
		expect(normalizeMarkdownExtensions([".toml", ".yaml", ".livemd"])).toEqual([".livemd"]);
		expect(documentRenderKindForPath("notebook.livemd")).toBeNull();
	});
});

describe("codeExtensions: opt-in source files", () => {
	test("an unlisted source file keeps upstream behaviour", () => {
		expect(documentRenderKindForPath("/repo/Program.cs")).toBeNull();
		expect(codeDocumentLanguage("/repo/Program.cs")).toBeUndefined();
	});

	test("a listed extension is code, drawn in its language", () => {
		expect(documentRenderKindForPath("/repo/Program.cs", [".cs"])).toBe("code");
		expect(codeDocumentLanguage("/repo/Program.CS", [".cs"])).toBe("csharp");
		expect(codeDocumentLanguage("/repo/run.sh", [".sh"])).toBe("bash");
		// Only listed ones: .sh listed does not make .py code.
		expect(documentRenderKindForPath("/repo/a.py", [".sh"])).toBeNull();
	});

	test("a listed .txt is plain monospace code, not markdown", () => {
		expect(documentRenderKindForPath("notes.txt", [".txt"])).toBe("code");
		expect(codeDocumentLanguage("notes.txt", [".txt"])).toBeUndefined();
		expect(shouldStripFrontmatter("notes.txt", [], [".txt"])).toBe(false);
	});

	test("listed code wins over a markdown extra, and never strips frontmatter", () => {
		expect(shouldStripFrontmatter("a.cs", [".cs"], [".cs"])).toBe(false);
		expect(shouldStripFrontmatter("a.cs", [".cs"])).toBe(true);
	});

	test("the session rule threads the list through", () => {
		expect(annotateDocumentRenderKind({ filePath: "/repo/a.cs", codeExtensions: [".cs"] })).toBe("code");
		expect(annotateDocumentRenderKind({ filePath: "https://x.dev/a.cs", codeExtensions: [".cs"] })).toBeNull();
	});

	test("normalizeCodeExtensions refuses what is not in the table, and dotenv files", () => {
		expect(normalizeCodeExtensions([".CS", " .sh ", ".cs"])).toEqual([".cs", ".sh"]);
		expect(normalizeCodeExtensions([".zzz", ".env", ".env.local", ".prod.env", "cs", 5, "*.cs"])).toEqual([]);
		// Built-in code extensions need no listing.
		expect(normalizeCodeExtensions([".yaml", ".log", ".env.example"])).toEqual([]);
		expect(normalizeCodeExtensions("nope")).toEqual([]);
	});

	test("the accepted-extension predicates see listed extensions", () => {
		expect(isAnnotatableTextPath("a.cs")).toBe(false);
		expect(isAnnotatableTextPath("a.cs", [".cs"])).toBe(true);
	});
});
