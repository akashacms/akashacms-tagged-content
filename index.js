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
const fs       = require('fs-extra');
const RSS      = require('rss');
const taggen   = require('tagcloud-generator');
const tmp      = require('temporary');
const akasha   = require('akasharender');
const mahabhuta = akasha.mahabhuta;
const parallelLimit = require('run-parallel-limit');

const pluginName = "@akashacms/plugins-tagged-content";

const _plugin_config = Symbol('config');
const _plugin_options = Symbol('options');

module.exports = class TaggedContentPlugin extends akasha.Plugin {
    constructor() { super(pluginName); }

    configure(config, options) {
        this[_plugin_config] = config;
        this[_plugin_options] = options;
        options.config = config;
        config.addPartialsDir(path.join(__dirname, 'partials'));
        config.addMahabhuta(module.exports.mahabhutaArray(options));
    }

    get config() { return this[_plugin_config]; }
    get options() { return this[_plugin_options]; }

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

    beforeSiteRendered(config) {
        return module.exports.generateTagIndexes(config);
    }

    onSiteRendered(config) {
        return module.exports.generateTagIndexes(config);
    }

    hasTag(tags, tag) {
        var taglist = tagParse(tags);
        // console.log(`documentHasTag ${tag} ${util.inspect(taglist)}`);
        return taglist ? taglist.includes(tag) : false;
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
};


function doTagsForDocument(config, metadata, template) {
    var taglist = documentTags({ metadata: metadata });
    if (taglist) {
        // log('doTagsForDocument '+ util.inspect(taglist));
        return akasha.partial(config, template, {
            tagz: taglist.map(tag => {
                return {
                    tagName: tag,
                    tagUrl: tagPageUrl(config, tag)
                };
            })
        });
    } else return Promise.resolve("");
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
        // let startTime = new Date();
        let id = $element.attr('id');
        let clazz = $element.attr('class');
        let style = $element.attr('style');
        let thisConfig = this.array.options.config;
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
            return tagPageUrl(thisConfig, tagName);
        }, "");
        // console.log(tagCloud);
        // console.log(`TagCloudElement ${metadata.document.path} generateSimpleCloud ${(new Date() - startTime) / 1000} seconds`);
        return akasha.partial(thisConfig, "tagged-content-cloud.html.ejs", {
            tagCloud, id, clazz, style
        });
    }
}

class TagsForDocumentElement extends mahabhuta.CustomElement {
    get elementName() { return "tags-for-document"; }
    process($element, metadata, dirty, done) {
        return doTagsForDocument(this.array.options.config, metadata, "tagged-content-doctags.html.ejs");
    }
}

class TagsFeedsListElement extends mahabhuta.CustomElement {
    get elementName() { return "tags-feeds-list"; }
    async process($element, metadata, dirty, done) {
        const template = $element.attr('template') 
                ? $element.attr('template')
                :  "tagged-content-feedlist.html.ejs";
        const id = $element.attr('id');
        const additionalClasses = $element.attr('additional-classes')
                ? $element.attr('additional-classes')
                : "";
        const tagCloudData = await genTagCloudData(this.array.options.config);

        // console.log(`TagsFeedsListElement `, this.array.options);
        // console.log(`TagsFeedsListElement `, tagCloudData);

        return akasha.partial(this.array.options.config, template, {
            id, additionalClasses, tag2encode4url,
            pathIndexes: this.array.options.pathIndexes,
            entries: tagCloudData.tagData
        });
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
        return akasha.partial(this.array.options.config, template, {
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
        return akasha.partial(this.array.options.config, template, {
            id, additionalClasses, description, name, href
        });
    }
}

var tagPageUrl = function(config, tagName) {
    return config.plugin(pluginName).options.pathIndexes + tag2encode4url(tagName) +'.html';
}

var tagParse = function(tags) {
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

var documentTags = function(document) {
    // console.log('documentTags '+ util.inspect(document.metadata));
    if (document.metadata && document.metadata.tags) {
        // parse tags
        // foreach tag:- tagCloudData[tag] .. if null, give it an array .push(entry)
        // util.log(entry.frontmatter.tags);
        var taglist = tagParse(document.metadata.tags);
        // console.log(`documentTags taglist ${document.relpath} ${document.metadata.tags} ==> ${util.inspect(taglist)}`);
        return taglist;
    } else {
        // console.log(`documentTags ${document.relpath} NO taglist`);
        return undefined;
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

function noteError(err) {
    if (err) error(err);
}

module.exports.generateTagIndexes = async function (config) {
    const tagIndexStart = new Date();
    var tagIndexCount = 0;
    var tempDir = new tmp.Dir();
    var tagsDir = path.join(tempDir.path, config.plugin(pluginName).options.pathIndexes);
    // log('generateTagIndexes '+ tagsDir);
    await new Promise((resolve, reject) => {
        fs.mkdir(tagsDir, err => {
            if (err) reject(err);
            else resolve();
        });
    })
    var tagCloudData = await genTagCloudData(config);

    // log(util.inspect(tagCloudData));

    // This runs the page generation somewhat in parallel.
    // parallelLimit runs N at a time (see concurrency count below)
    //
    // See: https://techsparx.com/nodejs/async/avoid-async-kill-performance.html
    var results = await new Promise((resolve, reject) => {
        parallelLimit(tagCloudData.tagData.map(tagData => {
            // An async function is used here solely to simplify the code.
            // This is still being executed inside a Promise and we have to
            // respect the callback function that's being used.
            return async function(cb) {
                try {
                    let tagFileStart = new Date();
                    // log(util.inspect(tagData));
                    let tagNameEncoded = tag2encode4url(tagData.tagName);
                    let tagFileName = tagNameEncoded +".html.ejs";
                    let tagRSSFileName = tagNameEncoded +".xml";

                    if (config.plugin(pluginName).options.sortBy === 'date') {
                        tagData.entries.sort(sortByDate);
                        tagData.entries.reverse();
                    } else if (config.plugin(pluginName).options.sortBy === 'title') {
                        tagData.entries.sort(sortByTitle);
                    } else {
                        tagData.entries.sort(sortByTitle);
                    }

                    let tagFileSorted = new Date() - tagFileStart;

                    // let tagFileSort = new Date();
                    // console.log(`tagged-content SORTED INDEX for ${tagData.tagName} with ${tagData.entries.length} entries in ${(tagFileSort - tagFileStart) / 1000} seconds`);

                    let text2write = await akasha.partial(config,
                            "tagged-content-tagpagelist.html.ejs",
                            { entries: tagData.entries });

                    // let tagFile2Write = new Date();
                    // console.log(`tagged-content 2WRITE INDEX for ${tagData.tagName} with ${tagData.entries.length} entries in ${(tagFile2Write - tagFileStart) / 1000} seconds`);
                    
                    let entryText = config.plugin(pluginName).options.headerTemplate
                        .replace("@title@", tagData.tagName)
                        .replace("@tagName@", tagData.tagName)
                        .replace("@tagDescription@", tagData.tagDescription);
                    entryText += text2write;

                    await fs.writeFile(path.join(tagsDir, tagFileName), entryText);
                    let tagFileWritten = new Date() - tagFileStart;
                    await akasha.renderDocument(
                                    config,
                                    tagsDir,
                                    tagFileName,
                                    config.renderDestination,
                                    config.plugin(pluginName).options.pathIndexes);
                    
                    // Generate RSS feeds for each tag

                    const rssFeed = new RSS({
                        title: "Documents tagged with " + tagData.tagName,
                        site_url: `${config.root_url}${tagRSSFileName}`,
                    });
                    
                    for (let tagEntry of tagData.entries) {
                        let u = new URL(config.root_url);
                        u.pathname = tagEntry.renderpath;
                        rssFeed.item({
                            title: tagEntry.metadata.title,
                            description: tagEntry.teaser ? tagEntry.teaser : "",
                            url: u.toString(),
                            date: tagEntry.metadata.publicationDate 
                                ? tagEntry.metadata.publicationDate : tagEntry.stat.mtime
                        });
                    }

                    const xml = rssFeed.xml();
                    await fs.writeFile(
                        path.join(config.renderDestination, config.plugin(pluginName).options.pathIndexes, tagRSSFileName), 
                        xml,
                        { encoding: 'utf8' });


                    // Finish up data collection

                    let tagFileEnd = new Date();
                    console.log(`tagged-content GENERATE INDEX for ${tagData.tagName} with ${tagData.entries.length} entries, sorted in ${tagFileSorted / 1000} seconds, written in ${tagFileWritten / 1000} seconds, finished in ${(tagFileEnd - tagFileStart) / 1000} seconds`);
                    
                    tagIndexCount++;
                    cb();
                } catch (err) {
                    cb(err);
                }
            }
        }),
        10, // concurrency count
        function(err, results) {
            // gets here on final results
            if (err) reject(err);
            else resolve(results);
        });
    });

    if (config.plugin(pluginName).options.indexTemplate) {
        var entryText = config.plugin(pluginName).options.indexTemplate;

        var tags = '';
        for (let tagData of tagCloudData.tagData) {

            let tagNameEncoded = tag2encode4url(tagData.tagName);
            let tagFileName = 
                config.plugin(pluginName).options.pathIndexes 
                + tagNameEncoded +".html";
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

        await fs.writeFile(path.join(tagsDir, "index.html.ejs"), entryText);
        await akasha.renderDocument(
                        config,
                        tagsDir,
                        "index.html.ejs",
                        config.renderDestination,
                        config.plugin(pluginName).options.pathIndexes);
    }

    await fs.remove(tempDir.path);

    const tagIndexEnd = new Date();

    console.log(`tagged-content FINISH tag indexing for ${tagIndexCount} indexes in ${(tagIndexEnd - tagIndexStart) / 1000} seconds`);
};

var tagCloudData;

async function genTagCloudData(config) {
    if (tagCloudData) {
        return tagCloudData;
    }
    
    // let startTime = new Date();

    tagCloudData = {
        tagData: []
    };

    var documents = await akasha.documentSearch(config, {
        // rootPath: '/',
        renderers: [ akasha.HTMLRenderer ]
    });

    // console.log(`genTagCloudData documentSearch ${(new Date() - startTime) / 1000} seconds`);

    for (let document of documents) {
        document.taglist = documentTags(document);
        if (typeof document.taglist !== 'undefined' && Array.isArray(document.taglist)) {
            // console.log(util.inspect(document.taglist));
            for (let tagnm of document.taglist) {
                let td = undefined;
                for (var j = 0; j < tagCloudData.tagData.length; j++) {
                    if (tagCloudData.tagData[j].tagName.toLowerCase() === tagnm.toLowerCase()) {
                        td = tagCloudData.tagData[j];
                    }
                }
                if (typeof td === 'undefined' || !td) {
                    td = { 
                        tagName: tagnm,
                        tagDescription: config.plugin(pluginName).tagDescription(tagnm),
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
