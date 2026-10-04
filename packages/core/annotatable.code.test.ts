import { describe, expect, test } from "bun:test";
import {
	CODE_LANGUAGE_BY_EXTENSION,
	annotateCodeLanguage,
	codeLanguageForPath,
	isAnnotatableTextPath,
	normalizeCodeExtensions,
	shouldStripFrontmatter,
} from "./annotatable";

describe("normalizeCodeExtensions", () => {
	test("keeps table extensions, lowercased and deduplicated", () => {
		expect(normalizeCodeExtensions([".cs", ".CS", " .sh "])).toEqual([".cs", ".sh"]);
	});

	test("drops extensions with no language, malformed entries and the dotenv family", () => {
		expect(normalizeCodeExtensions([".unknown", "cs", "*.cs", 42, ".env", ".prod.env", ".env.local"])).toEqual([]);
	});

	test("rejects non-array values", () => {
		expect(normalizeCodeExtensions(".cs")).toEqual([]);
		expect(normalizeCodeExtensions(undefined)).toEqual([]);
	});

	test("every table key is a well-formed extension the normaliser accepts", () => {
		expect(normalizeCodeExtensions(Object.keys(CODE_LANGUAGE_BY_EXTENSION))).toEqual(
			Object.keys(CODE_LANGUAGE_BY_EXTENSION),
		);
	});
});

describe("codeLanguageForPath", () => {
	test("is null unless the extension is opted in", () => {
		expect(codeLanguageForPath("DateParser.cs")).toBeNull();
		expect(codeLanguageForPath("DateParser.cs", [".sh"])).toBeNull();
		expect(codeLanguageForPath("DateParser.cs", [".cs"])).toBe("csharp");
		expect(codeLanguageForPath("DATEPARSER.CS", [".cs"])).toBe("csharp");
	});

	test("never maps an extension outside the table", () => {
		expect(codeLanguageForPath("notes.md", [".md"])).toBeNull();
	});
});

describe("annotateCodeLanguage", () => {
	const base = { filePath: "/x/DateParser.cs", codeExtensions: [".cs"] };
	test("names the language for a plain annotate session", () => {
		expect(annotateCodeLanguage(base)).toBe("csharp");
	});
	test("is null for raw HTML, converted sources, other modes and URLs", () => {
		expect(annotateCodeLanguage({ ...base, renderHtml: true })).toBeNull();
		expect(annotateCodeLanguage({ ...base, sourceConverted: true })).toBeNull();
		expect(annotateCodeLanguage({ ...base, mode: "annotate-last" })).toBeNull();
		expect(annotateCodeLanguage({ ...base, filePath: "https://example.com/a.cs" })).toBeNull();
	});
});

describe("predicates and frontmatter honour code extensions", () => {
	test("a code extension is annotatable only when passed in", () => {
		expect(isAnnotatableTextPath("a.cs")).toBe(false);
		expect(isAnnotatableTextPath("a.cs", [], [".cs"])).toBe(true);
	});

	test("a code file never strips frontmatter, even when also a markdown extra", () => {
		expect(shouldStripFrontmatter("a.sh", [".sh"])).toBe(true);
		expect(shouldStripFrontmatter("a.sh", [".sh"], [".sh"])).toBe(false);
	});
});

describe("data and config files opted in as code", () => {
	test("a built-in document type listed in codeExtensions draws as code, not Markdown", () => {
		expect(isAnnotatableTextPath("pipeline.yml")).toBe(true);
		expect(codeLanguageForPath("pipeline.yml", [".yml"])).toBe("yaml");
		expect(codeLanguageForPath("package.json", [".json"])).toBe("json");
		expect(codeLanguageForPath("Cargo.toml", [".toml"])).toBe("toml");
		expect(codeLanguageForPath("layout.xml", [".xml"])).toBe("xml");
	});

	test("without the opt-in these stay Markdown-rendered documents", () => {
		expect(codeLanguageForPath("pipeline.yml", [])).toBeNull();
		expect(codeLanguageForPath("pipeline.yml", [".cs"])).toBeNull();
	});
});

describe("larger language set and list cap", () => {
	test("kotlin, php, swift and vue map to their languages", () => {
		expect(codeLanguageForPath("Main.kt", [".kt"])).toBe("kotlin");
		expect(codeLanguageForPath("index.php", [".php"])).toBe("php");
		expect(codeLanguageForPath("App.swift", [".swift"])).toBe("swift");
		expect(codeLanguageForPath("Page.vue", [".vue"])).toBe("vue");
	});

	test("every table key survives normalisation together, beyond the markdown cap of 32", () => {
		const all = Object.keys(CODE_LANGUAGE_BY_EXTENSION);
		expect(all.length).toBeGreaterThan(32);
		expect(normalizeCodeExtensions(all)).toEqual(all);
	});
});

describe("plain text files opted in as monospace", () => {
	test(".txt and .log use the plain `text` language", () => {
		expect(codeLanguageForPath("notes.txt", [".txt"])).toBe("text");
		expect(codeLanguageForPath("app.log", [".log"])).toBe("text");
		expect(codeLanguageForPath("notes.txt", [])).toBeNull();
	});
});
