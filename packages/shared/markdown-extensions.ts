/**
 * Configured extra markdown extensions (#1307).
 *
 * A user can teach annotate about additional plain-text document extensions
 * (for example `.livemd`, Livebook notebooks) with `markdownExtensions` in
 * `~/.plannotator/config.json`:
 *
 *   { "markdownExtensions": [".livemd"] }
 *
 * Listed extensions are accepted everywhere `.md` is accepted on the annotate
 * path — CLI target resolution, the folder file browser, `/api/doc`
 * (relative/wiki-link navigation between sibling docs), the 2MB size cap and
 * the per-file version history — and are rendered as MARKDOWN (frontmatter
 * stripped), never as HTML.
 *
 * The extension predicates themselves live in `@plannotator/core/annotatable`,
 * which is browser-safe and zero-dep and therefore cannot read a config file.
 * This module is the node-side seam: it reads `config.json` ONCE per process
 * through the same `loadConfig()` every other setting uses, normalizes the
 * value, and threads it into those pure functions. Everything here degrades to
 * the built-in behavior when the key is absent or invalid.
 */

import {
	buildAnnotatableDocRegex,
	buildAnnotatableExtensionsHint,
	buildAnnotatableTextRegex,
	isAnnotatableDocPath as isAnnotatableDocPathWith,
	isAnnotatableTextPath as isAnnotatableTextPathWith,
	normalizeCodeExtensions,
	normalizeMarkdownExtensions,
	shouldStripFrontmatter as shouldStripFrontmatterWith,
} from "./annotatable";
import { loadConfig, type PlannotatorConfig } from "./config";

export { normalizeCodeExtensions, normalizeMarkdownExtensions };

/**
 * Resolve the configured extra markdown extensions from an explicit config
 * object. Pure: invalid entries are dropped, `.env` is denylisted, and
 * built-in extensions are deduplicated (see `normalizeMarkdownExtensions`).
 */
export function resolveMarkdownExtensions(config: PlannotatorConfig): string[] {
	return normalizeMarkdownExtensions(config.markdownExtensions);
}

let cached: string[] | null = null;

/**
 * The extra extensions for this process. Read from `config.json` on first use
 * and memoized: a session's accepted set must not change halfway through a
 * directory walk. Pass an explicit config to bypass the memo entirely.
 */
export function getExtraMarkdownExtensions(config?: PlannotatorConfig): string[] {
	if (config) return resolveMarkdownExtensions(config);
	if (cached === null) cached = resolveMarkdownExtensions(loadConfig());
	return cached;
}

let cachedCode: string[] | null = null;

/**
 * Extensions listed in `codeExtensions`: annotate opens them as one highlighted
 * code block (`renderAs: "code"`). Memoized per process like the markdown list.
 */
export function getCodeExtensions(config?: PlannotatorConfig): string[] {
	if (config) return normalizeCodeExtensions(config.codeExtensions);
	if (cachedCode === null) cachedCode = normalizeCodeExtensions(loadConfig().codeExtensions);
	return cachedCode;
}

/** The configured extras that make a path accepted: markdown plus code. */
function acceptedExtras(): string[] {
	return [...getExtraMarkdownExtensions(), ...getCodeExtensions()];
}

/** Drop the memo so the next read re-reads `config.json`. Tests only. */
export function resetMarkdownExtensionsCache(): void {
	cached = null;
	cachedCode = null;
}

/** Plain-text (markdown-rendered) matcher including the configured extras. */
export function getAnnotatableTextRegex(): RegExp {
	return buildAnnotatableTextRegex(acceptedExtras());
}

/** Plain-text + raw-HTML matcher including the configured extras. */
export function getAnnotatableDocRegex(): RegExp {
	return buildAnnotatableDocRegex(acceptedExtras());
}

/** Accepted-set hint for error messages, including the configured extras. */
export function getAnnotatableExtensionsHint(): string {
	return buildAnnotatableExtensionsHint(acceptedExtras());
}

/**
 * True when annotate can open `input` as a plain-text (markdown-rendered)
 * document, honoring the configured extras. Drop-in replacement for the pure
 * core predicate of the same name — server code should import this one.
 */
export function isAnnotatableTextPath(input: string): boolean {
	return isAnnotatableTextPathWith(input, acceptedExtras());
}

/** True when annotate can open `input` at all, honoring the configured extras. */
export function isAnnotatableDocPath(input: string): boolean {
	return isAnnotatableDocPathWith(input, acceptedExtras());
}

/** Frontmatter stripping decision honoring the configured extras (extras are markdown). */
export function shouldStripFrontmatter(path: string | null | undefined): boolean {
	return shouldStripFrontmatterWith(path, getExtraMarkdownExtensions(), getCodeExtensions());
}
