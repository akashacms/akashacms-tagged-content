/**
 *
 * Copyright 2013-2017 David Herron
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
// import {
//     RenderingContext
// } from '@akashacms/renderers';
import akasha, {
    renderContent
} from 'akasharender';
const mahabhuta = akasha.mahabhuta;
import fastq from 'fastq';

const pluginName = "@akashacms/plugins-tagged-content";

const __dirname = import.meta.dirname;

export class TaggedContentPlugin extends akasha.Plugin {

    #config;
    #tagsdir;

    constructor() { super(pluginName); }

    configure(config, options) {
        this.#config = config;
        this.options = options;
        options.config = config;
        config.addPartialsDir(path.join(__dirname, 'partials'));
        config.addMahabhuta(mahabhutaArray(options));
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

    docHasTag(document, tag) {
        let tags = [];
        if (document.metadata && document.metadata.tags) {
            tags = document.metadata.tags;
        }
        return tags.includes(tag);
    }

    tagDescription(tagnm) {
        if (!this.options.tags) return "";
        for (let tagitem of this.options.tags) {
            if (tagitem.name === tagnm) {
                return tagitem.description;
            }
        }
        return "";
    }

    tagPageUrl(config, tagName) {
        if (this.options.pathIndexes.endsWith('/')) {
            return this.options.pathIndexes + tag2encode4url(tagName) +'.html';
        } else {
            return this.options.pathIndexes +'/'+ tag2encode4url(tagName) +'.html';
        }
    }

    async doTagsForDocument(config, metadata, template) {
        const plugin = this;
        const taglist = (
                'tags' in metadata
              && Array.isArray(metadata.tags)
            ) ? metadata.tags : [];
        if (taglist) {
            // log('doTagsForDocument '+ util.inspect(taglist));
            return akasha.partial(config, template, {
                tagz: taglist.map(tag => {
                    return {
                        tagName: tag,
                        tagUrl: plugin.tagPageUrl(config, tag)
                    };
                })
            });
        } else return "";
    }
};

export function mahabhutaArray(options) {
    let ret = new mahabhuta.MahafuncArray(pluginName, options);
    ret.addMahafunc(new TagsForDocumentElement());
    ret.addMahafunc(new TagsFeedsListElement());
    // REMOVED DUE TO DISUSE
    // ret.addMahafunc(new TagsListItemElement());
    // ret.addMahafunc(new TagsListContainerElement());
    return ret;
};

class TagsForDocumentElement extends mahabhuta.CustomElement {
    get elementName() { return "tags-for-document"; }
    process($element, metadata, dirty, done) {
        const plugin = this.array.options.config.plugin(pluginName);
        return plugin.doTagsForDocument(this.array.options.config,
                metadata, "tagged-content-doctags.html.njk");
    }
}

class TagsFeedsListElement extends mahabhuta.CustomElement {
    get elementName() { return "tags-feeds-list"; }
    async process($element, metadata, dirty, done) {
        const plugin = this.array.options.config.plugin(pluginName);
        // const start = new Date();
        const template = $element.attr('template') 
                ? $element.attr('template')
                :  "tagged-content-feedlist.html.njk";
        const id = $element.attr('id');
        const additionalClasses = $element.attr('additional-classes')
                ? $element.attr('additional-classes')
                : "";

        // Receives an array of just the tag names.
        let tagnames = await akasha.filecache
                .documentsCache.tags();

        // console.log(`TagsFeedsListElement tags ${util.inspect(tagnames)}`);

        // Generate an array for tagged-content-feedlist
        let tagEntries = [];
        for (const tagnm of tagnames) {
            const tagNameEncoded = tag2encode4url(tagnm);
            tagEntries.push({
                tagName: tagnm,
                teaser: plugin.tagDescription(tagnm),
                rssHREF: path.join(
                    this.array.options.pathIndexes,
                    `${tagNameEncoded}.xml`
                ),
            });
        }

        // console.log(`TagsFeedsListElement tagEntries ${util.inspect(tagEntries)}`);

        const ret = await this.array.options.config.akasha.partial(this.array.options.config, template, {
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
            entries.push(await akasha.filecache
                .documentsCache.docLinkData(tagvp));
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
            description: plugin.tagDescription(tagnm),
            entries: entries
        });
    }

    return taglist;
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

        // This is the file to render.  The variable
        // text2write contains the rendered
        // list of links for this tag.
        let entryText = plugin.options.headerTemplate
            .replace("@title@", tagData.tagnm)
            .replace("@tagName@", tagData.tagnm)
            .replace("@tagDescription@", tagData.tagDescription);
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
        rc.metadata.root_url = config.root_url;
        if (config.root_url) {
            let pRootUrl = url.parse(config.root_url);
            pRootUrl.pathname = path.normalize(
                        path.join(pRootUrl.pathname,
                        rc.metadata.document.renderTo)
            );
            rc.metadata.rendered_url = url.format(pRootUrl);
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

        const rssFeed = new RSS({
            title: `Documents tagged with ${tagData.tagnm}`,
            site_url: `${config.root_url}${tagRSSFileName}`,
        });

        for (let tagEntry of tagData.entries) {
            // console.log(`generateTagIndexes renderTagFile generating RSS tagEntry `, tagEntry);
            let u = new URL(config.root_url);
            u.pathname = tagEntry.renderPath;
            let dt = tagEntry?.metadata?.publicationDate;
            if (!dt) {
                let stats;
                try {
                    stats = await fsp.stat(path.join(
                        config.renderDestination,
                        tagEntry.renderPath
                    ));
                } catch (err) { stats = undefined; }
                dt = stats?.mtime ? stats.mtime : new Date(Date.now()).toDateString();
            }
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
