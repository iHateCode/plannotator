import { describe, expect, test } from "bun:test";
import { shareableDocumentMarkdown } from "./sharing";
import { parseMarkdownToBlocks } from "./parser";
import { isGraphvizLanguage, isMermaidLanguage } from "../components/diagramLanguages";

const MERMAID = "flowchart TD\n  A --> B\n";
const DOT = "digraph G {\n  a -> b;\n}\n";

describe("shareableDocumentMarkdown", () => {
  test("markdown and HTML sessions ship their body unchanged", () => {
    expect(shareableDocumentMarkdown("# Plan", "markdown")).toBe("# Plan");
    expect(shareableDocumentMarkdown("# Plan", "html")).toBe("# Plan");
    expect(shareableDocumentMarkdown("# Plan", undefined)).toBe("# Plan");
  });

  test("a diagram source ships fenced, so the portal's markdown parse renders the diagram", () => {
    // The portal has no server to tell it `renderAs`, so the shared body has
    // to carry the fence itself or the diagram arrives as a wall of text.
    const shared = shareableDocumentMarkdown(MERMAID, "mermaid");
    const blocks = parseMarkdownToBlocks(shared);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("code");
    expect(isMermaidLanguage(blocks[0].language)).toBe(true);
    expect(blocks[0].content).toBe(MERMAID.trimEnd());

    const dotBlocks = parseMarkdownToBlocks(shareableDocumentMarkdown(DOT, "graphviz"));
    expect(isGraphvizLanguage(dotBlocks[0].language)).toBe(true);
    expect(dotBlocks[0].content).toBe(DOT.trimEnd());
  });

  test("a diagram body containing a ``` run survives the fence", () => {
    const withTicks = 'flowchart TD\n  A["```code```"] --> B\n';
    const blocks = parseMarkdownToBlocks(shareableDocumentMarkdown(withTicks, "mermaid"));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe(withTicks.trimEnd());
  });

  test("an empty body is left empty rather than becoming an empty fence", () => {
    expect(shareableDocumentMarkdown("", "mermaid")).toBe("");
  });

  test("a code file ships fenced in its language", () => {
    const code = "echo 1\necho 2\n";
    const shared = shareableDocumentMarkdown(code, "code", "bash");
    expect(shared).toBe("```bash\necho 1\necho 2\n```");
    const blocks = parseMarkdownToBlocks(shared);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].language).toBe("bash");
    expect(blocks[0].content).toBe(code.trimEnd());
  });

  test("a code body containing a ``` run gets a longer fence, one past the longest run", () => {
    const code = "cat <<EOF\n```` four\n```\nEOF\n";
    const shared = shareableDocumentMarkdown(code, "code", "bash");
    expect(shared.startsWith("`````bash\n")).toBe(true);
    expect(shared.endsWith("\n`````")).toBe(true);
    const blocks = parseMarkdownToBlocks(shared);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe(code.trimEnd());
  });

  test("code without a language is left unchanged", () => {
    expect(shareableDocumentMarkdown("x = 1\n", "code", null)).toBe("x = 1\n");
  });
});
