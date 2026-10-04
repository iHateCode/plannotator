# 3. Source code is opt-in per extension

Date: 2026-10-04

## Status

Accepted

## Context

`packages/core/annotatable.ts` leaves source code out of the built-in annotatable set on purpose, because listing every source file would flood folder views. Users still want to read a whole project in folder mode with coloured code. The older `markdownExtensions` setting can open source files, but it draws them as Markdown, which flattens the code.

## Decision

Source code opens only for extensions the user lists in a new `codeExtensions` setting. The built-in set never includes source code. With an empty list, behaviour is unchanged.

## Consequences

Folder views stay quiet by default and existing users see no change. The feature is invisible until configured, so it needs documenting. Renaming or removing the setting later would break users who have entries in their config, and turning code on by default later would change every user's folder view.
