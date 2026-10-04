# 4. A code file renders as one document block

Date: 2026-10-04

## Status

Accepted

## Context

Source files could be shown as a Markdown fence, through the existing code-file popout (which has line numbers), or as a document block like diagram files. A spike measured the block approach: a 2,000-line file coloured in about 1 second and a 2MB file in about 3.8 seconds, and commenting worked at both sizes.

## Decision

A code file is rendered as one `code` block built by `codeDocumentBlocks` in `packages/ui/utils/parser.ts`, following the diagram-files pattern. The server reports `renderAs: "code"` and a `codeLanguage`. The block carries `lineAddressable` so an export can name the commented file line.

## Consequences

This is the smallest change and reuses the existing highlighter and comment layer. There is no line-number gutter and no line-range comments in this version. If the `renderAs` value ships in the published `@plannotator/core` and `@plannotator/ui` packages, it becomes part of their public shape and is hard to remove.
