# 5. Source files keep per-file version history

Date: 2026-10-04

## Status

Accepted

## Context

Text documents served in annotate mode keep per-file version history under `~/.plannotator/history/`. The dotenv family is denied there because history copies file contents. Source code is not secret in the same way, but history would copy it too.

## Decision

A code file served as a document keeps version history like a `.txt` file. The dotenv denial is unchanged.

## Consequences

Behaviour is consistent across document types and version diffs work for code. Copies of source code accumulate in the user's data folder, which may surprise a reader who knows why dotenv files are denied. Data already written there stays unless the user deletes it.
