---
layout: plugin-documentation.html.ejs
title: AskashaCMS Tagged-Content plugin documentation
---

_Tags_ are an excellent way to categorize and organize content.  Other platforms like Drupal or Wordpress or Blogger have similar features.  In `@akashacms/plugins-tagged-content` you add a list of tags to the document front-matter like so:

```yaml
---
layout: default.html.ejs
title: Links to external websites
tags: External, Links
---
```

The `tags` entry in the frontmatter is what contains the tags. This example shows the tags as a comma-separated list.  They can also be presented as a YAML array, like so:

```yaml
---
layout: default.html.ejs
title: figure/img/caption
tags:
    - FigImg
---
```

This array has just one entry, but of course it supports any number of items.

The `tags` item is a feature in Akasharender.  This plugin extends that feature to present it in various ways.

* A `tags-for-document` custom element shows the tags for the current document
* A set of pages can be generated, one page per tag, showing the items associated with that tag

# Installation

Add the following to `package.json`

```json
"dependencies": {
      ...
      "@akashacms/plugins-tagged-content": "^0.9.x",
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
<tags-for-document/>
```

Generates an indicator of the tags for this document, linking them to the corresponding tag page.

The tags are rendered through the `tagged-content-doctags.html.njk` template.

Typically this tag is used in the layout template for article templates.

```php
<% ... config.plugin('@akashacms/plugins-tagged-content').hasTag(tags, 'Doctor Who') ... %>
```

The _hasTag_ function is useful for checking whether a given tag is set, or not.  This will allow you to modify the content based on the document tags.

The portion of this, `config.plugin('@akashacms/plugins-tagged-content')`, asks Akasharender to access the Plugin object.  Hence, this makes a direct call to the `hasTag` function.

```html
<tags-feeds-list/>
```

Generates a list of links to RSS files corresponding to each tag.  RSS files are an XML format showing data for a list of links.  These RSS files are generated as a byproduct of generating tag pages, and list information about each article containing the given tag.

The `template` attribute lets you override the template used.  By default the feeds list is generated through the `tagged-content-feedlist.html.njk` partial.

The `additional-classes` attribute lets you add additional class names to the `<div>` in the partial template.

```html
<tag-list-container/>
```

DISABLED BECAUSE OF CURRENT DISUSE

Generated into the `index.html` for the tags directory.  This is a wrapper element meant to surround the tag list.

The template is `tagged-content-list-container.html.njk`, so override this to customize the presentation.  Use the `template` attribute to change the template name.

The template includes a `<div>` wrapping around the content.  Adding a `id` attribute sets the `id` of this `<div>`.  Adding an `additional-classes` attribute adds class names to the `<div>`.  The default template has the class name `tagged-content-tag-list-container`.

It is to be used with other tags as so:

```html
<tags-list-container id="example-tags-list-container">
    other content including other custom tags
</tags-list-container>
```

```html
<tag-list-item/>
```

DISABLED BECAUSE OF CURRENT DISUSE

This is an individual item in the tag list in the `index.html` in the tags directory.

The template is `tagged-content-list-item.html.njk`, so override this to customize the presentation.  Use the `template` attribute to change the template name.

The template includes a `<div>` wrapping around the content.  Adding a `id` attribute sets the `id` of this `<div>`.  Adding an `additional-classes` attribute adds class names to the `<div>`.  The default template has the class name `tagged-content-tag-list-item`.

The `href` attribute is the URL to use in the link.  The `name` attribute is the anchor text to use in the link.

The content of the tag becomes the _description_ text in the link.

```html
<tag-list-item name="Tag name" href="URL for tag">
    Descriptive text
</tag-list-item>
```

In the source for the plugin, there is commented-out code that shows using `tag-list-container` and `tag-list-item` to generate an `index.html` in the tags directory.  The generated `index.html` would contain something like this:

```html
<tag-list-container>
    <tag-list-item name="Tag1" href="..">
        ..description
    </tag-list-item>
    <tag-list-item name="Tag2" href="..">
        ..description
    </tag-list-item>
    <tag-list-item name="Tag3" href="..">
        ..description
    </tag-list-item>
</tag-list-container>
```

REMOVED DUE TO DISUSE: Both `tag-list-item` and `tag-list-container` are currently unused.  The goal was to support generating an `index.html` in the tags directory.

SUGGESTED COURSE CHANGE: At this moment my goal is to decrease the number of custom tags to decrease the computation required to render a site.  To serve that goal, do not reinstate these tags.  Instead, develop NJK macros to call Plugin functions that serve generating such an index page.

There could be `index.html.njk` in the `tags` directory which calls equivalent Plugin functions.

```html
<div id="tags-list">
    {% make a call to the Plugin which generates
       a list of links to tags pages.
       
       This list
       could also include the link to the RSS file
       for each tag.  Doing so would remove the
       necessity for the tags-feeds-list element.
    %}
</div>
```

See https://github.com/akashacms/akasharender/issues/33

See https://github.com/akashacms/akasharender/issues/32

