/**
 * A whole source file drawn as one code block (`codeExtensions`): the export
 * labels a comment with the commented text's own file line, and falls back to
 * the whole block's range when that text cannot be found.
 */
import { describe, expect, test } from 'bun:test';
import { AnnotationType, type Annotation } from '../types';
import { codeDocumentBlocks, exportAnnotations } from './parser';

const FILE = ['namespace Demo;', 'class A', '{', '    int one = 1;', '    int two = 2;', '}', ''].join('\n');
const blocks = codeDocumentBlocks(FILE, 'csharp');

function comment(quote: string): Annotation {
  const start = blocks[0].content.indexOf(quote);
  return {
    id: 'c1', blockId: blocks[0].id, startOffset: start < 0 ? 0 : start, endOffset: start < 0 ? 0 : start + quote.length,
    type: AnnotationType.COMMENT, text: 'note', originalText: quote, createdA: 1, author: 'ramos',
  };
}

describe('codeDocumentBlocks', () => {
  test('is one line-addressable code block in the given language', () => {
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: 'code', language: 'csharp', startLine: 1, sourceLineCount: 6, lineAddressable: true });
    expect(blocks[0].content).toBe(FILE);
  });

  test('an empty file has no lines', () => {
    expect(codeDocumentBlocks('', 'bash')[0].sourceLineCount).toBe(0);
  });
});

describe('export line labels for a code document', () => {
  test('a single-line selection is labelled with its own file line', () => {
    expect(exportAnnotations(blocks, [comment('int two = 2;')])).toContain('(line 5)');
  });

  test('a multi-line selection is labelled with its line range', () => {
    expect(exportAnnotations(blocks, [comment('int one = 1;\n    int two = 2;')])).toContain('(lines 4–5)');
  });

  test('a trailing newline in the selection does not add a line', () => {
    expect(exportAnnotations(blocks, [comment('int one = 1;\n')])).toContain('(line 4)');
  });

  test('text that cannot be found falls back to the whole range', () => {
    const out = exportAnnotations(blocks, [comment('not in the file')]);
    expect(out).toContain('(lines 1–6)');
  });
});
