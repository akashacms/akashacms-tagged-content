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

'use strict';

const path     = require('path');
const util     = require('util');
const fs       = require('fs');
const fsp      = require('fs/promises');
const url      = require('url');
const RSS      = require('rss');
const taggen   = require('tagcloud-generator');
const akasha   = require('akasharender');
const mahabhuta = akasha.mahabhuta;
const fastq = require('fastq');

const pluginName = "@akashacms/plugins-tagged-content";

const _plugin_config = Symbol('config');
const _plugin_tagsdir = Symbol('tagsDir');

module.exports = class TaggedContentPlugin extends akasha.Plugin {
    constructor() { super(pluginName); }

    configure(config, options) {
        this[_plugin_config] = config;
        this.options = options;
        options.config = config;
        config.addPartialsDir(path.join(__dirname, 'partials'));
        config.addMahabhuta(module.exports.mahabhutaArray(options));
    }

    get config() { return this[_plugin_config]; }

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
        return module.exports.generateTagIndexes(config);
    }

    hasTag(tags, tag) {
        var taglist = this.tagParse(tags);
        // console.log(`documentHasTag ${tag} ${util.inspect(taglist)}`);
        return taglist ? taglist.includes(tag) : false;
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

    tagParse(tags) {
        if (typeof tags === 'undefined' || !tags) {
            return [];
        }
        if (Array.isArray(tags)) {
            return tags;
        }
        var taglist = [];
        var re = /\s*,\s*/;
        tags.split(re).forEach(function(tag) {
            taglist.push(tag.trim());
        });
        return taglist;
    }

    documentTags(document) {
        // console.log('documentTags '+ util.inspect(document.metadata));
        let tags = [];
        if (document.metadata && document.metadata.tags) {
            tags = document.metadata.tags;
        }
        return tags;
    }

    async documentsWithTags() {
        const filecache = this.config.akasha.filecache;
        return filecache.documents.documentsWithTags();
    }

    async allTags() {
        const filecache = this.config.akasha.filecache;
        const tagnames = filecache.documents.tags();
        const ret = [];
        for (let tagnm of tagnames) {
            ret.push({
                tagName: tagnm,
                tagDescription: this.tagDescription(tagnm)
            });
        }
        return ret;
    }

    async documentsWithTag(tagName) {
        const filecache = this.config.akasha.filecache;
        let docs = filecache.documents.search(config, {
            tag: tagName
        });
        return await this.documentsWithTags();
    }

    async doTagsForDocument(config, metadata, template) {
        const plugin = this;
        const taglist = this.documentTags({ metadata: metadata });
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

module.exports.mahabhutaArray = function(options) {
    let ret = new mahabhuta.MahafuncArray(pluginName, options);
    ret.addMahafunc(new TagCloudElement());
    ret.addMahafunc(new TagsForDocumentElement());
    ret.addMahafunc(new TagsFeedsListElement());
    ret.addMahafunc(new TagsListItemElement());
    ret.addMahafunc(new TagsListContainerElement());
    return ret;
};

class TagCloudElement extends mahabhuta.CustomElement {
    get elementName() { return "tag-cloud"; }
    async process($element, metadata, dirty) {
        let thisConfig = this.array.options.config;
        const plugin = thisConfig.plugin(pluginName);
        // let startTime = new Date();
        let id = $element.attr('id');
        let clazz = $element.attr('class');
        let style = $element.attr('style');
        if (!this.array.options.tagCloudData) {
            this.array.options.tagCloudData = await genTagCloudData(thisConfig);
        }
        /* console.log('******* tag-cloud tags:');
        for (let tagdata of tagCloudData.tagData) {
            console.log(`     ${tagdata.tagName}`);
        } */
        // console.log(util.inspect(tagCloudData.tagData));
        // console.log(`TagCloudElement ${metadata.document.path} genTagCloudData ${(new Date() - startTime) / 1000} seconds`);
        var tagCloud = taggen.generateSimpleCloud(this.array.options.tagCloudData.tagData, tagName => {
            return plugin.tagPageUrl(thisConfig, tagName);
        }, "");
        // console.log(tagCloud);
        // console.log(`TagCloudElement ${metadata.document.path} generateSimpleCloud ${(new Date() - startTime) / 1000} seconds`);
        return this.array.options.config.akasha.partial(thisConfig, "tagged-content-cloud.html.ejs", {
            tagCloud, id, clazz, style
        });
    }
}

class TagsForDocumentElement extends mahabhuta.CustomElement {
    get elementName() { return "tags-for-document"; }
    process($element, metadata, dirty, done) {
        const plugin = this.array.options.config.plugin(pluginName);
        return plugin.doTagsForDocument(this.array.options.config,
                metadata, "tagged-content-doctags.html.ejs");
    }
}

class TagsFeedsListElement extends mahabhuta.CustomElement {
    get elementName() { return "tags-feeds-list"; }
    async process($element, metadata, dirty, done) {
        const plugin = this.array.options.config.plugin(pluginName);
        // const start = new Date();
        const template = $element.attr('template') 
                ? $element.attr('template')
                :  "tagged-content-feedlist.html.ejs";
        const id = $element.attr('id');
        const additionalClasses = $element.attr('additional-classes')
                ? $element.attr('additional-classes')
                : "";
        let tagnames = await plugin.allTags();

        // console.log(util.inspect(tagnames));
    
        // const tagCloudData = await genTagCloudData(this.array.options.config);
        // console.log(`TagsFeedsListElement after allTags ${tagnames.length} ${(new Date() - start) / 1000} seconds`);

        // console.log(`TagsFeedsListElement `, this.array.options);
        // console.log(`TagsFeedsListElement `, tagCloudData);

        const ret = await this.array.options.config.akasha.partial(this.array.options.config, template, {
            id, additionalClasses, tag2encode4url,
            pathIndexes: this.array.options.pathIndexes,
            entries: tagnames
        });
        // console.log(`TagsFeedsListElement after partial ${template} ${(new Date() - start) / 1000} seconds`);

        return ret;
    }
}

class TagsListContainerElement extends mahabhuta.CustomElement {
    get elementName() { return "tag-list-container"; }
    process($element, metadata, dirty, done) {
        const template = $element.attr('template') 
                ? $element.attr('template')
                :  "tagged-content-list-container.html.ejs";
        const id = $element.attr('id');
        const additionalClasses = $element.attr('additional-classes')
                ? $element.attr('additional-classes')
                : "";
        const content = $element.html()
                ? $element.html()
                : "";
        return this.array.options.config.akasha.partial(this.array.options.config, template, {
            id, additionalClasses, content
        });
    }
}

class TagsListItemElement extends mahabhuta.CustomElement {
    get elementName() { return "tag-list-item"; }
    process($element, metadata, dirty, done) {
        const template = $element.attr('template') 
                ? $element.attr('template')
                :  "tagged-content-list-item.html.ejs";
        const id = $element.attr('id');
        const additionalClasses = $element.attr('additional-classes')
                ? $element.attr('additional-classes')
                : "";
        const name = $element.attr('name');
        const href = $element.attr('href');
        const description = $element.html()
                ? $element.html()
                : "";
        return this.array.options.config.akasha.partial(this.array.options.config, template, {
            id, additionalClasses, description, name, href
        });
    }
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
    return tagName.toLowerCase()
        .replace(/ /g, '-')
        .replace(/\//g, '-')
        .replace(/\?/g, '-')
        .replace(/=/g, '-')
        .replace(/&/g, '-');
}

var sortByTitle = function(a,b) {
	if (a.metadata.title < b.metadata.title) return -1;
	else if (a.metadata.title === b.metadata.title) return 0;
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

module.exports.generateTagIndexes = async function (config) {
    const plugin = config.plugin(pluginName);
    const tagIndexStart = new Date();
    var tagIndexCount = 0;
    var tagCloudData = await genTagCloudData(config);

    // console.log(util.inspect(tagCloudData));

    async function renderTagFile(tagData) {
        const tagFileStart = new Date();
        // console.log(util.inspect(tagData));
        const tagNameEncoded = tag2encode4url(tagData.tagName);
        const tagFileName = tagNameEncoded +".html.ejs";
        const tagRSSFileName = tagNameEncoded +".xml";
        const tagFilePath = path.join(plugin.options.pathIndexes, tagFileName);
        const tagRSSFilePath = path.join(plugin.options.pathIndexes, tagRSSFileName);

        if (plugin.options.sortBy === 'date') {
            tagData.entries.sort(sortByDate);
            tagData.entries.reverse();
        } else if (plugin.options.sortBy === 'title') {
            tagData.entries.sort(sortByTitle);
        } else {
            tagData.entries.sort(sortByTitle);
        }

        let tagFileSorted = new Date() - tagFileStart;
        // console.log(`tagged-content SORTED INDEX for ${tagData.tagName} with ${tagData.entries.length} entries in ${(new Date() - tagFileStart) / 1000} seconds`);

        const text2write = await plugin.config.akasha.partial(config,
                "tagged-content-tagpagelist.html.ejs",
                { entries: tagData.entries });

        // let tagFile2Write = new Date();
        // console.log(`tagged-content 2WRITE INDEX for ${tagData.tagName} with ${tagData.entries.length} entries in ${(new Date() - tagFileStart) / 1000} seconds`);

        let entryText = plugin.options.headerTemplate
            .replace("@title@", tagData.tagName)
            .replace("@tagName@", tagData.tagName)
            .replace("@tagDescription@", tagData.tagDescription);
        entryText += text2write;

        const tagFileWritten = new Date() - tagFileStart;

        /*
         * An earlier conception for this was to:
         * 1. Set up a temporary directory
         * 2. Mount that temporary directory as /tags
         * 3. Therefore the FileCache would automatically scan
         *    that directory
         * 4. In this function, we write document files to that
         *    directory
         * 5. The rendering system would automatically pick up those
         *    files and render them
         *
         * HOWEVER - it was deemed simpler to instead directly render
         * content to the output directory.  Hence the following code takes
         * the "entryText", parses it for frontmatter and content, then
         * computes the correct metadata, renders the content, and writes it
         * directly to the output directory.
         */

        const renderer = config.findRendererPath(tagFileName);
        const rc = renderer.parseMetadata({
            fspath: tagFilePath,
            content: entryText
        });
        const vpath = path.join(plugin.options.pathIndexes,
                                renderer.filePath(tagFileName));
        // Set up the metadata as per HTMLRenderer.newInitMetadata
        rc.metadata.document = {
            basedir: '/',
            relpath: '/',
            relrender: renderer.filePath(tagFileName),
            path: path.join(plugin.options.pathIndexes, tagFileName),
            renderTo: vpath
        };
        rc.metadata.config = config;
        rc.metadata.partialSync = (fname, metadata) => {
            // console.log(`partialSync ${fname}`);
            return config.akasha.partialSync(config, fname, metadata); // .bind(renderer, config);
        };
        rc.metadata.partial     = async (fname, metadata) => {
            // console.log(`partial ${fname}`);
            return config.akasha.partial(config, fname, metadata); // .bind(renderer, config);
        };
        rc.metadata.root_url = config.root_url;
        rc.metadata.akasha = akasha;
        rc.metadata.plugin = config.plugin;
        rc.metadata.rendered_date = new Date();
        rc.metadata.publicationDate = new Date();

        if (config.root_url) {
            let pRootUrl = url.parse(config.root_url);
            pRootUrl.pathname = path.normalize(
                    path.join(pRootUrl.pathname, rc.metadata.document.renderTo)
            );
            rc.metadata.rendered_url = url.format(pRootUrl);
        }
        // Initial content render

        // console.log(`renderTagFile ${tagNameEncoded}`, rc);
        const rendered = await renderer.render(rc);

        const writeTo = path.join(config.renderDestination,
                                  rc.metadata.document.renderTo);

        // console.log(`renderTagFile ${tagFileName} `, fm);

        // Handle the layout field
        // This function also handles Mahabhuta tags

        let layoutrendered;
        if (rc.metadata.layout) {

            const layouts = config.akasha.filecache.layouts;
            await layouts.isReady();

            let found = await layouts.find(rc.metadata.layout);
            if (!found) {
                throw new Error(`No layout found in ${util.inspect(config.layoutDirs)} for ${rc.metadata.layout} in file ${rc.fspath}`);
            }

            let layoutmetadata = {};
            for (var yprop in rc.metadata) {
                if (yprop !== 'layout') {
                    layoutmetadata[yprop] = rc.metadata[yprop];
                }
            }
            layoutmetadata.content = rendered;

            const renderer = config.findRendererPath(rc.metadata.layout);

            if (!renderer) {
                throw new Error(`No renderer for ${rc.metadata.layout} in file ${rc.fspath}`);;
            }

            try {
                layoutrendered = await renderer.render({
                    fspath: found.fspath,
                    content: found.docContent,
                    body: found.docBody,
                    metadata: layoutmetadata
                });
            } catch (e) {
                let ee = new Error(`Error rendering ${rc.fspath} with ${rc.metadata.layout} ${e.stack ? e.stack : e}`);
                console.error(ee);
                throw ee;
            }

        } else {
            layoutrendered = rendered;
        }

        let finalrender;
        try {

            const mahametadata = {};
            for (var yprop in rc.metadata) {
                mahametadata[yprop] = rc.metadata[yprop];
            }
            mahametadata.content = layoutrendered;

            if (rc.metadata.config.mahabhutaConfig) {
                mahabhuta.config(rc.metadata.config.mahabhutaConfig);
            }
            // console.log(`mahametadata`, mahametadata);
            finalrender = await mahabhuta.processAsync(
                layoutrendered, mahametadata, config.mahafuncs
            );

            // OLD docrendered = await this.maharun(layoutrendered, docdata, config.mahafuncs);
        } catch (e2) {
            let eee = new Error(`Error with Mahabhuta ${docInfo.vpath} with ${docInfo.metadata.layout} ${e2.stack ? e2.stack : e2}`);
            console.error(eee);
            throw eee;
        }

        // console.log(`renderTagFile ${tagFileName} ==> ${writeTo} :- `, finalrender);

        // Make sure the directory is there
        await fsp.mkdir(path.dirname(writeTo), {
            recursive: true, mode: 0o755
        });

        // Write the resulting text to the output directory
        await fsp.writeFile(writeTo, finalrender);

        // Generate RSS feeds for each tag

        const tagFileRendered = new Date() - tagFileStart;

        const rssFeed = new RSS({
            title: "Documents tagged with " + tagData.tagName,
            site_url: `${config.root_url}${tagRSSFileName}`,
        });

        for (let tagEntry of tagData.entries) {
            let u = new URL(config.root_url);
            u.pathname = tagEntry.renderPath;
            let dt = tagEntry.metadata.publicationDate;
            if (!dt) {
                let stats = await fsp.stat(tagEntry.fspath);
                dt = stats.mtime;
            }
            rssFeed.item({
                title: tagEntry.metadata.title,
                description: tagEntry.metadata.teaser ? tagEntry.metadata.teaser : "",
                url: u.toString(),
                date: dt
            });
        }

        const xml = rssFeed.xml();
        await fsp.writeFile(path.join(config.renderDestination,
                                      plugin.options.pathIndexes,
                                      tagRSSFileName), 
            xml, { encoding: 'utf8' });

        // Finish up data collection

        const tagFileEnd = new Date();
        console.log(`tagged-content GENERATE INDEX for ${tagData.tagName} with ${tagData.entries.length} entries, sorted in ${tagFileSorted / 1000} seconds, written in ${tagFileWritten / 1000} seconds, rendered in ${tagFileRendered / 1000} seconds, finished in ${(tagFileEnd - tagFileStart) / 1000} seconds`);

        tagIndexCount++;
    }

    const queue = fastq.promise(renderTagFile, config.concurrency);

    const waitFor = [];
    for (let tagData of tagCloudData.tagData) {
        waitFor.push(queue.push(tagData));
    }
    for (let towait of waitFor) {
        try {
            let result = await towait;
        } catch (err) {
            console.error(`generateTagIndexes ERROR CAUGHT renderTagFile `, err.stack);
            throw err;
        }
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

    console.log(`tagged-content FINISH tag indexing for ${tagIndexCount} indexes in ${(new Date() - tagIndexStart) / 1000} seconds`);
};

async function genTagCloudData(config) {
    const plugin = config.plugin(pluginName);
    let startTime = new Date();

    let tagCloudData = {
        tagData: []
    };

    const filecache = config.akasha.filecache;
    const _documents = filecache.documents.documentsWithTags();

    // console.log(`genTagCloudData documents `, _documents);

    // console.log(`genTagCloudData documentSearch ${(new Date() - startTime) / 1000} seconds`);

    for (let doc of _documents) {
        // let document = await akasha.readDocument(config, doc.vpath);
        let document = await filecache.documents.find(doc.vpath);
        // document.taglist = plugin.documentTags(document);
        // document.taglist = document.docMetadata.tags;
        // console.log(`genTagCloudData ${document.fspath} `, document.metadata.tags);
        if (typeof document.metadata.tags !== 'undefined'
         && Array.isArray(document.metadata.tags)) {
            // console.log(util.inspect(document.taglist));
            for (let tagnm of document.metadata.tags) {
                let td = undefined;
                for (var j = 0; j < tagCloudData.tagData.length; j++) {
                    if (tagCloudData.tagData[j].tagName.toLowerCase() === tagnm.toLowerCase()) {
                        td = tagCloudData.tagData[j];
                    }
                }
                if (typeof td === 'undefined' || !td) {
                    td = { 
                        tagName: tagnm,
                        tagDescription: plugin.tagDescription(tagnm),
                        entries: [] 
                    };
                    tagCloudData.tagData.push(td);
                }
                td.entries.push(document);
                // console.log(tagnm +' '+ util.inspect(td));
            }
            // console.log(util.inspect(tagCloudData.tagData));
        }
    }

    // console.log(`genTagCloudData documentTags ${(new Date() - startTime) / 1000} seconds`);
    // log('******** DONE akasha.eachDocument count='+ tagCloudData.tagData.length);
    for (var tagnm of tagCloudData.tagData.keys()) {
        // console.log(`${tagnm}: ${typeof tagCloudData.tagData[tagnm]}`);
        tagCloudData.tagData[tagnm].count = tagCloudData.tagData[tagnm].entries.length;
        // log(tagCloudData.tagData[tagnm].tagName +' = '+ tagCloudData.tagData[tagnm].entries.length);
    }
    taggen.generateFontSizes(tagCloudData.tagData);
    // console.log(`genTagCloudData generateFontSizes ${(new Date() - startTime) / 1000} seconds`);

    tagCloudData = {
        tagData: tagCloudData.tagData.sort((a,b) => {
            var tagA = a.tagName.toLowerCase();
            var tagB = b.tagName.toLowerCase();
            if (tagA < tagB) return -1;
            if (tagA > tagB) return 1;
            return 0;
        })
    };
    // console.log(`genTagCloudData tagCloudData.tagData.sort ${(new Date() - startTime) / 1000} seconds`);
    // console.log(`genTagCloudData fini`);
    return tagCloudData;
};
