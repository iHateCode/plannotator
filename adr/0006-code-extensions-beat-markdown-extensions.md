# 6. When an extension is in both settings, code wins

Date: 2026-10-04

## Status

Accepted

## Context

Users who worked around the missing feature added source extensions to `markdownExtensions`. Once `codeExtensions` exists, the same extension can sit in both lists.

## Decision

A file whose extension is in both `markdownExtensions` and `codeExtensions` renders as code. An extension only in `markdownExtensions` keeps rendering as Markdown.

## Consequences

Adding an extension to `codeExtensions` is a deliberate act, so it takes priority over the older fallback. An old `markdownExtensions` entry stops applying to that extension without a warning. Users build config around which setting wins, so this is hard to change later.
