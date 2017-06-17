---
layout: plugin-documentation.html.ejs
title: AskashaCMS Tagged-Content plugin documentation
---

_Tags_ are an excellent way to categorize and organize content.  Other platforms like Drupal or Wordpress or Blogger have similar features.  In `akashacms-tagged-content` you add a list of tags to the document frontmatter, and three tools are available:

* A `tags-for-document` custom element shows the tags for the current document
* A `tag-cloud` custom element shows all tags, as a tag cloud.  I know tag clouds stopped being popular, but I like them
* A set of pages can be generated, one page per tag, showing the items associated with that tag

The tags are stored in the `tags` field in the document frontmatter.  They can be a YAML array like:

```
tags:
    - OpenAPI
    - Swagger
```

Or they can be a comma-separated string, like:

```
tags: OpenAPI, Swagger
```

# Installation

Add the following to `package.json`

```
"dependencies": {
      ...
      "akashacms-tagged-content": "akashacms/akashacms-tagged-content#akasharender",
      ...
}
```


The AkashaRender version of `akashacms-tagged-content` has not been published to `npm` yet, and therefore must be referenced this way.

Once added to `package.json` run: `npm install`

# Configuration

Add the following to `config.js`

```
config
    ...
    .use(require('akashacms-tagged-content'))
    ...

config.plugin("akashacms-tagged-content")
    .sortBy('title')
    .headerTemplate("---\ntitle: @title@\nlayout: tagpage.html.ejs\n---\n<p>Pages with tag @tagName@</p>")
    .tagsDirectory('/tags/');
```

_sortBy_: As suggested by the function name, this controls the sorting of tag entries in a tag index page.

_headerTemplate_: The tag index pages are dynamically generated, meaning that you don't create them yourself.  This value controls the initial content of each.

_tagsDirectory_: Controls where, within the site, the tag index pages are rendered.

# Custom Tags

```
<tag-cloud id="id" class="class" style="style"/>
```

Generates a tag cloud.  The wrapper has `id` and `class` and `style` attributes as specified by the (optional) attributes.

The tag cloud is rendered through the `tagged-content-cloud.html.ejs` template.

```
<tags-for-document/>
```

Generates an indicator of the tags for this document, linking them to the corresponding tag page.

The tags are rendered through the `tagged-content-doctags.html.ejs` template.

```
<% ... config.plugin('akashacms-tagged-content').hasTag(tags, 'Doctor Who') ... %>
```

The _hasTag_ function is useful for checking whether a given tag is set, or not.  This will allow you to modify the content based on the document tags.
