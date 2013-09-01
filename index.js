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
var taggen   = require('tagcloud-generator');
var Tempdir  = require('temporary/lib/dir');

var tagCloudData = undefined;
var tempDir      = undefined;

/**
 * Add ourselves to the config data.
 **/
module.exports.config = function(akasha, config) {
    
    config.root_partials.push(path.join(__dirname, 'partials'));
    
    config.funcs.tagCloud = function(arg, callback) {
        genTagCloudData(akasha, config);
        var val = taggen.generateSimpleCloud(tagCloudData.tagData, function(tagName) {
            return tagPageUrl(config, tagName);
        }, "");
        // util.log('tagCloud ' + val);
        if (callback) callback(undefined, val);
        return val;
    }
    
    config.funcs.tagsForDocument = function(arg, callback) {
        var entry = akasha.getFileEntry(config, arg.documentPath);
        var taglist = entryTags(entry);
        
        var val = "";
        if (taglist) {
            var tagz = [];
            for (var i = 0; i < taglist.length; i++) {
                tagz.push({ tagName: taglist[i], tagUrl: tagPageUrl(config, taglist[i]) });
            }
                    
            var val = akasha.partialSync(config, "tagged-content-doctags.html.ejs", { tagz: tagz });
        }
        if (callback) callback(undefined, val);
        return val;
    }
    
    akasha.emitter.on('before-render-files', function(cb) {
        util.log('before-render-files received');
        module.exports.generateTagIndexes(akasha, config, function(err) {
            if (err) cb(err); else cb();
        });
    });
    akasha.emitter.on('done-render-files', function() {
        util.log('done-render-files received');
        // fs.rmdirSync(tempDir.path);
    });
}

var tagPageUrl = function(config, tagName) {
    return config.tags.pathIndexes + tag2encode4url(tagName) +'.html';
}

var tagParse = function(tags) {
    var taglist = [];
    var re = /\s*,\s*/;
    tags.split(re).forEach(function(tag) {
        taglist.push(tag.trim());
    });
    return taglist;
}

var entryTags = function(entry) {
    if (entry.frontmatter && entry.frontmatter.hasOwnProperty('tags')) {
        // parse tags
        // foreach tag:- tagCloudData[tag] .. if null, give it an array .push(entry)
        // util.log(entry.frontmatter.tags);
        var taglist = tagParse(entry.frontmatter.tags);
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
        
        var entryText = config.tags.header
            .replace("@title@", tagData.tagName)
            .replace("@tagName@", tagData.tagName);
        for (var j = 0; j < tagData.entries.length; j++) {
            var entry = tagData.entries[j];
            entryText += '<p><a href="@url@">@title@</a></p>'
                .replace("@url@", akasha.urlForFile(entry.path))
                .replace("@title@", entry.frontmatter.title);
        }
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
            if (a.tagnm < b.tagnm) return -1;
            else if (a.tagnm === b.tagnm) return 0;
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