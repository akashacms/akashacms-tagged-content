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

var path     = require('path');
var util     = require('util');
var fs       = require('fs');
var async    = require('async');
var taggen   = require('tagcloud-generator');
var Tempdir  = require('temporary/lib/dir');

var tagCloudData = undefined;
var tempDir      = undefined;

/**
 * Add ourselves to the config data.
 **/
module.exports.config = function(akasha, config) {
    
    config.root_partials.push(path.join(__dirname, 'partials'));
    
    if (config.mahabhuta) {
        config.mahabhuta.push(function(akasha, config, $, metadata, done) {
        	// util.log('tagged-content <tag-cloud>');
            $('tag-cloud').each(function(i, elem) {
                genTagCloudData(akasha, config);
                $(this).replaceWith(
                    taggen.generateSimpleCloud(tagCloudData.tagData, function(tagName) {
                        return tagPageUrl(config, tagName);
                    }, "")
                );
            });
            done();
        });
        config.mahabhuta.push(function(akasha, config, $, metadata, done) {
        	// util.log('tagged-content <tag-for-document>');
        	var tfds = [];
            $('tags-for-document').each(function(i, elem) { tfds.push(elem); });
            async.each(tfds,
            	function(tfd, cb) {
            		if (tfd)
						doTagsForDocument(metadata, "tagged-content-doctags.html.ejs", function(err, tags) {
							if (err) cb(err);
							else {
								$(tfd).replaceWith(tags);
								cb();
							}
						});
					else cb();
            	},
            	function(err) {
            		if (err) done(err);
            		else done();
            	});
        });
    }
    
    config.funcs.tagCloud = function(arg, callback) {
        genTagCloudData(akasha, config);
        var val = taggen.generateSimpleCloud(tagCloudData.tagData, function(tagName) {
            return tagPageUrl(config, tagName);
        }, "");
        // util.log('tagCloud ' + val);
        if (callback) callback(undefined, val);
        return val;
    }
    
    var doTagsForDocument = function(arg, template, done) {
        akasha.readDocumentEntry(config, arg.documentPath, function(err, entry) {
        	if (err) done(err);
        	else {
				var taglist = entryTags(entry);
		
				var val = "";
				if (taglist) {
					var tagz = [];
					for (var i = 0; i < taglist.length; i++) {
						tagz.push({
							tagName: taglist[i], 
							tagUrl: tagPageUrl(config, taglist[i]) 
						});
					}
					val = akasha.partialSync(config, template, { tagz: tagz });
				}
				done(undefined, val);
			}
        });
    }
    
    
    config.funcs.tagsForDocument = function(arg, callback) {
    	throw new Error("do not call tagsForDocument - use <tags-for-document>");
        doTagsForDocument(arg, "tagged-content-doctags.html.ejs", callback);
    }
    
    /* We don't want an xyzzyBootstrap function
    config.funcs.tagsForDocumentBootstrap = function(arg, callback) {
        return doTagsForDocument(arg, "tagged-content-doctags-bootstrap.html.ejs", callback);
    }*/
    
    akasha.emitter.on('before-render-files', function(cb) {
        util.log('before-render-files received');
        module.exports.generateTagIndexes(akasha, config, function(err) {
            if (err) cb(err); else cb();
        });
    });
    akasha.emitter.on('done-render-files', function(cb) {
        util.log('done-render-files received');
        // fs.rmdirSync(tempDir.path);
        cb();
    });
}

var tagPageUrl = function(config, tagName) {
    return config.tags.pathIndexes + tag2encode4url(tagName) +'.html';
}

var tagParse = function(tags) {
    var taglist = [];
    var re = /\s*,\s*/;
    if (tags) tags.split(re).forEach(function(tag) {
        taglist.push(tag.trim());
    });
    return taglist;
}

var entryTags = function(entry) {
    if (entry.frontmatter
         && entry.frontmatter.hasOwnProperty('yaml')
         && entry.frontmatter.yaml
         && entry.frontmatter.yaml.hasOwnProperty('tags')) {
        // parse tags
        // foreach tag:- tagCloudData[tag] .. if null, give it an array .push(entry)
        // util.log(entry.frontmatter.tags);
        var taglist = tagParse(entry.frontmatter.yaml.tags);
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

module.exports.generateTagIndexes = function(akasha, config, cb) {
    genTagCloudData(akasha, config);
    tempDir = new Tempdir;
    config.root_docs.push(tempDir.path);
    var tagsDir = path.join(tempDir.path, config.tags.pathIndexes);
    fs.mkdirSync(tagsDir);

    for (tagnm in tagCloudData.tagData) {
        var tagData = tagCloudData.tagData[tagnm];
        var tagNameEncoded = tag2encode4url(tagData.tagName);
        
        // TBD Sort the entries by ...?  Name?  Date?
        tagData.entries.sort(function(a, b) {
            if (a.frontmatter.yaml.title < b.frontmatter.yaml.title) return -1;
            else if (a.frontmatter.yaml.title === b.frontmatter.yaml.title) return 0;
            else return 1;
        });
        
        var entryText = config.tags.header
            .replace("@title@", tagData.tagName)
            .replace("@tagName@", tagData.tagName);
            
        var entriez = [];
        for (var j = 0; j < tagData.entries.length; j++) {
            var entry = tagData.entries[j];
            entriez.push({
                url: akasha.urlForFile(entry.path),
                title: entry.frontmatter.yaml.title,
                teaser: entry.frontmatter.yaml.teaser
                      ? entry.frontmatter.yaml.teaser
                      : ""
            });
        }
        entryText += akasha.partialSync(config, "tagged-content-tagpagelist.html.ejs", {
            entries: entriez
        });
        var tagFileName = path.join(tagsDir, tagNameEncoded +".html.ejs");
        // util.log('TAG FILE ' + tagFileName);
        fs.writeFileSync(tagFileName, entryText, {
            encoding: 'utf8'
        });
    }
    
    akasha.gatherDir(config, tempDir.path, function(err) {
        if (err) cb(err); else cb();
    });
}

var genTagCloudData = function(akasha, config) {
    if (!tagCloudData) {
        tagCloudData = {
            tagData: []
        };
        akasha.eachDocument(config, function(entry) {
            // util.log('eachDocument '+ entry.path);
            var taglist = entryTags(entry);
            if (taglist) {
                for (var i = 0; i < taglist.length; i++) {
                    var tagnm = taglist[i];
                    if (! tagCloudData.tagData[tagnm]) {
                        tagCloudData.tagData[tagnm] = { tagName: tagnm, entries: [] };
                    }
                    // util.log('*** adding '+ entry.path +' to entries for '+ tagnm);
                    tagCloudData.tagData[tagnm].entries.push(entry);
                }
            }
        });
        util.log('******** DONE akasha.eachDocument count='+ tagCloudData.tagData.length);
        /*tagCloudData.tagData.sort(function(a, b) {
            if (a.tagName < b.tagName) return -1;
            else if (a.tagName === b.tagName) return 0;
            else return 1;
        });*/
        for (tagnm in tagCloudData.tagData) {
            tagCloudData.tagData[tagnm].count = tagCloudData.tagData[tagnm].entries.length;
            // util.log(tagCloudData.tagData[tagnm].tagName +' = '+ tagCloudData.tagData[tagnm].entries.length);
        }
        taggen.generateFontSizes(tagCloudData.tagData);
        // util.log(util.inspect(tagCloudData));
    }
}