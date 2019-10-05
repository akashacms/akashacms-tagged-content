---
layout: plugin-documentation.html.ejs
title: AskashaCMS Tagged-Content plugin documentation
---

_Tags_ are an excellent way to categorize and organize content.  Other platforms like Drupal or Wordpress or Blogger have similar features.  In `@akashacms/plugins-tagged-content` you add a list of tags to the document front-matter, and three tools are available:

* A `tags-for-document` custom element shows the tags for the current document
* A `tag-cloud` custom element shows all tags, as a tag cloud.  I know tag clouds stopped being popular, but I like them
* A set of pages can be generated, one page per tag, showing the items associated with that tag

The tags are stored in the `tags` field in the document front-matter.  They can be a YAML array like:

```yaml
tags:
    - OpenAPI
    - Swagger
```

Or they can be a comma-separated string, like:

```yaml
tags: OpenAPI, Swagger
```

# Installation

Add the following to `package.json`

```json
"dependencies": {
      ...
      "akashacms-tagged-content": "^0.7.x",
      ...
}
```

Once added to `package.json` run: `npm install`

# Configuration

Add the following to `config.js`

```js
config
    ...
    .use(require('@akashacms/plugins-tagged-content'), {
        sortBy: 'title',
        // @tagDescription@ can only appear once
        headerTemplate: "---\ntitle: @title@\nlayout: tagpage.html.ejs\n---\n<p><a href='./index.html'>Tag Index</a></p><p>Pages with tag @tagName@</p><p>@tagDescription@</p>",
        indexTemplate: "---\ntitle: Tags for AkashaCMS Example site\nlayout: tagpage.html.ejs\n---\n",
        pathIndexes: '/tags/',
        tags: [
            {
                name: "Tag Name 1",
                description: "Tag description text"
            }
        ]
    })
    ...
```

_sortBy_: As suggested by the function name, this controls the sorting of tag entries in a tag index page.

_headerTemplate_: The tag index pages are dynamically generated, meaning that you don't create them yourself.  This value controls the initial content of each.

_pathIndexes_: Controls where, within the site, the tag index pages are rendered.

_indexTemplate_: Is the template used to generate the `index.html` in the tags directory.

_tags_: Is an array of items where we can list descriptions for a given tag.

# Custom Tags

```html
<tag-cloud id="id" class="class" style="style"/>
```

Generates a tag cloud.  The wrapper has `id` and `class` and `style` attributes as specified by the (optional) attributes.

The tag cloud is rendered through the `tagged-content-cloud.html.ejs` template.

```html
<tags-for-document/>
```

Generates an indicator of the tags for this document, linking them to the corresponding tag page.

The tags are rendered through the `tagged-content-doctags.html.ejs` template.

```php
<% ... config.plugin('@akashacms/plugins-tagged-content').hasTag(tags, 'Doctor Who') ... %>
```

The _hasTag_ function is useful for checking whether a given tag is set, or not.  This will allow you to modify the content based on the document tags.

```html
<tag-list-container/>
```

Generated into the `index.html` for the tags directory.  This is a wrapper element meant to surround the tag list.

The template is `tagged-content-list-container.html.ejs`, so override this to customize the presentation.

```html
<tag-list-item/>
```

This is an individual item in the tag list in the `index.html` in the tags directory.

The template is `tagged-content-list-item.html.ejs`, so override this to customize the presentation.