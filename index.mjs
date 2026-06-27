/**
 *
 * Copyright 2013-2025 David Herron
 *
 * This file is part of AkashaCMS-tagged-content (http://akashacms.com/).
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

import path from 'node:path';
import util from 'node:util';
import fs, { promises as fsp } from 'node:fs';
import url from 'node:url';
import RSS from 'rss';
import akasha, {
    renderContent,
    CustomElement
} from 'akasharender';
const mahabhuta = akasha.mahabhuta;

const pluginName = "@akashacms/plugins-tagged-content";

const __dirname = import.meta.dirname;

export class TaggedContentPlugin extends akasha.Plugin {

    #config;
    #tagsdir;

    constructor() { super(pluginName); }

    configure(config, options) {
        this.#config = config;
        // this.config = config;
        this.akasha = config.akasha;
        this.options = options ? options : {};
        this.options.config = config;
        config.addPartialsDir(path.join(__dirname, 'partials'));
        config.addLayoutsDir(path.join(__dirname, 'layouts'));
        config.addAssetsDir({
            src: path.join(__dirname, 'assets'),
            dest: 'vendor/@akashacms/plugins-tagged-content'
        });
        config.addMahabhuta(mahabhutaArray(options, config, this.akasha, this));
    }

    get config() { return this.#config; }

    sortBy(sort) {
        this.options.sortBy = sort;
        return this;
    }

    headerTemplate(template) {
        this.options.headerTemplate = template;
        return this;
    }

    tagsDirectory(dirName) {
        this.options.pathIndexes = dirName;
        return this;
    }

    isLegitLocalHref(config, href) {
        return href.startsWith(this.options.pathIndexes);
    }

    // Does this need to run both before AND after?
    beforeSiteRendered(config) {
        return generateTagIndexes(config);
    }

    // What was this created to do?
    // Is this used anywhere?
    //
    // docHasTag(document, tag) {
    //     let tags = [];
    //     if (document.metadata && document.metadata.tags) {
    //         tags = document.metadata.tags;
    //     }
    //     return tags.includes(tag);
    // }

    tagPageUrl(config, tagName) {
        if (this.options.pathIndexes.endsWith('/')) {
            return this.options.pathIndexes + tag2encode4url(tagName) +'.html';
        } else {
            return this.options.pathIndexes +'/'+ tag2encode4url(tagName) +'.html';
        }
    }

    /**
     * URL for the per-tag RSS feed file.
     */
    tagRSSUrl(config, tagName) {
        if (this.options.pathIndexes.endsWith('/')) {
            return this.options.pathIndexes + tag2encode4url(tagName) +'.xml';
        } else {
            return this.options.pathIndexes +'/'+ tag2encode4url(tagName) +'.xml';
        }
    }

    /**
     * Produce the data needed to render a tags-directory index page.
     *
     * Returns one entry per tag used on the site, sorted by tag name, each:
     *   {
     *     tagName,      // the human tag name
     *     description,  // the tag description (empty string if none)
     *     tagUrl,       // URL of the per-tag index page
     *     rssUrl,       // URL of the per-tag RSS feed
     *     count         // number of documents carrying the tag
     *   }
     *
     * Intended to be called from a tags-directory `index.html` template / NJK
     * macro, or used by the plugin when generating that index page.
     *
     * @param {*} config
     * @returns {Promise<Array<object>>}
     */
    async tagsDirectoryData(config) {
        const documents = config.akasha.filecache.documentsCache;
        const tags = await documents.tags();

        const entries = [];
        for (const tagnm of tags) {
            const vpaths = await documents.documentsWithTag(tagnm);
            const description = await documents.getTagDescription(tagnm);
            entries.push({
                tagName: tagnm,
                description: (typeof description === 'string') ? description : '',
                tagUrl: this.tagPageUrl(config, tagnm),
                rssUrl: this.tagRSSUrl(config, tagnm),
                count: Array.isArray(vpaths) ? vpaths.length : 0
            });
        }

        entries.sort((a, b) => {
            const ta = a.tagName.toLowerCase();
            const tb = b.tagName.toLowerCase();
            if (ta < tb) return -1;
            if (ta > tb) return 1;
            return 0;
        });

        return entries;
    }

    /**
     * Return the list of document entries carrying a given tag.
     *
     * Each entry is enriched (title, teaser, publishedDate/publishedISO/
     * published) and sorted. Reused by the per-document tag-list hover popup
     * and by the in-line tagged-items element.
     *
     * @param {*} config
     * @param {string} tagName
     * @param {object} [opts]
     * @param {number} [opts.limit]  max entries to return (0/undefined = all)
     * @param {string} [opts.sortBy] 'title' | 'date' (default: plugin sortBy)
     * @returns {Promise<Array<object>>}
     */
    async tagEntryList(config, tagName, opts) {
        const options = opts || {};
        const documents = config.akasha.filecache.documentsCache;
        const vpaths = await documents.documentsWithTag(tagName);

        const entries = [];
        if (Array.isArray(vpaths)) {
            for (const vp of vpaths) {
                const entry = await documents.docLinkData(vp);
                await enrichEntry(config, entry, vp);
                entries.push(entry);
            }
        }

        const sortBy = options.sortBy
            ? options.sortBy
            : this.options.sortBy;
        if (sortBy === 'date') {
            entries.sort(sortByPublishedDate);
            entries.reverse();
        } else {
            entries.sort(sortByTitle);
        }

        if (typeof options.limit === 'number' && options.limit > 0) {
            return entries.slice(0, options.limit);
        }
        return entries;
    }

    /**
     * ADVISORY-ONLY Obsidian compatibility check.
     *
     * Reports which tags used on the site are not compatible with Obsidian's
     * tag format, together with the documents that use each. This makes NO
     * behavior change: it does not stop rendering, modify frontmatter, or alter
     * the tag model. A full Obsidian Mode is a separate, future project.
     *
     * @param {*} config
     * @returns {Promise<Array<{ tagName: string, reasons: string[], documents: string[] }>>}
     */
    async obsidianIncompatibleTags(config) {
        const documents = config.akasha.filecache.documentsCache;
        const tags = await documents.tags();

        const results = [];
        for (const tagnm of tags) {
            const reasons = obsidianTagIncompatibilityReasons(tagnm);
            if (reasons.length > 0) {
                const vpaths = await documents.documentsWithTag(tagnm);
                results.push({
                    tagName: tagnm,
                    reasons,
                    documents: Array.isArray(vpaths) ? vpaths : []
                });
            }
        }
        return results;
    }

    async doTagsForDocument(config, metadata, template) {
        const plugin = this;
        const taglist = (
                'tags' in metadata
              && Array.isArray(metadata.tags)
            ) ? metadata.tags : [];

        if (!taglist || taglist.length === 0) return "";

        // Number of items to pre-render into each tag's hover popup at build
        // time. Default 5; set popupItemCount: 0 to disable popups.
        const popupItemCount = (typeof plugin.options.popupItemCount === 'number')
            ? plugin.options.popupItemCount
            : 5;

        const tagz = [];
        for (const tag of taglist) {
            let popupEntries = [];
            if (popupItemCount > 0) {
                // Pre-render the top-N entries for this tag so the popup is
                // static HTML produced at build time (no client-side fetch).
                popupEntries = await plugin.tagEntryList(config, tag, {
                    limit: popupItemCount
                });
            }
            tagz.push({
                tagName: tag,
                tagUrl: plugin.tagPageUrl(config, tag),
                popupEntries
            });
        }

        return akasha.partial(config, template, { tagz });
    }

    /**
     * Produce OpenGraph header `<meta>` tags for a document's tags.
     *
     * Emits one `<meta property="article:tag" content="...">` per tag. The tag
     * value is the human tag name. Optionally also emits
     * `<meta property="og:type" content="article">` (set ogType to true) for
     * sites that do not already declare an og:type elsewhere.
     *
     * Intended for inclusion in the site's `<head>` via a layout, e.g. using
     * the `<tags-for-document-opengraph>` custom element.
     *
     * @param {*} config
     * @param {object} metadata  the document metadata (uses metadata.tags)
     * @param {object} [opts]
     * @param {boolean} [opts.ogType]  also emit og:type=article (default false)
     * @returns {Promise<string>}
     */
    async doOpenGraphTags(config, metadata, opts) {
        const options = opts || {};

        // Accept tags as an array or a comma-separated string.
        let tags = [];
        if (metadata && 'tags' in metadata) {
            if (Array.isArray(metadata.tags)) {
                tags = metadata.tags;
            } else if (typeof metadata.tags === 'string') {
                tags = metadata.tags
                    .split(',')
                    .map(t => t.trim())
                    .filter(t => t.length > 0);
            }
        }

        if (tags.length === 0) return "";

        return akasha.partial(config,
            "tagged-content-opengraph.html.njk",
            { tags, ogType: options.ogType === true });
    }

    /**
     * Render an in-line list of documents carrying a given tag.
     *
     * @param {*} config
     * @param {object} [opts]
     * @param {string} opts.tag       the tag name (required)
     * @param {number} [opts.limit]   max items
     * @param {string} [opts.sortBy]  'title' | 'date' (default: plugin sortBy)
     * @param {string} [opts.template] item presentation:
     *        - 'title' / 'titles' -> title-only list
     *        - a partial file name (ending .njk/.ejs) -> that partial
     *        - otherwise (default) -> title + teaser list
     * @returns {Promise<string>}
     */
    async doTaggedContentItems(config, opts) {
        const options = opts || {};
        const tag = options.tag;
        if (typeof tag !== 'string' || tag.length === 0) {
            throw new Error(`tagged-content-items requires a "tag" attribute`);
        }

        const entries = await this.tagEntryList(config, tag, {
            limit: options.limit,
            sortBy: options.sortBy
        });

        // Choose the item-list template.
        let template;
        const t = options.template;
        if (typeof t === 'string'
         && (t.endsWith('.njk') || t.endsWith('.ejs'))) {
            template = t;
        } else if (t === 'title' || t === 'titles') {
            template = "tagged-content-items-titles.html.njk";
        } else {
            template = "tagged-content-items.html.njk";
        }

        return akasha.partial(config, template, {
            tagName: tag,
            entries
        });
    }
};

export function mahabhutaArray(
    options,
    config, // ?: Configuration,
    akasha, // ?: any,
    plugin  // ?: Plugin
) {
    let ret = new mahabhuta.MahafuncArray(pluginName, options);
    ret.addMahafunc(new TagsForDocumentElement(config, akasha, plugin));
    ret.addMahafunc(new TagsForDocumentOpenGraphElement(config, akasha, plugin));
    ret.addMahafunc(new TaggedContentItemsElement(config, akasha, plugin));
    ret.addMahafunc(new TagsFeedsListElement(config, akasha, plugin));
    // REMOVED DUE TO DISUSE
    // ret.addMahafunc(new TagsListItemElement());
    // ret.addMahafunc(new TagsListContainerElement());
    return ret;
};

class TagsForDocumentElement extends CustomElement {
    get elementName() { return "tags-for-document"; }
    async process($element, metadata, dirty, done) {
        const plugin = this.config.plugin(pluginName);
        return await plugin.doTagsForDocument(this.config,
                metadata, "tagged-content-doctags.html.njk");
    }
}

/**
 * Custom element `<tags-for-document-opengraph>` for use in a layout's `<head>`.
 *
 * Emits OpenGraph `article:tag` meta tags for the current document's tags.
 * Set the `og-type` attribute (any value) to also emit og:type=article.
 */
class TagsForDocumentOpenGraphElement extends CustomElement {
    get elementName() { return "tags-for-document-opengraph"; }
    async process($element, metadata, dirty, done) {
        const plugin = this.config.plugin(pluginName);
        const ogType = typeof $element.attr('og-type') !== 'undefined';
        return await plugin.doOpenGraphTags(this.config, metadata, { ogType });
    }
}

/**
 * Custom element `<tagged-content-items>` -- an in-line list of documents
 * carrying a given tag.
 *
 * Attributes:
 *   - tag       (required) the tag name
 *   - limit     (optional) max number of items
 *   - sort-by   (optional) 'title' | 'date' (default: plugin sortBy)
 *   - template  (optional) 'title'/'titles' for a title-only list, a partial
 *               file name (.njk/.ejs) for a custom template, otherwise the
 *               default title + teaser list
 */
class TaggedContentItemsElement extends CustomElement {
    get elementName() { return "tagged-content-items"; }
    async process($element, metadata, dirty, done) {
        const plugin = this.config.plugin(pluginName);
        const tag = $element.attr('tag');
        const limitAttr = $element.attr('limit');
        const limit = (typeof limitAttr !== 'undefined')
            ? parseInt(limitAttr, 10)
            : undefined;
        const sortBy = $element.attr('sort-by');
        const template = $element.attr('template');
        return await plugin.doTaggedContentItems(this.config, {
            tag,
            limit: Number.isNaN(limit) ? undefined : limit,
            sortBy,
            template
        });
    }
}

// One-time deprecation warning guard for <tags-feeds-list>.
let warnedTagsFeedsListDeprecated = false;

/**
 * DEPRECATED custom element `<tags-feeds-list>`.
 *
 * This element generates a list of links to the per-tag RSS feeds. It is
 * deprecated in favor of the tags-directory `index.html` page (see
 * generateTagsDirectoryIndex), which lists every tag with an optional RSS link
 * and removes the need for a separate feeds-list element. It remains functional
 * for backward compatibility.
 */
class TagsFeedsListElement extends CustomElement {
    get elementName() { return "tags-feeds-list"; }
    async process($element, metadata, dirty, done) {
        if (!warnedTagsFeedsListDeprecated) {
            warnedTagsFeedsListDeprecated = true;
            console.warn(`[${pluginName}] <tags-feeds-list> is deprecated; use the tags-directory index.html page (generateTagsDirectoryIndex) instead.`);
        }
        const plugin = this.config.plugin(pluginName);
        // const start = new Date();
        const template = $element.attr('template') 
                ? $element.attr('template')
                :  "tagged-content-feedlist.html.njk";
        const id = $element.attr('id');
        const additionalClasses = $element.attr('additional-classes')
                ? $element.attr('additional-classes')
                : "";

        // Receives an array of just the tag names.
        let tagnames = await this.akasha.filecache
                .documentsCache.tags();

        // console.log(`TagsFeedsListElement tags ${util.inspect(tagnames)}`);

        // Generate an array for tagged-content-feedlist
        let tagEntries = [];
        for (const tagnm of tagnames) {
            const tagNameEncoded = tag2encode4url(tagnm);
            tagEntries.push({
                tagName: tagnm,
                teaser: await this.akasha.filecache
                            .documentsCache.getTagDescription(tagnm),
                rssHREF: path.join(
                    this.array.options.pathIndexes,
                    `${tagNameEncoded}.xml`
                ),
            });
        }

        // console.log(`TagsFeedsListElement tagEntries ${util.inspect(tagEntries)}`);

        const ret = await this.akasha.partial(this.config, template, {
            id, additionalClasses, tag2encode4url,
            pathIndexes: this.array.options.pathIndexes,
            entries: tagEntries
        });
        // console.log(`TagsFeedsListElement after partial ${template} ==> ${ret}`);
        // console.log(`TagsFeedsListElement after partial ${template} ${(new Date() - start) / 1000} seconds`);

        return ret;
    }
}

/////// REMOVED DUE TO DISUSE

// class TagsListContainerElement extends mahabhuta.CustomElement {
//     get elementName() { return "tag-list-container"; }
//     process($element, metadata, dirty, done) {
//         const template = $element.attr('template') 
//                 ? $element.attr('template')
//                 :  "tagged-content-list-container.html.njk";
//         const id = $element.attr('id');
//         const additionalClasses = $element.attr('additional-classes')
//                 ? $element.attr('additional-classes')
//                 : "";
//         const content = $element.html()
//                 ? $element.html()
//                 : "";
//         return this.array.options.config.akasha.partial(this.array.options.config, template, {
//             id, additionalClasses, content
//         });
//     }
// }

/////// REMOVED DUE TO DISUSE

// class TagsListItemElement extends mahabhuta.CustomElement {
//     get elementName() { return "tag-list-item"; }
//     process($element, metadata, dirty, done) {
//         const template = $element.attr('template') 
//                 ? $element.attr('template')
//                 :  "tagged-content-list-item.html.njk";
//         const id = $element.attr('id');
//         const additionalClasses = $element.attr('additional-classes')
//                 ? $element.attr('additional-classes')
//                 : "";
//         const name = $element.attr('name');
//         const href = $element.attr('href');
//         const description = $element.html()
//                 ? $element.html()
//                 : "";
//         return this.array.options.config.akasha.partial(this.array.options.config, template, {
//             id, additionalClasses, description, name, href
//         });
//     }
// }

/**
 * Default header template for a per-tag index page.
 *
 * Used when the site does not supply its own `headerTemplate` option. It
 * declares the shipped `tagpage.html.njk` layout and renders a visible heading
 * plus the tag description. The `@title@`, `@tagName@`, and `@tagDescription@`
 * tokens are substituted by renderTagFile() for backward compatibility.
 *
 * Note: the tag name and description are also injected into the page metadata
 * (rc.metadata.tagName / rc.metadata.tagDescription) so layouts can build
 * OpenGraph metadata without relying on these tokens.
 */
const DEFAULT_HEADER_TEMPLATE =
    "---\n"
  + "title: \"@title@\"\n"
  + "layout: tagpage.html.njk\n"
  + "---\n"
  + "<h1 class=\"p-name\">Pages tagged @tagName@</h1>\n"
  + "<p class=\"tag-description\">@tagDescription@</p>\n";

/**
 * Default index template for the `index.html` in the tags directory.
 *
 * Used when the site does not supply its own `indexTemplate` option.
 */
const DEFAULT_INDEX_TEMPLATE =
    "---\n"
  + "title: Tags\n"
  + "layout: tagpage.html.njk\n"
  + "---\n"
  + "<h1>Tags</h1>\n";

/**
 * Determine why a tag name is not compatible with Obsidian's tag format.
 *
 * Obsidian tags may contain letters (including Unicode letters), numbers,
 * underscore (_), hyphen (-), and forward slash (/) for nesting. They cannot
 * contain spaces or other punctuation, and a tag cannot be made of numbers
 * only (it must contain at least one non-numeric character).
 *
 * See: https://help.obsidian.md/Editing+and+formatting/Tags
 *
 * This is ADVISORY ONLY -- it reports incompatibilities and changes nothing.
 *
 * @param {string} tagName
 * @returns {string[]} list of human-readable reasons (empty if compatible)
 */
export function obsidianTagIncompatibilityReasons(tagName) {
    const reasons = [];
    if (typeof tagName !== 'string' || tagName.length === 0) {
        reasons.push('empty tag name');
        return reasons;
    }
    if (/\s/.test(tagName)) {
        reasons.push('contains whitespace');
    }
    // Allowed: Unicode letters/marks, numbers, _ - /
    // Anything outside that set is a disallowed character.
    const disallowed = tagName.replace(/[\p{L}\p{M}\p{N}_\/-]/gu, '');
    if (disallowed.length > 0) {
        const uniq = Array.from(new Set(disallowed.split('')))
            .filter(c => !/\s/.test(c));
        if (uniq.length > 0) {
            reasons.push(`contains disallowed character(s): ${uniq.join(' ')}`);
        }
    }
    // A tag cannot be entirely numeric (it must have a non-number character).
    if (/^[\p{N}]+$/u.test(tagName)) {
        reasons.push('numbers-only tags are not allowed');
    }
    return reasons;
}

/**
 * ADVISORY helper: is a tag name compatible with Obsidian's tag format?
 *
 * @param {string} tagName
 * @returns {boolean}
 */
export function isObsidianCompatibleTag(tagName) {
    return obsidianTagIncompatibilityReasons(tagName).length === 0;
}

/**
 * Generate a section of a URL for a tag name.  We want to convert this into
 * something that's safe for URL's, hence changing some of the characters into -'s.
 *
 * TBD: There's no attempt to avoid two different tag names mapping to the same
 *    underlying URL.
 **/
var tag2encode4url = function(tagName) {
    // console.log(`tag2encode4url ${tagName}`);
    if (!tagName) {
        throw new Error(`Bad tag name ${util.inspect(tagName)}`);
    }
    return tagName.toLowerCase()
        .replace(/ /g, '-')
        .replace(/\//g, '-')
        .replace(/\?/g, '-')
        .replace(/=/g, '-')
        .replace(/&/g, '-');
}

var sortByTitle = function(a,b) {
	if (a.title < b.title) return -1;
	else if (a.title === b.title) return 0;
	else return 1;
};

var sortByDate = function(a,b) {
    var aPublicationDate = Date.parse(
        a.metadata.publicationDate ? a.metadata.publicationDate : a.stat.mtime
    );
    var bPublicationDate = Date.parse(
        b.metadata.publicationDate ? b.metadata.publicationDate : b.stat.mtime
    );
    if (aPublicationDate < bPublicationDate) return -1;
    else if (aPublicationDate === bPublicationDate) return 0;
    else return 1;
};

// Sort enriched entries (which carry a publishedDate Date object) by date,
// oldest first. Callers reverse() for newest-first.
var sortByPublishedDate = function(a, b) {
    const at = (a.publishedDate instanceof Date) ? a.publishedDate.getTime() : 0;
    const bt = (b.publishedDate instanceof Date) ? b.publishedDate.getTime() : 0;
    if (at < bt) return -1;
    else if (at === bt) return 0;
    else return 1;
};

// Describes the data for a single entry
// on a tag page.  Each entry references one
// content page - the data related to making
// a link to that page.

// type tagPageEntry = {
//     // The vpath reference
//     vpath: string;
//     // The path it renders to
//     renderPath: string;
//     // The title string from that page
//     title: string;
//     // The teaser text from that page
//     teaser: string;
//     // The hero image (thumbnail)
//     thumbnail: string;
// }

// type tagPageInfo = {
//     // The vpath for the virtual source page
//     // for the tag page
//     vpath: string;
//     // The path into which to generate
//     // the RSS file for this
//     renderdPathRSS: string;
//     // The tag name for this page
//     tagnm: string;
//     // The tag name encoded for use in URLs
//     tagnmEncoded: string;
//     // The description (if any) of that tag
//     tagDescription: string;
//     // The entries for this tags list
//     entries: tagPageEntry[];
// }

/**
 * Enrich a tag-page entry with title, teaser, and publication date.
 *
 * docLinkData() returns { vpath, renderPath, title?, teaser? } but does not
 * include a publication date, and in some builds does not reliably populate
 * title/teaser. This backfills any missing title/teaser from the document's
 * metadata, and adds date fields:
 *   - publishedDate : a Date object
 *   - publishedISO  : ISO 8601 string (for <time datetime="...">)
 *   - published     : a human-readable date string
 *
 * The date is taken from the document's metadata.publicationDate (which the
 * documents cache sets from frontmatter, else file mtime, else current time).
 * If the document cannot be found, falls back to the rendered file's mtime,
 * then to the current time.
 *
 * @param {*} config
 * @param {object} entry  the entry object from docLinkData() (mutated)
 * @param {string} vpath  the document vpath
 */
async function enrichEntry(config, entry, vpath) {
    let dt;
    let info;
    try {
        info = await config.akasha.filecache
                .documentsCache.find(vpath);
    } catch (err) { /* fall through to fallbacks */ }

    // Backfill title and teaser from metadata when docLinkData() did not
    // provide them.
    const meta = info?.metadata ?? info?.docMetadata;
    if (meta) {
        if (!entry.title && typeof meta.title === 'string') {
            entry.title = meta.title;
        }
        if (!entry.teaser && typeof meta.teaser === 'string') {
            entry.teaser = meta.teaser;
        }
    }

    // Resolve the publication date.
    if (info?.metadata?.publicationDate) {
        dt = new Date(info.metadata.publicationDate);
    } else if (typeof info?.mtimeMs === 'number') {
        dt = new Date(info.mtimeMs);
    }
    if (!dt && entry.renderPath) {
        try {
            const stats = await fsp.stat(path.join(
                config.renderDestination, entry.renderPath));
            if (stats?.mtime) dt = stats.mtime;
        } catch (err) { /* ignore */ }
    }
    if (!dt) dt = new Date();

    entry.publishedDate = dt;
    entry.publishedISO = dt.toISOString();
    entry.published = dt.toDateString();
}

/**
 * Produce a tagsList array containing
 * relevant information for each tag.
 *
 * @param {*} config
 * @returns
 */
async function generateTagsList(config)
    // : Promise<Array<tagPageInfo>>
{
    const plugin = config.plugin(pluginName);

    const tags = await akasha.filecache
                    .documentsCache.tags();
    const taglist = [];
    for (const tagnm of tags) {
        // console.log(`generateTagsList ${tagnm} of `, tags);
        const tagNameEncoded = tag2encode4url(tagnm);
        const tagFileName = tagNameEncoded +".html.ejs";
        const tagRSSFileName = tagNameEncoded +".xml";
        const tagVpaths = await akasha.filecache.
                documentsCache.documentsWithTag(tagnm);
        const entries = [];

        for (const tagvp of tagVpaths) {
            const entry = await akasha.filecache
                .documentsCache.docLinkData(tagvp);
            // docLinkData() does not include a publication date (and in some
            // builds does not reliably populate title/teaser). Backfill those
            // and resolve a date so the tag-page entries can render p-name /
            // p-summary / dt-published microformats and the RSS feed has
            // accurate titles, descriptions, and dates.
            await enrichEntry(config, entry, tagvp);
            entries.push(entry);
        }

        taglist.push({
            vpath: path.join(
                plugin.options.pathIndexes,
                tagFileName),
            renderdPathRSS: path.join(
                plugin.options.pathIndexes,
                tagRSSFileName),
            tagnm: tagnm,
            tagnmEncoded: tagNameEncoded,
            description: await akasha.filecache.documentsCache.getTagDescription(tagnm),
            entries: entries
        });
    }

    // console.log(taglist);

    return taglist;
}

/**
 * Render a virtual tag-related page (frontmatter + content string) through the
 * normal content -> layout -> Mahabhuta pipeline, and write the resulting HTML
 * into the output directory under the plugin's `pathIndexes` directory.
 *
 * Used for the tags-directory `index.html` page. The per-tag pages use the
 * dedicated renderTagFile() logic (which also emits RSS).
 *
 * @param {*} config
 * @param {string} fileBaseName  e.g. "index.html.ejs"
 * @param {string} entryText     frontmatter + body to render
 * @param {object} extraMetadata extra fields merged into the page metadata
 */
async function renderVirtualTagPage(config, fileBaseName, entryText, extraMetadata) {
    const plugin = config.plugin(pluginName);

    const filePath = path.join(plugin.options.pathIndexes, fileBaseName);
    const renderer = config.findRendererPath(fileBaseName);
    const renderPath = renderer.filePath(fileBaseName);
    const writeTo = path.join(config.renderDestination,
                              plugin.options.pathIndexes,
                              renderPath);

    const rc = renderer.parseMetadata({
        fspath: filePath,
        content: entryText,
        body: '',
        metadata: {}
    });
    rc.metadata.document = {
        basedir: '/',
        relpath: '/',
        relrender: renderer.filePath(fileBaseName),
        path: path.join(plugin.options.pathIndexes, fileBaseName),
        renderTo: path.dirname(filePath)
    };
    if (extraMetadata) {
        for (const k of Object.keys(extraMetadata)) {
            rc.metadata[k] = extraMetadata[k];
        }
    }
    rc.metadata.root_url = config.root_url;
    if (config.root_url) {
        let uRootUrl = new URL(config.root_url);
        uRootUrl.pathname = path.normalize(
            path.join(uRootUrl.pathname, rc.metadata.document.renderTo)
        );
        rc.metadata.rendered_url = uRootUrl.toString();
    }

    // Render the main content
    let docRendered;
    try {
        const result = await renderContent(config, rc);
        docRendered = result.rendered;
    } catch (err) {
        throw new Error(`Error rendering ${filePath} ${(err.stack ? err.stack : err)}`);
    }

    // Render through the layout, if any
    let layoutRendered;
    let rcLayout;
    if (rc.metadata.layout) {
        const layouts = config.akasha.filecache.layoutsCache;
        let found = await layouts.find(rc.metadata.layout);
        if (!found) {
            throw new Error(`No layout found in ${util.inspect(config.layoutDirs)} for ${rc.metadata.layout} in file ${rc.fspath}`);
        }
        rcLayout = {
            fspath: rc.metadata.layout,
            content: found.docContent,
            body: found.docBody,
            metadata: {}
        };
        for (var yprop in found.metadata) {
            rcLayout.metadata[yprop] = found.metadata[yprop];
        }
        for (var yprop2 in rc.metadata) {
            rcLayout.metadata[yprop2] = rc.metadata[yprop2];
        }
        rcLayout.metadata.content = docRendered;
        try {
            const result = await renderContent(config, rcLayout);
            layoutRendered = result.rendered;
        } catch (e) {
            let ee = new Error(`Error rendering ${filePath} with ${rc.metadata.layout} ${e.stack ? e.stack : e}`);
            throw ee;
        }
    } else {
        rcLayout = rc;
        layoutRendered = docRendered;
    }

    // Mahabhuta processing
    const mahametadata = {};
    for (var yprop3 in rcLayout.metadata) {
        mahametadata[yprop3] = rcLayout.metadata[yprop3];
    }
    mahametadata.content = docRendered;

    if (config.mahabhutaConfig) {
        mahabhuta.config(config.mahabhutaConfig);
    }
    layoutRendered = await mahabhuta.processAsync(
        layoutRendered, mahametadata, config.mahafuncs
    );

    await fsp.mkdir(path.dirname(writeTo), {
        recursive: true, mode: 0o755
    });
    await fsp.writeFile(writeTo, layoutRendered);
}

/**
 * Generate the `index.html` page in the tags directory: a directory of links to
 * each tag's index page (with optional RSS links and descriptions).
 *
 * Uses the site's `indexTemplate` option when present, otherwise the shipped
 * DEFAULT_INDEX_TEMPLATE. The tag directory listing is rendered through the
 * `tagged-content-tagdirectory.html.njk` partial.
 *
 * @param {*} config
 */
export async function generateTagsDirectoryIndex(config) {
    const plugin = config.plugin(pluginName);

    const entries = await plugin.tagsDirectoryData(config);

    // Render the directory listing. Show RSS links by default; a site can
    // disable via options.showTagDirectoryRSS === false.
    const showRSS = plugin.options.showTagDirectoryRSS !== false;
    const listing = await config.akasha.partial(config,
        "tagged-content-tagdirectory.html.njk",
        { entries, showRSS });

    const indexTemplate =
        (typeof plugin.options.indexTemplate === 'string')
            ? plugin.options.indexTemplate
            : DEFAULT_INDEX_TEMPLATE;

    const entryText = indexTemplate + listing;

    await renderVirtualTagPage(config, "index.html.ejs", entryText, {
        tagName: '',
        tagDescription: ''
    });
}

export async function generateTagIndexes(config) {
    const plugin = config.plugin(pluginName);
    const tagIndexStart = new Date();
    var tagIndexCount = 0;

    async function renderTagFile(tagData) {

        // console.log(`generateTagIndexes -- renderTagFile -- ${util.inspect(tagData)}`);

        const tagNameEncoded = tag2encode4url(tagData.tagnm);
        const tagFileName = tagNameEncoded +".html.ejs";
        const tagRSSFileName = tagNameEncoded +".xml";
        const tagFilePath = path.join(
                    plugin.options.pathIndexes,
                    tagFileName);
        const tagRSSFilePath = path.join(
                    plugin.options.pathIndexes,
                    tagRSSFileName);
        
        // SORT THE TAG DATA

        if (plugin.options.sortBy === 'date') {
            tagData.entries.sort(sortByDate);
            tagData.entries.reverse();
        } else if (plugin.options.sortBy === 'title') {
            tagData.entries.sort(sortByTitle);
        } else {
            tagData.entries.sort(sortByTitle);
        }


        const text2write = await config
                .akasha.partial(config,
                    "tagged-content-tagpagelist.html.njk",
                    { entries: tagData.entries });

        // console.log(`rendering headerTemplate with data ${util.inspect(tagData)}`);

        // This is the file to render.  The variable
        // text2write contains the rendered
        // list of links for this tag.
        //
        // An example for tagData is:
        // {
        // vpath: '/tags/embed.html.ejs',
        // renderdPathRSS: '/tags/embed.xml',
        // tagnm: 'Embed',
        // tagnmEncoded: 'embed',
        // description: 'Testing embeddeble thingies',
        // entries: [
        //     {
        //     vpath: 'facebook-embed.html.md',
        //     renderPath: 'facebook-embed.html',
        //     title: 'Test of embedding Facebook',
        //     teaser: undefined
        //     },
        //     {
        //     vpath: 'slideshare.html.md',
        //     renderPath: 'slideshare.html',
        //     title: 'Test of embedding Slideshare',
        //     teaser: undefined
        //     },
        //     {
        //     vpath: 'twitter-embed.html.md',
        //     renderPath: 'twitter-embed.html',
        //     title: 'Test of embedding tweets',
        //     teaser: undefined
        //     },
        //     {
        //     vpath: 'video.html.md',
        //     renderPath: 'video.html',
        //     title: 'Test of embedding video',
        //     teaser: undefined
        //     }
        // ]
        // }
        //
        // The headerTemplate token @tagDescription@ used to be
        // based on the tagDescription field here.  But it appears
        // that it was rewritten at some point to use description,
        // instead.  But, in the interest of safety, this will recognize
        // either data field.

        let desc;
        if (typeof tagData.tagDescription === 'string') {
            desc = tagData.tagDescription;
        } else if (typeof tagData.description === 'string') {
            desc = tagData.description;
        } else {
            // Rather than output "undefined" into the rendering,
            // give it an empty string.
            desc = '';
        }
        const headerTemplate =
            (typeof plugin.options.headerTemplate === 'string')
                ? plugin.options.headerTemplate
                : DEFAULT_HEADER_TEMPLATE;
        let entryText = headerTemplate
            .replace("@title@", tagData.tagnm)
            .replace("@tagName@", tagData.tagnm)
            .replace("@tagDescription@", desc);
        entryText += text2write;

        // Render the main content

        const renderer = config.findRendererPath(tagFileName);
        const renderPath = renderer.filePath(tagFileName);
        const writeTo = path.join(config.renderDestination,
                                  plugin.options.pathIndexes,
                                  renderPath);
        /* RenderingContext */
        const rc = renderer.parseMetadata({
            fspath: tagFilePath,
            content: entryText,
            body: '',
            metadata: {}
        });
        rc.metadata.document = {
            basedir: '/',
            relpath: '/',
            relrender: renderer.filePath(tagFileName),
            path: path.join(plugin.options.pathIndexes,
                            tagFileName),
            renderTo: path.dirname(tagFilePath)
        };
        // Expose the tag name and description as page metadata so layouts can
        // build OpenGraph (and other) header metadata without depending on the
        // headerTemplate tokens.
        rc.metadata.tagName = tagData.tagnm;
        rc.metadata.tagDescription = desc;
        rc.metadata.root_url = config.root_url;
        if (config.root_url) {
            let uRootUrl = new URL(config.root_url);
            // let pRootUrl = url.parse(config.root_url);
            uRootUrl.pathname = path.normalize(
                        path.join(uRootUrl.pathname,
                        rc.metadata.document.renderTo)
            );
            rc.metadata.rendered_url = uRootUrl.toString(); // url.format(pRootUrl);
        }

        let docFormat;      // Knowing the format 
        let docRendered;
        try {
            const result = await renderContent(config, rc);
            docFormat = result.format;
            docRendered = result.rendered;
        } catch (err) {
            console.error(`Error rendering ${tagFilePath} ${(err.stack ? err.stack : err)}`);
            throw new Error(`Error rendering ${tagFilePath} ${(err.stack ? err.stack : err)}`);
        }

        // console.log(`///////////////// generateTagIndexes renderTagFile ${tagData.tagnm} ${writeTo} rendered CONTENT ${docRendered}`);

        // Render for the layout template

        let layoutFormat;
        let layoutRendered;
        let rcLayout;
        if (rc.metadata.layout) {

            const layouts = config.akasha.filecache.layoutsCache;
            // await layouts.isReady();

            let found = await layouts.find(rc.metadata.layout);
            if (!found) {
                throw new Error(`No layout found in ${util.inspect(config.layoutDirs)} for ${rc.metadata.layout} in file ${rc.fspath}`);
            }

            rcLayout = {
                fspath: rc.metadata.layout,
                content: found.docContent,
                body: found.docBody,
                metadata: {}
            };
            for (var yprop in found.metadata) {
                rcLayout.metadata[yprop] = found.metadata[yprop];
            }
            for (var yprop in rc.metadata) {
                rcLayout.metadata[yprop] = rc.metadata[yprop];
            }
            rcLayout.metadata.content = docRendered;
            try {
                const result
                    = await renderContent(config, rcLayout);
                layoutFormat = result.format;
                layoutRendered = result.rendered;
            } catch (e) {
                let ee = new Error(`Error rendering ${tagFilePath} with ${rc.metadata.layout} ${e.stack ? e.stack : e}`);
                console.error(ee);
                throw ee;
            }
        } else {
            layoutFormat = docFormat;
            layoutRendered = docRendered;
        }

        // console.log(`//////////////////// generateTagIndexes renderTagFile ${tagData.tagnm} ${writeTo} rendered LAYOUT ${layoutRendered}`);

        const mahametadata = {};
        for (var yprop in rcLayout.metadata) {
            mahametadata[yprop] = rcLayout.metadata[yprop];
        }
        mahametadata.content = docRendered;

        if (config.mahabhutaConfig) {
            mahabhuta.config(config.mahabhutaConfig);
        }
        // console.log(`mahametadata`, mahametadata);
        layoutRendered = await mahabhuta.processAsync(
            layoutRendered, mahametadata,
            config.mahafuncs
        );

        // Make sure the directory is there
        // console.log(`generateTagIndexes renderTagFile mkdir ${tagData.tagnm} ${path.dirname(writeTo)}`);
        await fsp.mkdir(path.dirname(writeTo), {
            recursive: true, mode: 0o755
        });

        // Write the resulting text to the output directory
        // console.log(`/////////////////// generateTagIndexes renderTagFile write ${writeTo} {layoutRendered}`);
        await fsp.writeFile(writeTo, layoutRendered);

        // Generate RSS feeds for each tag

        // Build an absolute URL for the feed. tagRSSUrl() returns the
        // site-relative path (e.g. /tags/external.xml); resolve it against
        // root_url so we don't accidentally concatenate the bare filename onto
        // the host (which produced e.g. https://example.comexternal.xml).
        const rssSiteUrl = config.root_url
            ? new URL(plugin.tagRSSUrl(config, tagData.tagnm),
                      config.root_url).toString()
            : plugin.tagRSSUrl(config, tagData.tagnm);
        const rssFeed = new RSS({
            title: `Documents tagged with ${tagData.tagnm}`,
            site_url: rssSiteUrl,
        });

        for (let tagEntry of tagData.entries) {
            // console.log(`generateTagIndexes renderTagFile generating RSS tagEntry `, tagEntry);
            let u = new URL(config.root_url);
            u.pathname = tagEntry.renderPath;
            // The publication date was resolved in generateTagsList() via
            // enrichEntryWithDate(); fall back defensively if missing.
            let dt = tagEntry.publishedDate
                ? tagEntry.publishedDate
                : (tagEntry?.metadata?.publicationDate
                    ? tagEntry.metadata.publicationDate
                    : new Date());
            rssFeed.item({
                title: tagEntry.title,
                description: tagEntry.teaser ? tagEntry.teaser : "",
                url: u.toString(),
                date: dt
            });
        }

        const xml = rssFeed.xml();
        // console.log(`generateTagIndexes renderTagFile write RSS ${config.renderDestination} ${plugin.options.pathIndexes} ${tagRSSFileName} ${path.join(config.renderDestination,
        //     plugin.options.pathIndexes,
        //     tagRSSFileName)}`);
        await fsp.writeFile(
            path.join(config.renderDestination,
                      plugin.options.pathIndexes,
                      tagRSSFileName), 
            xml, { encoding: 'utf8' });
    }

    const tagsList = await generateTagsList(config);

    // console.log(`generateTagIndexes taglist `, tagsList);
    for (const tagData of tagsList) {
        await renderTagFile(tagData);
    }

    // Generate the tags-directory index.html page.
    await generateTagsDirectoryIndex(config);

    // console.log(`tagged-content FINISH tag indexing for ${tagIndexCount} indexes in ${(new Date() - tagIndexStart) / 1000} seconds`);
}



    /*
     * This section - if reinstated - is about creating an index.html in
     * the tags directory.
     *
    if (plugin.options.indexTemplate) {
        const entryText = plugin.options.indexTemplate;

        let tags = '';
        for (let tagData of tagCloudData.tagData) {

            let tagNameEncoded = tag2encode4url(tagData.tagName);
            let tagFileName = plugin.options.pathIndexes + tagNameEncoded +".html";
            let $ = mahabhuta.parse(`
                    <tag-list-item
                        name=""
                        href=""></tag-list-item>
                    `);
            $('tag-list-item').attr('name', tagData.tagName);
            $('tag-list-item').attr('href', tagFileName);
            $('tag-list-item').append(tagData.tagDescription);
            tags += $.html();
        }
        if (tags !== '') {
            entryText += `
            
            <tag-list-container>
            ${tags}
            </tag-list-container>
            `;
        }

        await fsp.writeFile(path.join(tagsDir, "index.html.ejs"), entryText);
    }
    */


    // async function renderTagFile0(tagData) {
    //     const tagFileStart = new Date();
    //     // console.log(util.inspect(tagData));
    //     const tagNameEncoded = tag2encode4url(tagData.tagName);
    //     const tagFileName = tagNameEncoded +".html.ejs";
    //     const tagRSSFileName = tagNameEncoded +".xml";
    //     const tagFilePath = path.join(
    //                 plugin.options.pathIndexes,
    //                 tagFileName);
    //     const tagRSSFilePath = path.join(
    //                 plugin.options.pathIndexes,
    //                 tagRSSFileName);

    //     if (plugin.options.sortBy === 'date') {
    //         tagData.entries.sort(sortByDate);
    //         tagData.entries.reverse();
    //     } else if (plugin.options.sortBy === 'title') {
    //         tagData.entries.sort(sortByTitle);
    //     } else {
    //         tagData.entries.sort(sortByTitle);
    //     }

    //     let tagFileSorted = new Date() - tagFileStart;
    //     // console.log(`tagged-content SORTED INDEX for ${tagData.tagName} with ${tagData.entries.length} entries in ${(new Date() - tagFileStart) / 1000} seconds`);

    //     const text2write = await plugin.config.akasha.partial(config,
    //             "tagged-content-tagpagelist.html.ejs",
    //             { entries: tagData.entries });

    //     // let tagFile2Write = new Date();
    //     // console.log(`tagged-content 2WRITE INDEX for ${tagData.tagName} with ${tagData.entries.length} entries in ${(new Date() - tagFileStart) / 1000} seconds`);

    //     let entryText = plugin.options.headerTemplate
    //         .replace("@title@", tagData.tagName)
    //         .replace("@tagName@", tagData.tagName)
    //         .replace("@tagDescription@", tagData.tagDescription);
    //     entryText += text2write;

    //     const tagFileWritten = new Date() - tagFileStart;

    //     /*
    //      * An earlier conception for this was to:
    //      * 1. Set up a temporary directory
    //      * 2. Mount that temporary directory as /tags
    //      * 3. Therefore the FileCache would automatically scan
    //      *    that directory
    //      * 4. In this function, we write document files to that
    //      *    directory
    //      * 5. The rendering system would automatically pick up those
    //      *    files and render them
    //      *
    //      * HOWEVER - it was deemed simpler to instead directly render
    //      * content to the output directory.  Hence the following code takes
    //      * the "entryText", parses it for frontmatter and content, then
    //      * computes the correct metadata, renders the content, and writes it
    //      * directly to the output directory.
    //      */

    //     const renderer = config.findRendererPath(tagFileName);
    //     const rc = renderer.parseMetadata({
    //         fspath: tagFilePath,
    //         content: entryText
    //     });
    //     const vpath = path.join(plugin.options.pathIndexes,
    //                             renderer.filePath(tagFileName));
    //     // Set up the metadata as per HTMLRenderer.newInitMetadata
    //     rc.metadata.document = {
    //         basedir: '/',
    //         relpath: '/',
    //         relrender: renderer.filePath(tagFileName),
    //         path: path.join(plugin.options.pathIndexes, tagFileName),
    //         renderTo: vpath
    //     };
    //     rc.metadata.config = config;
    //     rc.metadata.partialSync = (fname, metadata) => {
    //         // console.log(`partialSync ${fname}`);
    //         return config.akasha.partialSync(config, fname, metadata); // .bind(renderer, config);
    //     };
    //     rc.metadata.partial     = async (fname, metadata) => {
    //         // console.log(`partial ${fname}`);
    //         return config.akasha.partial(config, fname, metadata); // .bind(renderer, config);
    //     };
    //     rc.metadata.root_url = config.root_url;
    //     rc.metadata.akasha = akasha;
    //     rc.metadata.plugin = config.plugin;
    //     rc.metadata.rendered_date = new Date();
    //     rc.metadata.publicationDate = new Date();

    //     if (config.root_url) {
    //         let pRootUrl = url.parse(config.root_url);
    //         pRootUrl.pathname = path.normalize(
    //                 path.join(pRootUrl.pathname, rc.metadata.document.renderTo)
    //         );
    //         rc.metadata.rendered_url = url.format(pRootUrl);
    //     }
    //     // Initial content render

    //     // console.log(`renderTagFile ${tagNameEncoded}`, rc);
    //     const rendered = await renderer.render(rc);

    //     const writeTo = path.join(config.renderDestination,
    //                               rc.metadata.document.renderTo);

    //     // console.log(`renderTagFile ${tagFileName} `, fm);

    //     // Handle the layout field
    //     // This function also handles Mahabhuta tags

    //     let layoutrendered;
    //     if (rc.metadata.layout) {

    //         const layouts = config.akasha.filecache.layoutsCache;

    //         let found = await layouts.find(rc.metadata.layout);
    //         if (!found) {
    //             throw new Error(`No layout found in ${util.inspect(config.layoutDirs)} for ${rc.metadata.layout} in file ${rc.fspath}`);
    //         }

    //         let layoutmetadata = {};
    //         for (var yprop in rc.metadata) {
    //             if (yprop !== 'layout') {
    //                 layoutmetadata[yprop] = rc.metadata[yprop];
    //             }
    //         }
    //         layoutmetadata.content = rendered;

    //         const renderer = config.findRendererPath(rc.metadata.layout);

    //         if (!renderer) {
    //             throw new Error(`No renderer for ${rc.metadata.layout} in file ${rc.fspath}`);;
    //         }

    //         const context = {
    //             fspath: found.fspath,
    //             content: found.docContent,
    //             body: found.docBody,
    //             metadata: layoutmetadata
    //         };

    //         // console.log(`renderTagFile ${util.inspect(found)} ==> ${util.inspect(context)}`);

    //         try {
    //             layoutrendered = await renderer.render(context);
    //         } catch (e) {
    //             let ee = new Error(`Error rendering ${rc.fspath} with ${rc.metadata.layout} ${e.stack ? e.stack : e}`);
    //             console.error(ee);
    //             throw ee;
    //         }

    //     } else {
    //         layoutrendered = rendered;
    //     }

    //     let finalrender;
    //     try {

    //         const mahametadata = {};
    //         for (var yprop in rc.metadata) {
    //             mahametadata[yprop] = rc.metadata[yprop];
    //         }
    //         mahametadata.content = layoutrendered;

    //         if (rc.metadata.config.mahabhutaConfig) {
    //             mahabhuta.config(rc.metadata.config.mahabhutaConfig);
    //         }
    //         // console.log(`mahametadata`, mahametadata);
    //         finalrender = await mahabhuta.processAsync(
    //             layoutrendered, mahametadata, config.mahafuncs
    //         );

    //         // OLD docrendered = await this.maharun(layoutrendered, docdata, config.mahafuncs);
    //     } catch (e2) {
    //         let eee = new Error(`Error with Mahabhuta ${docInfo.vpath} with ${docInfo.metadata.layout} ${e2.stack ? e2.stack : e2}`);
    //         console.error(eee);
    //         throw eee;
    //     }

    //     // console.log(`renderTagFile ${tagFileName} ==> ${writeTo} :- `, finalrender);

    //     // Make sure the directory is there
    //     await fsp.mkdir(path.dirname(writeTo), {
    //         recursive: true, mode: 0o755
    //     });

    //     // Write the resulting text to the output directory
    //     await fsp.writeFile(writeTo, finalrender);

    //     // Generate RSS feeds for each tag

    //     const tagFileRendered = new Date() - tagFileStart;

    //     const rssFeed = new RSS({
    //         title: "Documents tagged with " + tagData.tagName,
    //         site_url: `${config.root_url}${tagRSSFileName}`,
    //     });

    //     for (let tagEntry of tagData.entries) {
    //         let u = new URL(config.root_url);
    //         u.pathname = tagEntry.renderPath;
    //         let dt = tagEntry.metadata.publicationDate;
    //         if (!dt) {
    //             let stats = await fsp.stat(tagEntry.fspath);
    //             dt = stats.mtime;
    //         }
    //         rssFeed.item({
    //             title: tagEntry.metadata.title,
    //             description: tagEntry.metadata.teaser ? tagEntry.metadata.teaser : "",
    //             url: u.toString(),
    //             date: dt
    //         });
    //     }

    //     const xml = rssFeed.xml();
    //     await fsp.writeFile(path.join(config.renderDestination,
    //                                   plugin.options.pathIndexes,
    //                                   tagRSSFileName), 
    //         xml, { encoding: 'utf8' });

    //     // Finish up data collection

    //     const tagFileEnd = new Date();
    //     console.log(`tagged-content GENERATE INDEX for ${tagData.tagName} with ${tagData.entries.length} entries, sorted in ${tagFileSorted / 1000} seconds, written in ${tagFileWritten / 1000} seconds, rendered in ${tagFileRendered / 1000} seconds, finished in ${(tagFileEnd - tagFileStart) / 1000} seconds`);

    //     tagIndexCount++;
    // }
