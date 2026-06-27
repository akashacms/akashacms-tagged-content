This feature plan covers the 0.10 revamp of the `@akashacms/plugins-tagged-content` plugin. It implements the work described in:

- GitHub issue: https://github.com/akashacms/akasharender/issues/32
- `REVAMP-0.10.md` (in this repository)
- `guide/index.html.md` (current documentation, in this repository)

The target branch is `0.10`, for compatibility with the `0.10` branch of `akasharender`.

# Context

The core "tags" feature is supported by AkashaRender. An author adds a `tags` array to a document's YAML frontmatter. AkashaRender stores tag data in two SQL tables:

- `TAGGLUE` (`docvpath`, `tagName`) -- maps documents to tags
- `TAGDESCRIPTION` (`tagName`, `description`) -- optional human-readable descriptions

This plugin extends that core feature by surfacing tags in useful ways: per-tag index pages, per-document tag lists, RSS feeds, and (newly) a tags directory index page, microformats, OpenGraph metadata, hover popups, in-line tag lists, and an Obsidian compatibility mode.

## What AkashaRender (core) already provides

These exist on the `0.10` branch of akasharender and should be consumed by this plugin, not reimplemented:

- Cache methods: `tags()`, `documentsWithTag()`, `getTagDescription()`, `addTagDescription()`, `docLinkData()`
- `Configuration.addTagDescriptions()` using the `TagDescription` type (`tagName` + `description`)
- CLI tag tooling: `tags`, `similar-tags`, `tags-without-descriptions`, `unused-tag-descriptions`, `refactor-tag`, `docs-with-tag`
- The idea of moving tagged-content into core was abandoned; all work here stays in the plugin.

## Current plugin state (`index.mjs`)

- Custom elements: `<tags-for-document>` and `<tags-feeds-list>`
- `<tag-list-container>` / `<tag-list-item>` are commented out (removed due to disuse)
- `generateTagIndexes()` renders one HTML page + one RSS file per tag into `pathIndexes`
- No `tags/index.html` generation (old index code commented out at the bottom of `index.mjs`)
- Partials are minimal; `tagged-content-doctags.html.njk` has a stray `p-category` class but nothing systematic
- `cli.mjs` is currently non-functional: it uses CommonJS `require`/`./index.js` inside an ESM (`type: module`) package

## Design decisions (agreed)

- Do NOT reinstate `<tag-list-container>` / `<tag-list-item>` custom elements. Reduce custom-element count to lower per-render cost. Provide Plugin API functions + NJK macros instead.
- The tags-directory index list MAY include per-tag RSS links. If it does, `<tags-feeds-list>` becomes redundant and should be deprecated (kept working, documented as deprecated).
- Obsidian compatibility is **advisory only** at this time. The plugin reports tags that are not Obsidian-compatible but makes **no behavior change**: it does not stop rendering, does not modify frontmatter, and does not change the tag model. A full Obsidian Mode (render-stopping errors, frontmatter conversion, and the three-field `tagName` / `tagFullName` / `description` model with its AkashaRender schema/type changes) is deferred to a separate project. Because this task is advisory-only, it needs **no AkashaRender core changes**.

# Requested new functionality (summary)

1. Generate `index.html` in the tags directory via Plugin API + NJK macro (no custom elements)
2. Enhanced per-tag index pages: RSS, microformats, tag description, complete default partial/layout set, OpenGraph header metadata
3. Per-document tag list: microformats, complete partials, build-time hover popup
4. Document header OpenGraph metadata for the document's tags
5. Microformats correctness (research `h-entry`, `category`, `rel=tag`)
6. Obsidian compatibility check (advisory-only: report incompatible tags; no behavior change)
7. In-line tagged-items list custom element (limit, sort, item template)
8. Documentation + tests + `cli.mjs` rewrite

# Main tasks

## 1. Fix and modernize `cli.mjs` -- DONE

`cli.mjs` is broken (CommonJS in an ESM package). Rewrite using ESM `import`, dynamic config import (matching akasharender's `lib/cli.ts` pattern), and `commander`. Remove commands that duplicate akasharender core CLI tag commands; keep only plugin-specific commands. This unblocks Task 6's CLI commands.

DONE: Rewrote `cli.mjs` to ESM. Added a shared `setupConfig()` helper (dynamic config import + `akasha.setup`). Removed the old `docs`/`tags` commands (duplicates of core `docs-with-tag`/`tags`, and they called non-existent plugin methods). Kept two plugin-specific commands:
- `generate-indexes <configFN>` -- runs `generateTagIndexes()` to render tag index pages + per-tag RSS standalone.
- `tag-url <configFN> <tagName>` -- prints `plugin.tagPageUrl()` output as YAML.
Added shebang, `process.exit(1)` on error, and `js-yaml` output. Smoke-tested `--version`, `--help`, `tag-url`, and `generate-indexes` against a minimal config (full `test/config.mjs` blocked by a pre-existing test-env dependency-resolution issue unrelated to this change).

## 2. Microformats research and conventions (foundation) -- DONE

Investigate https://microformats.org/wiki/h-entry and decide the markup conventions before building partials:

- Per-document tag links: `rel="tag"` and/or `p-category` on the tag anchors
- Tag index entries: `h-entry` with `p-name`, `u-url`, `p-summary` (teaser), `dt-published`
- Document headers: how tags map to OpenGraph `article:tag`

Output: a short conventions note (in `guide/` or an `IMPLEMENTATION-*.md`) that the partials in later tasks follow. No "tag cloud" concepts.

DONE: Researched h-entry, rel="tag", and Open Graph specs. Wrote `IMPLEMENTATION-microformats.md` with the conventions later tasks follow. Key decisions:
- Tags are authoritative via `class="p-category"`. Article/listing items use `h-entry`; tag index listings are wrapped in `h-feed`.
- Tag index entries: `p-name` + `u-url` on the title link, `p-summary` for teaser, `dt-published` as `<time datetime="ISO8601">`.
- `rel="tag"` only on a document's own tag links (document-scoped), alongside `p-category`; NOT on aggregated listings (class names only).
- Open Graph: emit one `article:tag` per tag (with `og:type=article`) on documents; basic OG (`og:title`/`og:description`) on tag index pages.
- FINDING: current tag URLs end in `.html`, so the rel="tag" "last path segment = tag" rule would parse the wrong value. Resolved by relying on `p-category` for the value; extensionless tag URLs (`/tags/external/`) noted as a possible future change, out of scope.
- FOLLOW-UP for Task 5: expose an ISO 8601 publication date (`publishedISO`) on entry objects so partials can render `dt-published`.

## 3. Complete default partial + layout set -- DONE

Currently authors must supply their own partials/layout. Ship a full default set so the plugin works out of the box:

- A default tag-page layout (e.g. `tagpage.html.njk`) including header metadata block
- Tag index entry partial with microformats (Task 2)
- Per-document tag list partial with microformats (Task 2)
- Tags-directory index partial (Task 4)
- Keep `.njk` as primary; mirror `.ejs` only where the existing set already does

The `headerTemplate`/`indexTemplate` config strings should become optional, falling back to shipped templates. Preserve the `@title@`, `@tagName@`, `@tagDescription@` token behavior for backward compatibility.

DONE:
- Added a shipped `layouts/tagpage.html.njk` default layout (self-contained, no theme/base plugin dependency) with an Open Graph header block (`og:type=website`, `og:title`, `og:description`, `og:url`). Registered it via `config.addLayoutsDir(...)` in `configure()`.
- Rewrote `tagged-content-tagpagelist.html.{njk,ejs}` to wrap the listing in `h-feed` and each item in `h-entry` with `p-name u-url` on the title link, `p-summary` for the teaser, and `dt-published` (`<time datetime>`) when a `publishedISO` field is present.
- Updated `tagged-content-doctags.html.{njk,ejs}` to put `class="p-category"` + `rel="tag"` on each tag anchor (document-scoped is acceptable per Task 2); removed the inline `style`.
- Made `headerTemplate` optional: added `DEFAULT_HEADER_TEMPLATE` (declares `tagpage.html.njk`, renders a heading + description) used when the option is absent; token substitution preserved. Added `DEFAULT_INDEX_TEMPLATE` for Task 4's directory index.
- Injected `rc.metadata.tagName` / `rc.metadata.tagDescription` in `renderTagFile()` so layouts can build OG metadata without relying on header-template tokens.
- The Tags-directory index partial is deferred to Task 4 (directory-index generation is implemented there); `DEFAULT_INDEX_TEMPLATE` is ready for it.
- Verified by rendering with a config that sets NO `headerTemplate` and NO layouts dir: tag pages render via the shipped defaults with correct `h-feed`/`h-entry`/`p-category` microformats and OG metadata. Both `.njk` and `.ejs` partials render without error.

KNOWN ISSUE (pre-existing, not introduced here): there is a cache readiness race where `documentsCache.tags()` can return `[]` immediately after `akasha.setup()`/at `beforeSiteRendered` time, even though `documentsWithTag()` returns rows. This intermittently causes `generateTagIndexes()` to generate no tag pages. This matches akasharender's `FEATURE-Verify-IsReady-Timing.md`. The smoke test worked around it by polling `tags()` until stable before calling `generateTagIndexes()`. This should be investigated as it affects real renders.

## 4. Tags directory `index.html` -- DONE

Add Plugin API functions that produce the data for a tags-directory index, callable from an `index.html.njk` macro in the `tags` directory:

### `async tagsDirectoryData(config)` (name TBD)
Returns an array of `{ tagName, tagFullName?, description, tagUrl, rssUrl, count }` for every tag, sorted per `sortBy`. `count` is the number of documents with the tag.

- Provide a default `index.html.njk` (or NJK macro) in `partials/` that renders a list of links to each tag page, optionally including the per-tag RSS link.
- Generate this index as part of `generateTagIndexes()` (or alongside it) so it lands in `pathIndexes`.
- Because this list can include RSS links, deprecate `<tags-feeds-list>` (still functional, documented as deprecated).

DONE:
- Added Plugin API `async tagsDirectoryData(config)` returning one entry per tag `{ tagName, description, tagUrl, rssUrl, count }`, sorted by tag name. (`tagFullName` omitted -- that is part of the deferred Obsidian three-field model.) Also added helper `tagRSSUrl(config, tagName)`.
- Added default partial `partials/tagged-content-tagdirectory.html.njk` rendering a `<ul>` of tag links with document count, optional RSS link (`rel="alternate" type="application/rss+xml"`), and description.
- Added `generateTagsDirectoryIndex(config)` (exported) which renders the `index.html` from `indexTemplate` (or `DEFAULT_INDEX_TEMPLATE`) + the directory partial, through a new shared `renderVirtualTagPage()` helper (content -> layout -> Mahabhuta -> write). `generateTagIndexes()` now calls it after the per-tag pages, so `tags/index.html` lands in `pathIndexes`.
- RSS links shown by default; a site can disable with option `showTagDirectoryRSS: false`.
- Deprecated `<tags-feeds-list>`: it remains functional but logs a one-time deprecation warning and has a JSDoc deprecation note.
- Verified: `tags/index.html` is generated alongside per-tag pages, lists all tags sorted with counts/descriptions/RSS links, uses the shipped default layout + OG metadata. `tagsDirectoryData()` returns the documented shape. `<tags-feeds-list>` still renders and warns once.

NOTE: the Task 3 cache readiness race still applies -- the smoke test polled `tags()` until stable before calling `generateTagIndexes()`.

## 5. Enhanced per-tag index pages -- DONE

Extend `generateTagIndexes()` / `generateTagsList()` / `renderTagFile()`:

- **Tag description**: ensure the description shows on the page (currently via `@tagDescription@`); also expose it to the new default layout.
- **Microformats**: render each entry using the Task 2 / Task 3 microformat partial.
- **OpenGraph / header metadata**: inject tag name + description into page metadata so the layout emits OpenGraph tags (`og:title`, `og:description`, and where relevant `article:tag`).
- **RSS**: keep existing per-tag RSS generation; verify entry dates/titles/teasers are correct against `docLinkData()`.

DONE:
- Added `enrichEntry(config, entry, vpath)` (called per entry in `generateTagsList()`). It resolves a publication date from the document metadata (frontmatter `publicationDate`, else file mtime, else now) and attaches `publishedDate` / `publishedISO` / `published`, enabling the `dt-published` `<time datetime>` microformat in the tag list partial.
- The same helper also backfills `title` and `teaser` from document metadata when `docLinkData()` does not provide them (see core issue below), so entries render `p-name`, `p-summary`, and RSS items have correct titles/descriptions.
- Updated RSS generation to use the resolved `publishedDate` (previously it read `tagEntry.metadata.publicationDate`, which is undefined for `docLinkData()` entries, so RSS dates always fell back to file mtime).
- Tag description, `h-feed`/`h-entry`/`p-name`/`u-url`/`p-summary` microformats, and OpenGraph (`og:type=website`, `og:title`, `og:description`, `og:url`) were already provided by Task 3 and verified here. `article:tag` is intentionally NOT emitted on tag index pages -- a tag index is a listing (`og:type=website`), not an article; `article:tag` belongs on document pages (Task 7).
- Verified: tag pages render title link, teaser (`p-summary`), and `dt-published` from frontmatter dates; per-tag RSS now has correct titles, descriptions (teasers), and `pubDate`s.

CORE ISSUE FOUND (akasharender, not fixed here): `documentsCache.docLinkData()` returns only `{ vpath, renderPath }` -- `title` and `teaser` come back undefined even when fully indexed. Its SQL (`doc-link-data.sql`) extracts `$.metadata.title` / `$.metadata.teaser` from the stored `info` JSON, but those are not populated there (the title is available via `find()` under `metadata.title` / `docMetadata.title`). The plugin works around this by backfilling from `find()`. The core SQL/JSON path mismatch should be investigated in akasharender.

MINOR BUG (FIXED): the per-tag RSS channel `<link>` was built as `${config.root_url}${tagRSSFileName}` producing e.g. `https://example.comexternal.xml` (missing `/`). Confirmed this is solely a tagged-content bug (akasharender's core `generateRSS` is not involved). Fixed in `index.mjs` by resolving `plugin.tagRSSUrl(config, tagName)` against `config.root_url` via `new URL(...)`, yielding `https://example.com/tags/external.xml`. Tracked as akasharender issue #200 (to be closed there as it belongs to the plugin).

## 6. Per-document tag list with hover popup -- DONE

Extend `<tags-for-document>` / `doTagsForDocument()` / `tagged-content-doctags.html.njk`:

- Apply microformats consistently (Task 2).
- **Hover popup**: when hovering a tag, show a few items from that tag's indexed list. This must be **pre-rendered at build time** (no client-side fetch). The plugin computes, for each tag on the document, the top N entries (configurable N, default e.g. 5, sorted per `sortBy`) and embeds them in the popup markup. Use a CSS-only or minimal-JS popup; popup content is static HTML produced at render time.

DONE:
- Added reusable Plugin API `tagEntryList(config, tagName, { limit, sortBy })` returning enriched, sorted entries for a tag (reuses `documentsWithTag()` + `docLinkData()` + `enrichEntry()`). Also serves Task 8. Added `sortByPublishedDate` helper for date sorting of enriched entries.
- Rewrote `doTagsForDocument()` to, for each tag, pre-compute the top-N entries at build time and pass them as `popupEntries`. Count is `options.popupItemCount` (default 5); `0` disables popups.
- Updated `tagged-content-doctags.html.{njk,ejs}`: each tag is wrapped in `.tagged-content-tag`; the anchor keeps `class="p-category"` + `rel="tag"`; a `.tagged-content-tag-popup` sibling contains the pre-rendered top-N list (static HTML, no client fetch).
- Shipped a CSS-only popup stylesheet `assets/tagged-content.css` (shown on `:hover`/`:focus-within`), registered via `config.addAssetsDir(...)` mounted at `vendor/@akashacms/plugins-tagged-content`. Sites include it with `addStylesheet`.
- Verified: `doTagsForDocument` renders the tag with `p-category`/`rel="tag"` and a pre-rendered popup listing the tag's documents (sorted by title); `limit` works; `popupItemCount: 0` removes the popup; the CSS asset is copied by `copyAssets()`.

## 7. Document header OpenGraph for tags -- DONE

Add a Plugin method (and a partial/macro) to expose a document's tags as header meta tags (OpenGraph `article:tag`, etc.), suitable for inclusion in a site's `<head>` via the layout. This complements Task 5's tag-index OpenGraph.

DONE:
- Added Plugin method `doOpenGraphTags(config, metadata, { ogType })` that emits one `<meta property="article:tag" content="...">` per document tag (tag value = human tag name). Accepts `metadata.tags` as an array or comma-separated string. Optionally emits `<meta property="og:type" content="article">` when `ogType` is true (off by default, to avoid clashing with a site/theme that already sets og:type).
- Added custom element `<tags-for-document-opengraph>` (class `TagsForDocumentOpenGraphElement`), registered in `mahabhutaArray`. The `og-type` attribute (any value) enables the `og:type=article` meta. Intended for use in a layout `<head>`.
- Added partial `partials/tagged-content-opengraph.html.njk`.
- Verified: array tags emit one `article:tag` each; comma-string tags are parsed/trimmed; `og-type` adds `og:type=article` first; no tags emits nothing.

## 8. In-line tagged-items list element -- DONE

Add a single custom element (e.g. `<tagged-content-items>`) that generates a list of page references for a given tag, with attributes:

- `tag` -- the tag name (required)
- `limit` -- max items (optional)
- `sort-by` -- `title` | `date` (optional, default from plugin `sortBy`)
- `template` -- item template choosing title-only vs. title+teaser (optional)

Backed by a Plugin API function returning the entry list (reuse `documentsWithTag()` + `docLinkData()`).

DONE:
- Added custom element `<tagged-content-items>` (class `TaggedContentItemsElement`), registered in `mahabhutaArray`, with attributes `tag` (required), `limit`, `sort-by`, `template`.
- Added Plugin method `doTaggedContentItems(config, { tag, limit, sortBy, template })`, backed by the existing `tagEntryList()` (Task 6) which reuses `documentsWithTag()` + `docLinkData()` + `enrichEntry()`. Throws if `tag` is missing.
- `template` handling: `title`/`titles` -> title-only list; a partial name ending `.njk`/`.ejs` -> that partial; otherwise the default title + teaser list.
- Added partials `tagged-content-items.html.njk` (title + teaser, `h-feed`/`h-entry`/`p-name`/`u-url`/`p-summary`) and `tagged-content-items-titles.html.njk` (title-only, same microformats).
- Verified: default renders title+teaser microformats; `template="title"` renders the title-only list; `limit=2` truncates; `sort-by="date"` orders newest-first; missing `tag` throws.

## 9. Obsidian compatibility check (advisory-only) -- DONE

Provide an advisory check that reports which tags are not compatible with Obsidian's tag format. This task makes **no behavior change**: it does not stop rendering, does not modify frontmatter, and does not alter the tag model.

DONE:
- Added module-level helpers `obsidianTagIncompatibilityReasons(tagName)` and `isObsidianCompatibleTag(tagName)` (both exported). Rules: Obsidian tags may contain Unicode letters/marks, numbers, `_`, `-`, and `/` (nesting); they may not contain whitespace or other punctuation, and may not be numbers-only. Verified against a range of cases (letters, Unicode `café`/`项目`, nesting, `y1984` OK; `1984`, spaces, `. ? = & : #` rejected with reasons).
- Added Plugin API `obsidianIncompatibleTags(config)` returning `[{ tagName, reasons[], documents[] }]` for each incompatible tag in use. Read-only.
- Added `cli.mjs` command `obsidian-incompatible-tags <configFN>` printing the result as YAML (matching akasharender's tag CLI style).
- Confirmed advisory-only: no `obsidianMode` flag, no render-stopping errors, no frontmatter changes, no tag-model changes, no AkashaRender core changes.
- Verified end-to-end: API and CLI both report `External Links` (whitespace) and `node.js` (disallowed `.`) with their documents, while compatible tags are excluded; CLI exits 0 and appears in `--help`.

- A Plugin API function (and/or a `cli.mjs` command) that lists tags that are not Obsidian-compatible, along with the documents that use each.
- Output is informational (matching the YAML style of akasharender's tag CLI commands).
- No `obsidianMode` enforcement flag, no render-stopping errors, no tag conversion.

Explicitly out of scope (deferred to a separate Obsidian Mode project):

- Enforcement that stops rendering on incompatible tags.
- The three-field tag model (`tagName` / `tagFullName` / `description`).
- AkashaRender `TAGDESCRIPTION` schema and `TagDescription` type changes (e.g. adding `tagFullName`).
- A CLI command that converts tags to Obsidian-compatible format (writing frontmatter).

Because this task is advisory-only, it requires **no AkashaRender core changes** and has no cross-repo dependency.

## 10. Documentation

Rewrite `guide/index.html.md`:

- Bump install version from `^0.9.x` to `^0.10.x`.
- Remove documentation for the removed `<tag-list-container>` / `<tag-list-item>` elements (or mark removed).
- Document the new tags-directory index macro/API, microformats, OpenGraph, hover popup, in-line list element, and the advisory Obsidian compatibility check.
- Mark `<tags-feeds-list>` as deprecated.

DONE: Rewrote `guide/index.html.md`:
- Bumped install version to `^0.10.x`; switched to the ESM named import `{ TaggedContentPlugin }`.
- Documented all config options: `sortBy`, `pathIndexes`, optional `headerTemplate`/`indexTemplate` (with shipped-default fallback), `popupItemCount`, `showTagDirectoryRSS`.
- Documented tag descriptions via `config.addTagDescriptions([{ tagName, description }])` (replacing the old, never-implemented `tags:` option) and removed the documented-but-nonexistent `hasTag` function.
- Documented generated output (per-tag pages + RSS + `tags/index.html`), shipped default partials/layout, microformats and Open Graph behavior, and the popup CSS asset.
- Documented custom elements `<tags-for-document>`, `<tags-for-document-opengraph>` (with `og-type`), `<tagged-content-items>` (attributes), and marked `<tags-feeds-list>` DEPRECATED.
- Documented the Plugin API (`tagPageUrl`, `tagRSSUrl`, `tagsDirectoryData`, `tagEntryList`, `obsidianIncompatibleTags`) and the CLI (`generate-indexes`, `tag-url`, `obsidian-incompatible-tags`).
- Added an advisory Obsidian compatibility section.
- Verified every documented element name, attribute, option, API method, import, and CLI/bin name against the source.

# Plan (prioritized phases)

Ordering rationale: foundation first (broken CLI, microformat conventions, default templates), then the user-facing features that depend on them, then the advisory Obsidian check, then docs.

## Phase 1: Foundation

1. Task 1 -- Rewrite `cli.mjs` to ESM, remove duplicate commands. DONE
2. Task 2 -- Microformats research + conventions note. DONE (`IMPLEMENTATION-microformats.md`)
3. Task 3 -- Ship complete default partial + layout set; make `headerTemplate`/`indexTemplate` optional with fallbacks. DONE

## Phase 2: Tag index and directory

4. Task 4 -- Tags directory `index.html` via Plugin API + NJK macro; deprecate `<tags-feeds-list>`. DONE
5. Task 5 -- Enhanced per-tag index pages (description, microformats, OpenGraph, verify RSS). DONE

## Phase 3: Document-side features

6. Task 6 -- Per-document tag list microformats + build-time hover popup. DONE
7. Task 7 -- Document header OpenGraph for tags. DONE
8. Task 8 -- In-line `<tagged-content-items>` element. DONE

## Phase 4: Obsidian compatibility check (advisory-only)

9. Task 9 -- Advisory check + reporting of Obsidian-incompatible tags. No behavior change, no core changes. DONE

## Phase 5: Documentation

10. Task 10 -- Rewrite `guide/index.html.md`. DONE

# Testing

Tests follow the project pattern: Mocha + Chai, ES modules (`.mjs`), run from `test/`. Test Plugin API functions directly where possible; assert on generated output files for rendering features.

## Fixtures

The `test/` project (`config.mjs`, `documents/`, `layouts/`, `partials/`) already renders a tagged site. Extend it:

- Documents covering multiple shared tags so index pages, RSS, and hover popups have multiple entries.
- Tag descriptions configured via `addTagDescriptions` / plugin `tags` option, plus at least one tag with no description.
- For the Obsidian compatibility check: documents with both Obsidian-compatible and incompatible tag names.

## Per-task tests

- **Task 1 (cli.mjs)**: smoke-test that commands load and run against `test/config.mjs` without throwing.
- **Task 3 (default templates)**: render with no `headerTemplate`/`indexTemplate` set; assert shipped templates are used and pages render.
- **Task 4 (directory index)**: assert `tags/index.html` is generated, lists every tag, links to each tag page, and (if enabled) per-tag RSS links.
- **Task 5 (tag pages)**: assert tag description appears, microformat classes present (`h-entry`, `p-name`, `u-url`, etc.), OpenGraph meta present, and one RSS file per tag with correct items.
- **Task 6 (doc tag list + popup)**: assert microformat classes on tag anchors and that popup markup contains pre-rendered top-N entries (no client fetch).
- **Task 7 (header OpenGraph)**: assert `article:tag` (or chosen) meta tags appear for a document's tags.
- **Task 8 (in-line list)**: assert `<tagged-content-items>` honors `tag`, `limit`, `sort-by`, and `template` attributes.
- **Task 9 (Obsidian check)**: assert the advisory check reports incompatible tags (with their documents) and reports none when all tags are compatible; assert rendering and frontmatter are unchanged (no behavior change).
- **Task 10 (docs)**: no automated test; verify guide builds.
