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
const async    = require('async');
const co       = require('co');
const taggen   = require('tagcloud-generator');
const tmp      = require('temporary');
const akasha   = require('akasharender');

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

module.exports.mahabhuta = [
	function($, metadata, dirty, done) {
		// util.log('tagged-content <tag-cloud>');
		var elements = [];
		$('tag-cloud').each(function(i, elem) { elements.push(elem); });
		async.each(elements, (element, cb) => {
			genTagCloudData(metadata.config)
			.then(tagCloudData => {
                /* console.log('******* tag-cloud tags:');
                for (let tagdata of tagCloudData.tagData) {
                    console.log(`     ${tagdata.tagName}`);
                } */
                // console.log(util.inspect(tagCloudData.tagData));
				var tagCloud = taggen.generateSimpleCloud(tagCloudData.tagData, tagName => {
					return tagPageUrl(metadata.config, tagName);
				}, "");
                // console.log(tagCloud);
				$(element).replaceWith(tagCloud);
				cb();
			})
			.catch(err => { cb(err); });
		},
		err => {
			if (err) done(err);
			else done();
		});
	},

	function($, metadata, dirty, done) {
		// util.log('tagged-content <tag-for-document>');
		var tfds = [];
		$('tags-for-document').each(function(i, elem) { tfds.push(elem); });
		async.each(tfds,
		(tfd, cb) => {
			if (tfd) {
				doTagsForDocument(metadata.config, metadata, "tagged-content-doctags.html.ejs")
				.then(tags => {
					// log('tags-for-document '+ metadata.tags +' '+ tags);
					$(tfd).replaceWith(tags);
					cb();
				})
				.catch(err => { cb(err); });
			} else cb();
		},
		err => {
			if (err) done(err);
			else done();
		});
	}
];

var tagPageUrl = function(config, tagName) {
    return config.pluginData(pluginName).pathIndexes + tag2encode4url(tagName) +'.html';
}

var tagParse = function(tags) {
    var taglist = [];
    var re = /\s*,\s*/;
    if (tags) tags.split(re).forEach(function(tag) {
        taglist.push(tag.trim());
    });
    return taglist;
}

var documentTags = function(document) {
	// log('documentTags '+ util.inspect(document.metadata));
    if (document.metadata && document.metadata.tags) {
        // parse tags
        // foreach tag:- tagCloudData[tag] .. if null, give it an array .push(entry)
        // util.log(entry.frontmatter.tags);
        var taglist = tagParse(document.metadata.tags);
        return taglist;
    } else {
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

module.exports.generateTagIndexes = co.wrap(function* (config) {
    var tempDir = new tmp.Dir();
    var tagsDir = path.join(tempDir.path, config.pluginData(pluginName).pathIndexes);
    log('generateTagIndexes '+ tagsDir);
    yield new Promise((resolve, reject) => {
        fs.mkdir(tagsDir, err => {
            if (err) reject(err);
            else resolve();
        });
    })
    var tagCloudData = yield genTagCloudData(config);

    // log(util.inspect(tagCloudData));

    for (let tagData of tagCloudData.tagData) {

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

        var text2write = yield akasha.partial(config,
                "tagged-content-tagpagelist.html.ejs",
                { entries: tagData.entries });


        var entryText = config.pluginData(pluginName).headerTemplate
            .replace("@title@", tagData.tagName)
            .replace("@tagName@", tagData.tagName);
        entryText += text2write;

        yield new Promise((resolve, reject) => {
            fs.writeFile(path.join(tagsDir, tagFileName), entryText,
                err => {
                    if (err) reject(err);
                    else resolve();
                });
        });

        yield akasha.renderDocument(
                        config,
                        tagsDir,
                        tagFileName,
                        config.renderDestination,
                        config.pluginData(pluginName).pathIndexes);
    }

    yield new Promise((resolve, reject) => {
        fs.remove(tempDir.path, err => {
            if (err) reject(err);
            else resolve();
        });
    });

});

var tagCloudData;

function genTagCloudData(config) {
    return co(function* () {
        if (tagCloudData) {
            return tagCloudData;
        }

        tagCloudData = {
            tagData: []
        };

        var documents = yield akasha.documentSearch(config, {
            // rootPath: '/',
            renderers: [ akasha.HTMLRenderer ]
        });

        for (let document of documents) {
            document.taglist = documentTags(document);
            if (document.taglist) {
                log(util.inspect(document.taglist));
                for (let tagnm of document.taglist) {
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
        for (var tagnm in tagCloudData.tagData) {
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
        return tagCloudData;
    });
};
