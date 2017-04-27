---
layout: plugin-documentation.html.ejs
title: AskashaCMS Tagged-Content plugin documentation
---

_Tags_ are an excellent way to categorize and organize content.  Other platforms like Drupal or Wordpress or Blogger have similar features.  In `akashacms-tagged-content` you add a comma-separated list of tags to the frontmatter, and three tools are available:

* A `tags-for-document` custom element shows the tags for the current document
* A `tag-cloud` custom element shows all tags, as a tag cloud.  I know tag clouds stopped being popular, but I like them
* A set of pages can be generated, one page per tag, showing the items associated with that tag

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

# Custom Tags


TODO - Have not written this yet.  Study the source code for clues.
