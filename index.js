/**
 *
 * Copyright 2013 David Herron
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
const taggen   = require('tagcloud-generator');
const tmp      = require('temporary');
const akasha   = require('akasharender');

const log   = require('debug')('akasha:tagged-content-plugin');
const error = require('debug')('akasha:error-tagged-content-plugin');

module.exports = class TaggedContentPlugin extends akasha.Plugin {
	constructor() {
		super("akashacms-tagged-content");
	}
	
	configure(config) {
		this._config = config;
		config.addPartialsDir(path.join(__dirname, 'partials'));
		config.addMahabhuta(module.exports.mahabhuta);
	}
	
	sortBy(sort) {
		if (!this._config.taggedContent) this._config.taggedContent = {};
		this._config.taggedContent.sortBy = sort;
		return this;
	}
	
	headerTemplate(template) {
		if (!this._config.taggedContent) this._config.taggedContent = {};
		this._config.taggedContent.headerTemplate = template;
		return this;
	}
	
	tagsDirectory(dirName) {
		if (!this._config.taggedContent) this._config.taggedContent = {};
		this._config.taggedContent.pathIndexes = dirName;
		return this;
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
				var tagCloud = taggen.generateSimpleCloud(tagCloudData.tagData, tagName => {
					return tagPageUrl(metadata.config, tagName);
				}, "");
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
    return config.taggedContent.pathIndexes + tag2encode4url(tagName) +'.html';
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

module.exports.generateTagIndexes = function(config) {
    var tempDir = new tmp.Dir();
    var tagsDir = path.join(tempDir.path, config.taggedContent.pathIndexes);
	log('generateTagIndexes '+ tagsDir);
    return new Promise((resolve, reject) => {
		fs.mkdir(tagsDir, err => {
			if (err) reject(err);
			else resolve();
		});
	})
	.then(() => { return genTagCloudData(config); })
	.then(tagCloudData => {
		
		// log(util.inspect(tagCloudData));
		
		return new Promise((resolve, reject) => {
			async.eachSeries(tagCloudData.tagData,
			(tagData, next) => {
				
				// log(util.inspect(tagData));
				var tagNameEncoded = tag2encode4url(tagData.tagName);
				var tagFileName = tagNameEncoded +".html.ejs";
				
				if (config.taggedContent.sortBy === 'date') {
					tagData.entries.sort(sortByDate);
					tagData.entries.reverse();
				} else if (config.taggedContent.sortBy === 'title') {
					tagData.entries.sort(sortByTitle);
				} else {
					tagData.entries.sort(sortByTitle);
				}
				
				akasha.partial(config, "tagged-content-tagpagelist.html.ejs", { entries: tagData.entries })
				.then(text2write => {
					
					var entryText = config.taggedContent.headerTemplate
						.replace("@title@", tagData.tagName)
						.replace("@tagName@", tagData.tagName);
					entryText += text2write;
				
					return new Promise((resolve, reject) => {
						fs.writeFile(path.join(tagsDir, tagFileName), entryText,
							err => {
								if (err) reject(err);
								else resolve();
							});
					});
				})
				.then(() => {
					return akasha.renderDocument(config, tagsDir, tagFileName, config.renderDestination, config.taggedContent.pathIndexes);
				})
				.then(() => { next(); })
				.catch(err => { next(err); });
			},
			err => {
				if (err) reject(err);
				else resolve();
			});	
		});
	})
	.then(() => {
		return new Promise((resolve, reject) => {
			fs.remove(tempDir.path, err => {
				if (err) reject(err);
				else resolve();
			});
		});
	});
	/* 
    config.root_docs.push(tempDir.path);
    var tagsDir = path.join(tempDir.path, config.taggedContent.pathIndexes);
    fs.mkdirSync(tagsDir);

    for (var tagnm in tagCloudData.tagData) {
        var feedRenderTo;
        var entry;
        var tagData = tagCloudData.tagData[tagnm];
        var tagNameEncoded = tag2encode4url(tagData.tagName);
        
        if (config.taggedContent.sortBy === 'date') {
        	tagData.entries.sort(sortByDate);
        	tagData.entries.reverse();
        } else if (config.taggedContent.sortBy === 'title') {
        	tagData.entries.sort(sortByTitle);
        } else {
        	tagData.entries.sort(sortByTitle);
        }
        
        var entryText = config.taggedContent.header
            .replace("@title@", tagData.tagName)
            .replace("@tagName@", tagData.tagName);
            
        var entriez = [];
        for (var j = 0; j < tagData.entries.length; j++) {
            entry = tagData.entries[j];
            entriez.push({
                url: akasha.urlForFile(entry.path),
                title: entry.metadata.title,
                teaser: entry.metadata.teaser
                      ? entry.metadata.teaser
                      : "",
                teaserThumb:
						entry.metadata.teaserthumb
                      ? entry.metadata.teaserthumb
                      : "",
				youtubeThumbnail: entry.metadata.youtubeThumbnail
					   ? entry.metadata.youtubeThumbnail
					   : undefined,
				videoThumbnail: entry.metadata.videoThumbnail
					   ? entry.metadata.videoThumbnail
					   : undefined,
				publicationDate: entry.metadata.publicationDate
					   ? entry.metadata.publicationDate
					   : undefined
            });
        }
        
        // logger.trace(util.inspect(entriez));
        
        // Optionally generate an RSS feed for the tag page
        var rsslink = "";
        if (config.rss) {
        	// logger.trace(tagnm +' writing RSS');
			// Ensure it's sorted by date
	 		tagData.entries.sort(sortByDate);
	 		tagData.entries.reverse();
		
			var rssitems = [];
			for (var q = 0; q < tagData.entries.length; q++) {
				entry = tagData.entries[q];
				rssitems.push({
					title: entry.frontmatter.yaml.title,
					description: entry.frontmatter.yaml.teaser // TBD what about supporting full feeds?
						  ? entry.frontmatter.yaml.teaser
						  : "",
					teaserThumb:
							entry.frontmatter.yaml.teaserthumb
						  ? entry.frontmatter.yaml.teaserthumb
						  : "",
					url: config.root_url +'/'+ entry.renderedFileName,
					date: entry.frontmatter.yaml.publicationDate
						? entry.frontmatter.yaml.publicationDate
						: entry.stat.mtime
				});
			}
        	// logger.trace(tagnm +' rss feed entry count='+ rssitems.length);
		
			feedRenderTo = path.join(config.taggedContent.pathIndexes, tagNameEncoded +".xml");
        	logger.trace(tagnm +' writing RSS to '+ feedRenderTo);
		
			akasha.generateRSS(config.rss, {
					feed_url: config.root_url + feedRenderTo,
					pubDate: new Date()
				},
				rssitems, feedRenderTo,	noteError);
				
			rsslink = '<a href="'+ feedRenderTo +'"><img src="/img/rss_button.gif" align="right" width="50"/></a>';
        }
        		
        // logger.trace(tagnm +' tag entry count='+ entriez.length);
        entryText += akasha.partialSync("tagged-content-tagpagelist.html.ejs", {
            entries: entriez
        });
        if (rsslink !== "") {
			entryText += '<div>' + rsslink + '</div>';
			entryText += '<rss-header-meta href="'+ config.root_url + feedRenderTo +'"></rss-header-meta>';
        }
        var tagFileName = path.join(tagsDir, tagNameEncoded +".html.ejs");
        logger.trace(tagnm +' writing to '+ tagFileName);
        fs.writeFileSync(tagFileName, entryText, {
            encoding: 'utf8'
        });
    }
    */
    
};

var tagCloudData;

function genTagCloudData(config) {
    if (!tagCloudData) {
        tagCloudData = {
            tagData: []
        };
		return akasha.documentSearch(config, {
			// rootPath: '/',
			renderers: [ akasha.HTMLRenderer ]
		})
		.then(documents => {
			// log('genTagCloudData '+ util.inspect(documents));
			return documents.map(document => {	
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
			});
		})
		.then(documents => {
			// log('******** DONE akasha.eachDocument count='+ tagCloudData.tagData.length);
			for (var tagnm in tagCloudData.tagData) {
				tagCloudData.tagData[tagnm].count = tagCloudData.tagData[tagnm].entries.length;
				// log(tagCloudData.tagData[tagnm].tagName +' = '+ tagCloudData.tagData[tagnm].entries.length);
			}
			taggen.generateFontSizes(tagCloudData.tagData);
			return tagCloudData;
		});
    } else return Promise.resolve(tagCloudData);
};
