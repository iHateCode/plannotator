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
