# Microformats & metadata conventions for tagged-content

This note records the markup conventions the `@akashacms/plugins-tagged-content`
plugin follows when emitting tag-related HTML. It is the output of Task 2 of
`FEATURE-Tagged-Content-Revamp.md` and is the reference that the default
partials and layouts (Task 3 onward) must follow.

Goal: mark up tags so search engines and microformats2 parsers correctly
understand (a) which tags a document carries and (b) the documents listed on a
tag index page. No "tag cloud" concepts.

## Sources

- h-entry (microformats2): https://microformats.org/wiki/h-entry
- rel="tag": https://microformats.org/wiki/rel-tag
- Open Graph protocol: https://ogp.me/

## Background: the relevant vocabulary

### h-entry (microformats2)

`h-entry` is the microformats2 root class for a piece of syndicatable content
(blog post / article). Its core properties include:

- `p-name` -- entry title
- `p-summary` -- short summary (maps well to our "teaser")
- `u-url` -- entry permalink
- `dt-published` -- publication date (preferably a `<time datetime="...">`)
- `e-content` -- full content
- `p-author` -- author (optionally a nested `h-card`)
- **`p-category`** -- entry categories / tags  <-- this is the tag property

A tag is therefore a `p-category` property inside an `h-entry`.

### rel="tag"

`rel="tag"` marks a hyperlink whose destination is a "tag space" (a page that
collates the tag). Two important rules from the spec:

1. **The tag value is the LAST PATH SEGMENT of the href URL**, not the link
   text. `<a href="/tags/tech/" rel="tag">fish</a>` denotes the tag `tech`.
2. `rel="tag"` is intended for **visible** links (not `<link>` in `<head>`).
3. In HTML5 `rel` is effectively document-scoped, so the microformats community
   discourages relying on `rel` for properties on **aggregated** pages (home
   pages, archives, tag index listings). For aggregated listings, prefer the
   class-name property `p-category`.

microformats2 parsers treat a `rel="tag"` link found inside an `h-entry` as a
`p-category` value (taking the last path segment). So `rel="tag"` and
`p-category` compose naturally on a document's own tag links.

### Open Graph (`article:*`)

For `<head>` metadata with `og:type` = `article`:

- `article:tag` -- [string array] tag words for the article. Emit one
  `<meta property="article:tag" content="...">` per tag.
- `article:section` -- a single high-level section name (not used for tags).
- `article:published_time`, `article:author` -- available if useful.

For a tag **index** page, there is no Open Graph "tag" concept; use the basic
properties (`og:title`, `og:description`, `og:url`, `og:type=website`) to carry
the tag name and tag description.

## IMPORTANT: tag-page URL form and rel="tag"

The plugin currently generates tag page URLs like `/tags/external.html`
(`tagPageUrl()` -> `tag2encode4url()` + `.html`). Under the rel-tag rule above,
the last path segment of `/tags/external.html` is `external.html`, so a parser
would extract the tag value `external.html` -- wrong.

Two options for any anchor that carries `rel="tag"`:

- **A (chosen): rely on `p-category` for the value and let the link text be the
  human tag name.** Because our hrefs end in `.html`, use `class="p-category"`
  on the anchor as the authoritative tag value and treat `rel="tag"` as
  optional/decorative.
- **B (future, not adopted): switch tag pages to extensionless directory URLs**
  (`/tags/external/`) so the last path segment is the tag slug and `rel="tag"`
  parses correctly. This is a larger change (affects `tagPageUrl`,
  `generateTagIndexes`, and existing links) and is out of scope.

Decision: **use `p-category` as the authoritative tag property** on all tag
anchors. Add `rel="tag"` as well ONLY on a document's own tag list (not on
aggregated index listings), accepting that the parsed value would be the slug
file name; `p-category` carries the correct human value regardless.

### Current URL layout (kept as-is)

The implementation stays as it is:

- One page per tag at `tags/<tag-slug>.html` (plus `tags/<tag-slug>.xml` for the
  per-tag RSS feed).
- A single tags directory index at `tags/index.html`.

This is unchanged by this work and is the intended layout going forward.

### If extensionless tag URLs are ever adopted (future, informational)

Should option B be pursued later, the correct mechanism for a **static** site is
a directory plus an index file, NOT a server rewrite rule:

- Generate `tags/<tag-slug>/index.html` instead of `tags/<tag-slug>.html`.
- A request for `/tags/<tag-slug>/` is served the directory's `index.html` by
  essentially every web server's default behavior (Apache, nginx, GitHub Pages,
  Netlify, S3+CloudFront, etc.). A request for `/tags/<tag-slug>` is typically
  301-redirected to the trailing-slash form. The trailing slash is ignored by
  the rel-tag spec, so the parsed tag value becomes `<tag-slug>` -- correct.
- This approach needs **no `.htaccess` / server config** and works on hosts that
  forbid it (e.g. GitHub Pages), which keeps the output portable.

Do NOT rely on Apache `.htaccess` `MultiViews`/`RewriteRule` or nginx
`try_files` to map an extensionless file (a literal file named `<tag-slug>` with
no extension) to HTML. Those are host-specific, break on GitHub Pages, and
conflict with AkashaCMS's goal of portable static output.

The per-tag RSS file would move alongside the page (e.g.
`tags/<tag-slug>/index.xml`, or keep a sibling name). This is all deferred and
not implemented now.

## Conventions the partials MUST follow

### 1. A document's own tag list (`tags-for-document` / `tagged-content-doctags`)

Rendered inside (or adjacent to) the document's `h-entry`. Each tag is an
anchor to its tag index page:

```html
<span class="taglist">
  <a class="p-category taglink" rel="tag" href="{{ tagUrl }}">{{ tagName }}</a>
  ...
</span>
```

- `class="p-category"` is REQUIRED (authoritative tag value).
- `rel="tag"` is included here (document-scoped context is acceptable).
- The surrounding article template is expected to carry `class="h-entry"` for
  the `p-category` to attach to; the plugin documents this expectation but does
  not control the site's article layout.

### 2. Tag index page entries (`tagged-content-tagpagelist`)

A tag index page is a list (feed) of documents that share one tag. Mark the list
as `h-feed` and each entry as `h-entry`:

```html
<div class="h-feed tagged-content-tag-list">
  <article class="h-entry">
    <a class="p-name u-url" href="/{{ entry.renderPath }}">{{ entry.title }}</a>
    {% if entry.teaser %}<p class="p-summary">{{ entry.teaser }}</p>{% endif %}
    {% if entry.published %}
      <time class="dt-published" datetime="{{ entry.publishedISO }}">
        {{ entry.published }}
      </time>
    {% endif %}
  </article>
  ...
</div>
```

- `h-feed` wraps the listing; each item is an `h-entry`.
- `p-name` + `u-url` on the title link.
- `p-summary` for the teaser when present.
- `dt-published` as a `<time datetime="ISO8601">` when a date is available.
- Do NOT put `rel="tag"` here (aggregated content; class names only).

### 3. Tags-directory index entries (`tags/index.html`, Task 4)

A list of links to each tag's index page. These are links to tag spaces, not
article entries, so they are NOT `h-entry` items. Use plain accessible markup;
`p-category` is optional here because the target is the tag page itself:

```html
<ul class="tagged-content-tag-directory">
  <li>
    <a href="{{ tag.tagUrl }}">{{ tag.tagName }}</a>
    {% if tag.description %}<span class="tag-description">{{ tag.description }}</span>{% endif %}
    {% if tag.rssUrl %}<a rel="alternate" type="application/rss+xml" href="{{ tag.rssUrl }}">RSS</a>{% endif %}
  </li>
</ul>
```

### 4. Document `<head>` Open Graph for tags (Task 7)

For article documents, emit one `article:tag` meta per tag, plus `og:type`:

```html
<meta property="og:type" content="article" />
{% for tag in tags %}
<meta property="article:tag" content="{{ tag }}" />
{% endfor %}
```

`article:tag` content is the human tag name (not the slug).

### 5. Tag index page `<head>` Open Graph (Task 5)

A tag index page is a listing page; carry the tag name/description via basic OG:

```html
<meta property="og:type" content="website" />
<meta property="og:title" content="Pages tagged {{ tagName }}" />
{% if tagDescription %}
<meta property="og:description" content="{{ tagDescription }}" />
{% endif %}
<meta property="og:url" content="{{ rendered_url }}" />
```

## Data the plugin must supply to partials

To satisfy the above, the per-entry data objects produced by
`generateTagsList()` / `docLinkData()` should expose (some already exist):

- `title` -> `p-name`
- `renderPath` -> `u-url`
- `teaser` -> `p-summary`
- a publication date, ideally as both a display string and an ISO 8601 string
  (`publishedISO`) for `<time datetime>`. `docLinkData()` and the RSS code
  already resolve a date from `metadata.publicationDate` or file mtime; expose
  that to the entry object for `dt-published`.

Tag-level data (for index/directory/head):

- `tagName` (human), `tagUrl`, `description`, `rssUrl`, document `count`.

## Summary of decisions

- Tags are `p-category` (authoritative). `h-entry` wraps article/listing items;
  `h-feed` wraps tag index listings.
- `rel="tag"` only on a document's own tag links, with `p-category` alongside;
  not on aggregated listings.
- Open Graph: `article:tag` (one per tag) on article documents; basic OG
  (`og:title`/`og:description`) on tag index pages.
- URL layout is kept as-is: `tags/<tag-slug>.html` per tag (with
  `tags/<tag-slug>.xml` RSS), and a single `tags/index.html` directory index. Do
  not depend on rel="tag" URL parsing. Extensionless tag URLs are a possible
  future change (out of scope); if ever adopted, use directory + `index.html`
  (`tags/<tag-slug>/index.html`), not an `.htaccess`/server rewrite.
