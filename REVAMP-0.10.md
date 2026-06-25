
For 0.10, one task is restructuring what the tagged-content plugin does.

# Overview of AkashaCMS tags

The core feature is handling "tags" on documents in AkashaCMS-based projects, and surfacing those tags in useful ways to users, search engines, and other systems.

Tags are a core feature supported by AkashaRender.  To add tags to a document, the author adds a `tags` element to the YAML frontmatter.  This element contains an array of strings, each of which is a tag.

Tags have two attributes: _tagName_ is the tag string in the frontmatter, and _description_ is a human-readable description for the tag.

Tags are stored in an AkashaRender SQL tables defined in:

* akasharender/lib/cache/sql/create-table-tag-description.sql
* akasharender/lib/cache/sql/create-table-tagglue.sql

Tag data is maintained in akasharender/lib/cache/cache-sqlite.ts

Tag descriptions are optional, and are added via the Configuration.addTagDescriptions method

# Present a directory of tag index pages

This is an existing feature.

This is configured in the Configuration object with this code:

```js
    .use(TaggedContentPlugin, {
        pathIndexes: '/tags/',
        headerTemplate: "---\ntitle: @title@\nlayout: tagpage.html.njk\n---\n<p>Pages with tag @tagName@</p>",
        sortBy: 'title'
    })
```

The `pathIndexes` field specifies where, in the output directory, the tag index pages are to be placed.

For each tag index page, a virtual document is generated, using the text in the `headerTemplate` field.  Appended to this are items listed on this tag index page.

The items in the tag index page are references to documents which have the corresponding tag.  Those documents are sorted by the value in the `sortBy` field.

NEW FEATURES FOR THE TAG INDEX PAGE

**RSS Feed**: There must be an RSS file containing the same data (list of document references).

**Microformats**: The tag index entries must be marked up with microformat classes

**Tag description**: The tag index page must show the tag description.

**Complete implementation**: Currently it's up to site author to implement partials and page layout.  The plugin should offer a full set of these, including the microformat implementation.

**Header metadata**: Aspects of the tag name and tag description must be promoted as opengraph metadata

# In a document, present its tag list, linking to tag index pages

There are existing features for this, such as partials/tagged-content-doctags.html.njk

**Microformats**: Make sure microformats are used

**Complete Implementation**: Offer complete partials for this purpose

# In document header metadata, present opengraph tags for document tags

Need a method to expose these in metatags such as opengraph

# Obsidian compatibility

It's highly desirable to use Obsidian to edit AkashaCMS projects

In Obsidian, the document frontmatter can have a `tags` field containing an array of strings, just like AkashaCMS.  But, in Obsidian, the tag format is strictly controlled where in AkashaCMS it's anything you want.

We can have have an _Obsidian Mode_ declared in the Configuration.

When this mode is active, tags will be screened for compatibility with Obsidian.  Impact:

* Incompatible tags are an error that should stop project rendering
* CLI command to find incompatible tags
* CLI command to convert tags to Obsidian compatible format

This means the core tag definition must become:

* _tagName_ -- Obsidian-compatible tag name
* _tagFullName_ -- Human-friendly version of the tag name
* _description_ -- Human-friendly description

