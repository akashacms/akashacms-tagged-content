
'use strict';

const akasha  = require('akasharender');
const path    = require('path');
const util    = require('util');

const config = new akasha.Configuration();

config.rootURL("https://akashacms-tagged-content.akashacms.com");

config.configDir = __dirname;

config
    .addAssetsDir('assets')
    // For these three we would normally reference the 
    // packages in the local node_modules directory.  But,
    // they were installed in the parent node_modules directory.
    .addAssetsDir({
        src: '../node_modules/bootstrap/dist',
        dest: 'vendor/bootstrap'
    })
   .addAssetsDir({
        src: '../node_modules/jquery/dist',
        dest: 'vendor/jquery'
    })
    .addAssetsDir({
        src: '../node_modules/popper.js/dist',
        dest: 'vendor/popper.js'
    })
    .addLayoutsDir('layouts')
    .addDocumentsDir('documents')
    .addPartialsDir('partials');

config
    .use(require('@akashacms/theme-bootstrap'))
    .use(require('@akashacms/plugins-base'), {
        generateSitemapFlag: true
    })
    .use(require('../index.js' /* '@akashacms/plugins-tagged-content' */), {
        sortBy: 'title',
        // @tagDescription@ can only appear once
        headerTemplate: "---\ntitle: |\n    @title@\nlayout: tagpage.html.ejs\n---\n<p><a href='./index.html'>Tag Index</a></p><p>Pages with tag @tagName@</p><p>@tagDescription@</p>",
        indexTemplate: "---\ntitle: Tags for AkashaCMS Example site\nlayout: tagpage.html.ejs\n---\n",
        pathIndexes: '/tags/',
        tags: [
            {
                name: "External",
                description: "Testing external thingies"
            },
            {
                name: "Eenie",
                description: "EENIE"
            },
            {
                name: "FigImg",
                description: "Figure/Image test"
            }
        ]
    });

config
    .addFooterJavaScript({ href: "/vendor/jquery/jquery.min.js" })
    .addFooterJavaScript({ href: "/vendor/popper.js/umd/popper.min.js" })
    .addFooterJavaScript({ href: "/vendor/bootstrap/js/bootstrap.min.js" })
    .addStylesheet({ href: "/vendor/bootstrap/css/bootstrap.min.css" })
    .addStylesheet({       href: "/style.css" });

config.setMahabhutaConfig({
    recognizeSelfClosing: true,
    recognizeCDATA: true,
    decodeEntities: true
});

config.prepare();
module.exports = config;
