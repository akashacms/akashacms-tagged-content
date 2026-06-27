---
layout: plugin-documentation.html.ejs
title: AkashaCMS Tagged-Content plugin documentation
---

_Tags_ are an excellent way to categorize and organize content.  Other platforms like Drupal or Wordpress or Blogger have similar features.  In `@akashacms/plugins-tagged-content` you add a list of tags to the document front-matter like so:

```yaml
---
layout: default.html.ejs
title: Links to external websites
tags: External, Links
---
```

The `tags` entry in the frontmatter is what contains the tags.  This example shows the tags as a comma-separated list.  They can also be presented as a YAML array, like so:

```yaml
---
layout: default.html.ejs
title: figure/img/caption
tags:
    - FigImg
---
```

This array has just one entry, but of course it supports any number of items.

The `tags` item is a feature in AkashaRender.  This plugin extends that feature to present it in various ways:

* A `tags-for-document` custom element shows the tags for the current document, with an optional pre-rendered hover popup listing other documents with each tag.
* A set of pages is generated, one page per tag, listing the documents with that tag, each accompanied by an RSS feed.
* An `index.html` page is generated in the tags directory, listing every tag.
* A `tagged-content-items` custom element renders an in-line list of documents for a given tag.
* A `tags-for-document-opengraph` custom element emits OpenGraph `article:tag` metadata in the page `<head>`.
* The generated markup uses [microformats](https://microformats.org/wiki/h-entry) (`h-feed`, `h-entry`, `p-category`, `p-name`, `u-url`, `p-summary`, `dt-published`) and Open Graph metadata so search engines can correctly understand the content.

# Installation

Add the following to `package.json`

```json
"dependencies": {
      ...
      "@akashacms/plugins-tagged-content": "^0.10.x",
      ...
}
```

Once added to `package.json` run: `npm install`

# Configuration

Add the following to `config.mjs`

```js
import { TaggedContentPlugin } from '@akashacms/plugins-tagged-content';

config
    ...
    .use(TaggedContentPlugin, {
        sortBy: 'title',
        pathIndexes: '/tags/'
    })
    ...
```

All options are optional except that `pathIndexes` must identify where the tag pages go.

_sortBy_: Controls the sorting of document entries on a tag index page.  Either `'title'` (default) or `'date'` (newest first).

_pathIndexes_: Controls where, within the site, the tag index pages are rendered (e.g. `/tags/`).

_headerTemplate_: The tag index pages are dynamically generated, meaning that you don't create them yourself.  This value controls the initial content of each.  It is a string containing YAML frontmatter and body content, and supports the tokens `@title@`, `@tagName@`, and `@tagDescription@`.  When omitted, the plugin uses a shipped default template and layout.

_indexTemplate_: The template used to generate the `index.html` in the tags directory.  When omitted, the plugin uses a shipped default.

_popupItemCount_: The number of documents to pre-render into each tag's hover popup in the per-document tag list.  Defaults to `5`.  Set to `0` to disable the popups.

_showTagDirectoryRSS_: Whether the tags directory `index.html` includes a per-tag RSS link.  Defaults to `true`.

## Tag descriptions

A _description_ can be associated with a tag.  Descriptions appear at the top of the tag's index page and alongside the tag in the tags directory.  Descriptions are provided through the AkashaRender configuration:

```js
config.addTagDescriptions([
    {
        tagName: "External",
        description: "Links to external websites"
    },
    {
        tagName: "FigImg",
        description: "Figure/Image test"
    }
]);
```

# Generated output

When the site is rendered, the plugin generates the following under `pathIndexes` (e.g. `/tags/`):

* One HTML page per tag (e.g. `/tags/external.html`) listing the documents that carry the tag.  Each entry is marked up as an `h-entry` within an `h-feed`, with `p-name`/`u-url`/`p-summary`/`dt-published`.  The page carries Open Graph metadata (`og:type=website`, `og:title`, `og:description`, `og:url`).
* One RSS feed per tag (e.g. `/tags/external.xml`) with the same documents, including their titles, teasers, and publication dates.
* An `index.html` listing every tag, with the document count, an optional RSS link, and the tag description.

The plugin ships default partials and a default layout (`tagpage.html.njk`), so it works out of the box.  You can override any of these by mounting your own partials/layouts directory with files of the same name.

# Styling the hover popup

The per-document tag list can show a hover popup listing other documents that share a tag.  The popup is pre-rendered at build time (no client-side fetch) and is shown with a CSS-only stylesheet shipped by the plugin.  Include it on pages that use `<tags-for-document/>`:

```js
config.addStylesheet({
    href: "/vendor/@akashacms/plugins-tagged-content/tagged-content.css"
});
```

# Custom Elements

```html
<tags-for-document/>
```

Generates an indicator of the tags for the current document, linking each to its tag page.  Each tag link is marked up with `class="p-category"` and `rel="tag"`.  When `popupItemCount` is greater than `0`, each tag includes a pre-rendered hover popup listing up to that many documents sharing the tag.

The tags are rendered through the `tagged-content-doctags.html.njk` partial.  Typically this element is used in the layout template for article pages.

```html
<tags-for-document-opengraph/>
```

For use in a layout's `<head>`.  Emits one `<meta property="article:tag" content="...">` per tag of the current document.  Add the `og-type` attribute to also emit `<meta property="og:type" content="article">`:

```html
<tags-for-document-opengraph og-type="article"></tags-for-document-opengraph>
```

```html
<tagged-content-items tag="Tag Name"/>
```

Renders an in-line list of documents that carry the named tag.  Attributes:

* `tag` (required) -- the tag name.
* `limit` -- the maximum number of documents to list.
* `sort-by` -- `title` or `date` (defaults to the plugin's `sortBy`).
* `template` -- `title` (or `titles`) for a title-only list; a partial file name ending in `.njk`/`.ejs` for a custom template; otherwise the default title + teaser list.

```html
<tags-feeds-list/>
```

**DEPRECATED.** Generates a list of links to the per-tag RSS feeds.  This is superseded by the tags directory `index.html` page, which lists every tag with an optional RSS link.  The element remains functional but logs a deprecation warning.

# Plugin API

The plugin object is reachable with `config.plugin('@akashacms/plugins-tagged-content')`.  Useful methods:

* `tagPageUrl(config, tagName)` -- the URL of a tag's index page.
* `tagRSSUrl(config, tagName)` -- the URL of a tag's RSS feed.
* `tagsDirectoryData(config)` -- an array of `{ tagName, description, tagUrl, rssUrl, count }` for every tag, suitable for rendering a tags directory.
* `tagEntryList(config, tagName, { limit, sortBy })` -- the enriched, sorted list of documents for a tag.
* `obsidianIncompatibleTags(config)` -- see below.

# Command line

The plugin provides a small CLI (`npx akashacms-tagged-content <command>`):

* `generate-indexes <configFN>` -- generate the tag index pages and per-tag RSS feeds.
* `tag-url <configFN> <tagName>` -- print the URL the plugin generates for a tag page.
* `obsidian-incompatible-tags <configFN>` -- see below.

# Obsidian compatibility (advisory)

If you also edit your content in [Obsidian](https://obsidian.md/), note that Obsidian enforces a stricter tag format than AkashaCMS: tags may contain letters, numbers, `_`, `-`, and `/` (for nesting), but may not contain spaces or other punctuation, and may not be numbers-only.

The plugin can report which of your tags would not be compatible with Obsidian.  This is **advisory only** -- it makes no changes to your content and does not affect rendering.

```shell
npx akashacms-tagged-content obsidian-incompatible-tags config.mjs
```

The output lists each incompatible tag, the reason(s), and the documents using it.  The same information is available programmatically via `config.plugin('@akashacms/plugins-tagged-content').obsidianIncompatibleTags(config)`.
