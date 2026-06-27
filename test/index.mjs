
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

import akasha from 'akasharender';

import config from './config.mjs';

describe('build site', () => {

    it('should run setup', async () => {
        await akasha.setup(config);
    }, { timeout: 75000 });

    it('should copy assets', async () => {
        await config.copyAssets();
    }, { timeout: 75000 });

    it('should build site', async () => {
        let failed = false;
        let results = await akasha.render(config);
        for (let result of results) {
            if (result.error) {
                failed = true;
                console.error(result.error);
            }
        }
        assert.equal(failed, false);
    }, { timeout: 60000 });

});

describe('check pages', () => {
    it('should have correct home page', async () => {

        let { html, $ } = await akasha.readRenderedFile(config, '/index.html');

        assert.ok(html, 'result exists');
        assert.equal(typeof html, 'string', 'result isString');

        assert.ok($('head title').html().includes('Akasha CMS tagged-content test'));
        assert.ok($('head meta[name="pagename"]').attr('content')
                .includes('Akasha CMS tagged-content test'));
        assert.ok($('head meta[name="DC.title"]').attr('content')
                .includes('Akasha CMS tagged-content test'));
        assert.ok($('head meta[name="og:title"]').attr('content')
                .includes('Akasha CMS tagged-content test'));
        assert.ok($('head meta[name="og:url"]').attr('content')
                .includes('https://akashacms-tagged-content.akashacms.com/index.html'));
        assert.ok($('head link[rel="canonical"]').attr('href')
                .includes('https://akashacms-tagged-content.akashacms.com/index.html'));
        assert.ok($('head link[rel="sitemap"]').attr('href').includes('sitemap.xml'));

        assert.equal($('head link[href="vendor/bootstrap/css/bootstrap.min.css"]').length, 1);
        assert.equal($('head link[href="style.css"]').length, 1);


        assert.ok($('body header h1').html().includes('Akasha CMS tagged-content test'));

        assert.equal($('body script[src="vendor/jquery/jquery.min.js"]').length, 1);
        assert.equal($('body script[src="vendor/popper.js/umd/popper.min.js"]').length, 1);
        assert.equal($('body script[src="vendor/bootstrap/js/bootstrap.min.js"]').length, 1);
    });

    it('should have correct settings on external links', async () => {

        let { html, $ } = await akasha.readRenderedFile(config,
                'external-links.html');

        assert.ok(html, 'result exists');
        assert.equal(typeof html, 'string', 'result isString');

        assert.equal($('a[href="https://google.com"]').length, 1);
    });

    it('should have correct fig-img', async () => {

        let { html, $ } = await akasha.readRenderedFile(config,
                'figimg.html');

        assert.ok(html, 'result exists');
        assert.equal(typeof html, 'string', 'result isString');

        assert.equal($('figure.fig-img-class').length, 1);
        assert.equal($('figure.fig-img-class img[src="Human-Skeleton.jpg"]').length, 1);
        assert.ok($('figure.fig-img-class figcaption').html()
            .includes("Implemented with fig-img tag"));

    });

});

describe('check tags', () => {
    it('should have correct tagged content - external-links.html', async () => {

        let { html, $ } = await akasha.readRenderedFile(config,
                'external-links.html');

        assert.ok(html, 'result exists');
        assert.equal(typeof html, 'string', 'result isString');

        assert.equal($('span.taglist').length, 1);
        assert.equal($('span.taglist a[href="tags/external.html"]').length, 1);
        assert.ok($('span.taglist a[href="tags/external.html"]').html()
                            .includes("External"));
        assert.equal($('span.taglist a[href="tags/links.html"]').length, 1);
        assert.ok($('span.taglist a[href="tags/links.html"]').html()
                            .includes("Links"));
    });

    it('should have correct tags page - tags/external.html', async () => {

        let { html, $ } = await akasha.readRenderedFile(config,
            '/tags/external.html');

        // console.log(html);

        assert.ok(html, 'result exists');
        assert.equal(typeof html, 'string', 'result isString');

        // The plugin's own tag list partial: an h-feed of h-entry items.
        assert.equal($('div.h-feed.tagged-content-tag-list').length, 1);
        const entry = $('div.h-feed article.h-entry a.p-name.u-url[href="../external-links.html"]');
        assert.equal(entry.length, 1);
        assert.ok(entry.html().includes("Links to external websites"));
        // Each entry carries a dt-published microformat.
        assert.ok($('div.h-feed article.h-entry time.dt-published').length >= 1);
        assert.ok($('div.h-feed article.h-entry time.dt-published').attr('datetime'));
    });

    it('should have correct tags page - tags/links.html', async () => {

        let { html, $ } = await akasha.readRenderedFile(config,
            '/tags/links.html');

        assert.ok(html, 'result exists');
        assert.equal(typeof html, 'string', 'result isString');

        assert.equal($('div.h-feed.tagged-content-tag-list').length, 1);
        const entry = $('div.h-feed article.h-entry a.p-name.u-url[href="../external-links.html"]');
        assert.equal(entry.length, 1);
        assert.ok(entry.html().includes("Links to external websites"));
    });

    it('should have correct tagged content - figimg.html', async () => {

        let { html, $ } = await akasha.readRenderedFile(config,
                'figimg.html');

        assert.ok(html, 'result exists');
        assert.equal(typeof html, 'string', 'result isString');

        assert.equal($('span.taglist').length, 1);
        assert.equal($('span.taglist a[href="tags/figimg.html"]').length, 1);
        assert.ok($('span.taglist a[href="tags/figimg.html"]').html()
                            .includes("FigImg"));
    });

    it('should have correct tags page - tags/figimg.html', async () => {

        let { html, $ } = await akasha.readRenderedFile(config,
            '/tags/figimg.html');

        assert.ok(html, 'result exists');
        assert.equal(typeof html, 'string', 'result isString');

        assert.equal($('div.h-feed.tagged-content-tag-list').length, 1);
        const entry = $('div.h-feed article.h-entry a.p-name.u-url[href="../figimg.html"]');
        assert.equal(entry.length, 1);
        assert.ok(entry.html().includes("figure/img/caption"));
    });



    it('should have correct tags feeds page', async () => {

        let { html, $ } = await akasha.readRenderedFile(config,
            '/feeds-tags.html');

        assert.ok(html, 'result exists');
        assert.equal(typeof html, 'string', 'result isString');

        assert.equal($('span.taglist').length, 1);
        assert.equal($('span.taglist a[href="tags/rssfeeds.html"]').length, 1);
        assert.ok($('span.taglist a[href="tags/rssfeeds.html"]').html()
                            .includes("RSSFeeds"));

        assert.equal($('#tags-feeds-list').length, 1);

        assert.equal($('#tags-feeds-list a[href="tags/external.xml"]').length, 1);
        assert.ok($('#tags-feeds-list a[href="tags/external.xml"]').attr('rel')
                            .includes("alternate"));
        assert.ok($('#tags-feeds-list a[href="tags/external.xml"]').attr('type')
                            .includes("application/rss+xml"));
        assert.ok($('#tags-feeds-list a[href="tags/external.xml"]').html()
                            .includes("External"));

        assert.equal($('#tags-feeds-list a[href="tags/figimg.xml"]').length, 1);
        assert.ok($('#tags-feeds-list a[href="tags/figimg.xml"]').attr('rel')
                            .includes("alternate"));
        assert.ok($('#tags-feeds-list a[href="tags/figimg.xml"]').attr('type')
                            .includes("application/rss+xml"));
        assert.ok($('#tags-feeds-list a[href="tags/figimg.xml"]').html()
                            .includes("FigImg"));

        assert.equal($('#tags-feeds-list a[href="tags/links.xml"]').length, 1);
        assert.ok($('#tags-feeds-list a[href="tags/links.xml"]').attr('rel')
                            .includes("alternate"));
        assert.ok($('#tags-feeds-list a[href="tags/links.xml"]').attr('type')
                            .includes("application/rss+xml"));
        assert.ok($('#tags-feeds-list a[href="tags/links.xml"]').html()
                            .includes("Links"));

        assert.equal($('#tags-feeds-list a[href="tags/rssfeeds.xml"]').length, 1);
        assert.ok($('#tags-feeds-list a[href="tags/rssfeeds.xml"]').attr('rel')
                            .includes("alternate"));
        assert.ok($('#tags-feeds-list a[href="tags/rssfeeds.xml"]').attr('type')
                            .includes("application/rss+xml"));
        assert.ok($('#tags-feeds-list a[href="tags/rssfeeds.xml"]').html()
                            .includes("RSSFeeds"));
    });

});

describe('tags directory index (0.10)', () => {
    it('should generate tags/index.html listing every tag', async () => {

        let { html, $ } = await akasha.readRenderedFile(config,
            '/tags/index.html');

        assert.ok(html, 'result exists');
        assert.equal(typeof html, 'string', 'result isString');

        assert.equal($('ul.tagged-content-tag-directory').length, 1);

        // One directory item per tag used in the test site.
        const items = $('ul.tagged-content-tag-directory li.tagged-content-tag-directory-item');
        assert.ok(items.length >= 4, 'has at least 4 tag directory items');

        // Each known tag is linked to its tag page.
        for (const [tag, href] of [
            ['External', 'external.html'],
            ['FigImg', 'figimg.html'],
            ['Links', 'links.html'],
            ['RSSFeeds', 'rssfeeds.html']
        ]) {
            const a = $(`ul.tagged-content-tag-directory a.tag-link[href="${href}"]`);
            assert.equal(a.length, 1, `tag link for ${tag} exists`);
            assert.ok(a.html().includes(tag), `tag link text is ${tag}`);
        }

        // Document counts and RSS links are present.
        assert.ok($('ul.tagged-content-tag-directory span.tag-count').length >= 4);
        const rss = $('ul.tagged-content-tag-directory a.tag-rss[href="external.xml"]');
        assert.equal(rss.length, 1);
        assert.ok(rss.attr('rel').includes('alternate'));
        assert.ok(rss.attr('type').includes('application/rss+xml'));
    });
});

describe('document tag list microformats + popup (0.10)', () => {
    it('should mark tags with p-category and rel=tag', async () => {

        let { html, $ } = await akasha.readRenderedFile(config,
            'external-links.html');

        assert.ok(html, 'result exists');

        const ext = $('span.taglist a.p-category[href="tags/external.html"]');
        assert.equal(ext.length, 1);
        assert.equal(ext.attr('rel'), 'tag');
        assert.ok(ext.html().includes('External'));

        const links = $('span.taglist a.p-category[href="tags/links.html"]');
        assert.equal(links.length, 1);
        assert.equal(links.attr('rel'), 'tag');
    });

    it('should pre-render a hover popup with documents for each tag', async () => {

        let { html, $ } = await akasha.readRenderedFile(config,
            'external-links.html');

        // Each tag is wrapped and has a popup.
        assert.ok($('span.tagged-content-tag').length >= 2);
        assert.ok($('span.tagged-content-tag-popup').length >= 2);

        // The popup is static HTML produced at build time and lists the
        // tagged documents.
        const popups = $('span.tagged-content-tag-popup');
        let foundEntry = false;
        popups.each((i, el) => {
            if ($(el).find('ul.tagged-content-tag-popup-list li a').length > 0) {
                foundEntry = true;
            }
        });
        assert.ok(foundEntry, 'at least one popup lists a document link');

        // The External popup references the external-links document.
        assert.ok(
            $('span.tagged-content-tag-popup a[href="external-links.html"]').length >= 1
        );
    });
});

describe('per-tag RSS feeds (0.10)', () => {
    it('should write an RSS feed with a correct channel link and items', async () => {
        const xml = await fsp.readFile(
            path.join(config.renderDestination, 'tags', 'external.xml'),
            'utf-8');

        // Channel link is an absolute URL with the proper path separator
        // (regression test for the missing-slash bug).
        assert.ok(xml.includes(
            '<link>https://akashacms-tagged-content.akashacms.com/tags/external.xml</link>'
        ), 'channel link is correctly formed');
        assert.ok(!xml.includes('.comexternal.xml'),
            'channel link does not concatenate host and filename');

        // The item for the tagged document has a title and an absolute link.
        assert.ok(xml.includes('Links to external websites'),
            'item title is present');
        assert.ok(xml.includes(
            'https://akashacms-tagged-content.akashacms.com/external-links.html'
        ), 'item link is absolute');
    });
});

describe('close', () => {
    it('should close the configuration', async () => {
        await akasha.closeCaches();
    }, { timeout: 75000 });
});
