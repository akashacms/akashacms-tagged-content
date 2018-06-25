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
const taggen   = require('tagcloud-generator');
const tmp      = require('temporary');
const akasha   = require('akasharender');
const mahabhuta = akasha.mahabhuta;

const log   = require('debug')('akasha:tagged-content-plugin');
const error = require('debug')('akasha:error-tagged-content-plugin');

const pluginName = "akashacms-tagged-content";

module.exports = class TaggedContentPlugin extends akasha.Plugin {
    constructor() { super(pluginName); }

	configure(config) {
		this._config = config;
		config.addPartialsDir(path.join(__dirname, 'partials'));
		config.addMahabhuta(module.exports.mahabhuta);
	}

    sortBy(sort) {
        this._config.pluginData(pluginName).sortBy = sort;
        return this;
    }

    headerTemplate(template) {
        this._config.pluginData(pluginName).headerTemplate = template;
        return this;
    }

    tagsDirectory(dirName) {
        this._config.pluginData(pluginName).pathIndexes = dirName;
        return this;
    }

    isLegitLocalHref(config, href) {
        return href.startsWith(config.pluginData(pluginName).pathIndexes);
    }

	onSiteRendered(config) {
		return module.exports.generateTagIndexes(config);
	}

    hasTag(tags, tag) {
        var taglist = tagParse(tags);
        // console.log(`documentHasTag ${tag} ${util.inspect(taglist)}`);
        return taglist ? taglist.includes(tag) : false;
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

module.exports.mahabhuta = new mahabhuta.MahafuncArray("akashacms-tagged-content", {});

class TagCloudElement extends mahabhuta.CustomElement {
    get elementName() { return "tag-cloud"; }
    async process($element, metadata, dirty, done) {
        let id = $element.attr('id');
        let clazz = $element.attr('class');
        let style = $element.attr('style');
        var tagCloudData = await genTagCloudData(metadata.config);
        /* console.log('******* tag-cloud tags:');
        for (let tagdata of tagCloudData.tagData) {
            console.log(`     ${tagdata.tagName}`);
        } */
        // console.log(util.inspect(tagCloudData.tagData));
        var tagCloud = taggen.generateSimpleCloud(tagCloudData.tagData, tagName => {
            return tagPageUrl(metadata.config, tagName);
        }, "");
        // console.log(tagCloud);
        return akasha.partial(metadata.config, "tagged-content-cloud.html.ejs", {
            tagCloud, id, clazz, style
        });
    }
}
module.exports.mahabhuta.addMahafunc(new TagCloudElement());

class TagsForDocumentElement extends mahabhuta.CustomElement {
    get elementName() { return "tags-for-document"; }
    process($element, metadata, dirty, done) {
        return doTagsForDocument(metadata.config, metadata, "tagged-content-doctags.html.ejs");
    }
}
module.exports.mahabhuta.addMahafunc(new TagsForDocumentElement());

var tagPageUrl = function(config, tagName) {
    return config.pluginData(pluginName).pathIndexes + tag2encode4url(tagName) +'.html';
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
    var tagsDir = path.join(tempDir.path, config.pluginData(pluginName).pathIndexes);
    log('generateTagIndexes '+ tagsDir);
    await new Promise((resolve, reject) => {
        fs.mkdir(tagsDir, err => {
            if (err) reject(err);
            else resolve();
        });
    })
    var tagCloudData = await genTagCloudData(config);

    // log(util.inspect(tagCloudData));

    for (let tagData of tagCloudData.tagData) {

        let tagFileStart = new Date();
        // log(util.inspect(tagData));
        var tagNameEncoded = tag2encode4url(tagData.tagName);
        var tagFileName = tagNameEncoded +".html.ejs";

        if (config.pluginData(pluginName).sortBy === 'date') {
            tagData.entries.sort(sortByDate);
            tagData.entries.reverse();
        } else if (config.pluginData(pluginName).sortBy === 'title') {
            tagData.entries.sort(sortByTitle);
        } else {
            tagData.entries.sort(sortByTitle);
        }

        // let tagFileSort = new Date();
        // console.log(`tagged-content SORTED INDEX for ${tagData.tagName} with ${tagData.entries.length} entries in ${(tagFileSort - tagFileStart) / 1000} seconds`);

        var text2write = await akasha.partial(config,
                "tagged-content-tagpagelist.html.ejs",
                { entries: tagData.entries });

        // let tagFile2Write = new Date();
        // console.log(`tagged-content 2WRITE INDEX for ${tagData.tagName} with ${tagData.entries.length} entries in ${(tagFile2Write - tagFileStart) / 1000} seconds`);
        
        var entryText = config.pluginData(pluginName).headerTemplate
            .replace("@title@", tagData.tagName)
            .replace("@tagName@", tagData.tagName);
        entryText += text2write;

        await fs.writeFile(path.join(tagsDir, tagFileName), entryText);
        await akasha.renderDocument(
                        config,
                        tagsDir,
                        tagFileName,
                        config.renderDestination,
                        config.pluginData(pluginName).pathIndexes);

        let tagFileEnd = new Date();
        console.log(`tagged-content GENERATE INDEX for ${tagData.tagName} with ${tagData.entries.length} entries in ${(tagFileEnd - tagFileStart) / 1000} seconds`);
        
        tagIndexCount++;
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

    tagCloudData = {
        tagData: []
    };

    var documents = await akasha.documentSearch(config, {
        // rootPath: '/',
        renderers: [ akasha.HTMLRenderer ]
    });

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
                    td = { tagName: tagnm, entries: [] };
                    tagCloudData.tagData.push(td);
                }
                td.entries.push(document);
                // console.log(tagnm +' '+ util.inspect(td));
            }
            // console.log(util.inspect(tagCloudData.tagData));
        }
    }

    /* documents = documents.map(document => {
        document.taglist = documentTags(document);
        if (document.taglist) {
            log(util.inspect(document.taglist));
            for (var i = 0; i < document.taglist.length; i++) {
                var tagnm = document.taglist[i];
                var td;
                td = undefined;
                for (var j = 0; j < tagCloudData.tagData.length; j++) {
                    if (tagCloudData.tagData[j].tagName === tagnm) td = tagCloudData.tagData[j];
                }
                if (! td) {
                    td = { tagName: tagnm, entries: [] };
                    tagCloudData.tagData.push(td);
                }
                td.entries.push(document);
                // log(tagnm +' '+ util.inspect(td));
            }
        }
        return document;
    }); */

    // log('******** DONE akasha.eachDocument count='+ tagCloudData.tagData.length);
    for (var tagnm of tagCloudData.tagData.keys()) {
        // console.log(`${tagnm}: ${typeof tagCloudData.tagData[tagnm]}`);
        tagCloudData.tagData[tagnm].count = tagCloudData.tagData[tagnm].entries.length;
        // log(tagCloudData.tagData[tagnm].tagName +' = '+ tagCloudData.tagData[tagnm].entries.length);
    }
    taggen.generateFontSizes(tagCloudData.tagData);
    tagCloudData = {
        tagData: tagCloudData.tagData.sort((a,b) => {
            var tagA = a.tagName.toLowerCase();
            var tagB = b.tagName.toLowerCase();
            if (tagA < tagB) return -1;
            if (tagA > tagB) return 1;
            return 0;
        })
    };
    // console.log(`genTagCloudData fini`);
    return tagCloudData;
};
