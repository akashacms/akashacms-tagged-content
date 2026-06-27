
import akasha from 'akasharender';
import path from 'node:path';
import util from 'node:util';
import { createRequire } from 'node:module';

import { BasePlugin } from '@akashacms/plugins-base';
import { TaggedContentPlugin } from '../index.mjs';

const config = new akasha.Configuration();

config.rootURL("https://akashacms-tagged-content.akashacms.com");

const __dirname = import.meta.dirname;
config.configDir = __dirname;

// Resolve the `dist` directory of a vendor package by its package.json,
// rather than hardcoding `node_modules/<pkg>/dist`. Under the development
// workspace these packages are hoisted to the workspace-root node_modules,
// so a test-relative path does not exist. Module resolution finds them
// wherever npm placed them.
const require = createRequire(import.meta.url);
const vendorDist = (pkg) =>
    path.join(path.dirname(require.resolve(`${pkg}/package.json`)), 'dist');

config
    .addAssetsDir('assets')
    .addAssetsDir({
        src: vendorDist('bootstrap'),
        dest: 'vendor/bootstrap'
    })
   .addAssetsDir({
        src: vendorDist('jquery'),
        dest: 'vendor/jquery'
    })
    .addAssetsDir({
        src: vendorDist('popper.js'),
        dest: 'vendor/popper.js'
    })
    .addLayoutsDir('layouts')
    .addDocumentsDir('documents')
    .addPartialsDir('partials');

config
    // ThemeBootstrapPlugin is intentionally NOT used here: this is the test
    // suite for @akashacms/plugins-tagged-content, so it must exercise this
    // plugin's own partials/layout/markup rather than theme-bootstrap's
    // overrides (e.g. theme-bootstrap ships a tagged-content-tagpagelist
    // partial that would replace this plugin's microformat output).
    .use(BasePlugin, {
        generateSitemapFlag: true
    })
    .use(TaggedContentPlugin, {
        sortBy: 'title',
        // @tagDescription@ can only appear once
        headerTemplate: "---\ntitle: |\n    @title@\nlayout: tagpage.html.ejs\n---\n<p><a href='./index.html'>Tag Index</a></p><p>Pages with tag @tagName@</p><p>@tagDescription@</p><p>What more can we say?",
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
export default config;

