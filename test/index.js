
const akasha   = require('akasharender');
const { assert } = require('chai');

const config = require('./config.js');

describe('build site', function() {

    it('should run setup', async function() {
        this.timeout(75000);
        await akasha.cacheSetup(config);
        await Promise.all([
            akasha.setupDocuments(config),
            akasha.setupAssets(config),
            akasha.setupLayouts(config),
            akasha.setupPartials(config)
        ])
        let filecache = await akasha.filecache;
        await Promise.all([
            filecache.documents.isReady(),
            filecache.assets.isReady(),
            filecache.layouts.isReady(),
            filecache.partials.isReady()
        ]);
    });

    it('should copy assets', async function() {
        this.timeout(75000);
        await config.copyAssets();
    });

    it('should build site', async function() {
        this.timeout(60000);
        let failed = false;
        let results = await akasha.render(config);
        for (let result of results) {
            if (result.error) {
                failed = true;
                console.error(result.error);
            }
        }
        assert.isFalse(failed);
    });

    it('should close the configuration', async function() {
        this.timeout(75000);
        await akasha.closeCaches();
    });
});

describe('check pages', function() {
    it('should have correct home page', async function() {

        let { html, $ } = await akasha.readRenderedFile(config, '/index.html');

        assert.exists(html, 'result exists');
        assert.isString(html, 'result isString');

        assert.include($('head title').html(), 'Akasha CMS tagged-content test');
        assert.include($('head meta[name="pagename"]').attr('content'), 
                'Akasha CMS tagged-content test');
        assert.include($('head meta[name="DC.title"]').attr('content'), 
                'Akasha CMS tagged-content test');
        assert.include($('head meta[name="og:title"]').attr('content'), 
                'Akasha CMS tagged-content test');
        assert.include($('head meta[name="og:url"]').attr('content'), 
                'https://akashacms-tagged-content.akashacms.com/index.html');
        assert.include($('head link[rel="canonical"]').attr('href'), 
                'https://akashacms-tagged-content.akashacms.com/index.html');
        assert.include($('head link[rel="sitemap"]').attr('href'), 'sitemap.xml');

        assert.equal($('head link[href="vendor/bootstrap/css/bootstrap.min.css"]').length, 1);
        assert.equal($('head link[href="style.css"]').length, 1);


        assert.include($('body header h1').html(), 'Akasha CMS tagged-content test');
        
        assert.equal($('body script[src="vendor/jquery/jquery.min.js"]').length, 1);
        assert.equal($('body script[src="vendor/popper.js/umd/popper.min.js"]').length, 1);
        assert.equal($('body script[src="vendor/bootstrap/js/bootstrap.min.js"]').length, 1);
    });

    it('should have correct settings on external links', async function() {

        let { html, $ } = await akasha.readRenderedFile(config, 
                'external-links.html');

        assert.exists(html, 'result exists');
        assert.isString(html, 'result isString');

        assert.equal($('a[href="https://google.com"]').length, 1);
    });

    it('should have correct fig-img', async function() {

        let { html, $ } = await akasha.readRenderedFile(config, 
                'figimg.html');

        assert.exists(html, 'result exists');
        assert.isString(html, 'result isString');

        assert.equal($('figure.fig-img-class').length, 1);
        assert.equal($('figure.fig-img-class img[src="Human-Skeleton.jpg"]').length, 1);
        assert.include($('figure.fig-img-class figcaption').html(),
            "Implemented with fig-img tag");
        
    });

});

describe('check tags', function() {
    it('should have correct tagged content - external-links.html', async function() {

        let { html, $ } = await akasha.readRenderedFile(config, 
                'external-links.html');

        assert.exists(html, 'result exists');
        assert.isString(html, 'result isString');

        assert.equal($('span.taglist').length, 1);
        assert.equal($('span.taglist a[href="tags/external.html"]').length, 1);
        assert.include($('span.taglist a[href="tags/external.html"]').html(),
                            "External");
        assert.equal($('span.taglist a[href="tags/links.html"]').length, 1);
        assert.include($('span.taglist a[href="tags/links.html"]').html(),
                            "Links");
    });

    it('should have correct tags page - tags/external.html', async function() {

        let { html, $ } = await akasha.readRenderedFile(config, 
            '/tags/external.html');

        assert.exists(html, 'result exists');
        assert.isString(html, 'result isString');

        assert.equal($('ul.list-group li.list-group-item').length, 1);
        assert.equal($('ul.list-group li.list-group-item a[href="../external-links.html"]').length, 1);
        assert.include($('ul.list-group li.list-group-item a[href="../external-links.html"]').html(),
            "Links to external websites");
    });

    it('should have correct tags page - tags/links.html', async function() {

        let { html, $ } = await akasha.readRenderedFile(config, 
            '/tags/links.html');

        assert.exists(html, 'result exists');
        assert.isString(html, 'result isString');

        assert.equal($('ul.list-group li.list-group-item').length, 1);
        assert.equal($('ul.list-group li.list-group-item a[href="../external-links.html"]').length, 1);
        assert.include($('ul.list-group li.list-group-item a[href="../external-links.html"]').html(),
            "Links to external websites");
    });

    it('should have correct tagged content - figimg.html', async function() {

        let { html, $ } = await akasha.readRenderedFile(config, 
                'figimg.html');

        assert.exists(html, 'result exists');
        assert.isString(html, 'result isString');

        assert.equal($('span.taglist').length, 1);
        assert.equal($('span.taglist a[href="tags/figimg.html"]').length, 1);
        assert.include($('span.taglist a[href="tags/figimg.html"]').html(),
                            "FigImg");
    });

    it('should have correct tags page - tags/figimg.html', async function() {

        let { html, $ } = await akasha.readRenderedFile(config, 
            '/tags/figimg.html');

        assert.exists(html, 'result exists');
        assert.isString(html, 'result isString');

        assert.equal($('ul.list-group li.list-group-item').length, 1);
        assert.equal($('ul.list-group li.list-group-item a[href="../figimg.html"]').length, 1);
        assert.include($('ul.list-group li.list-group-item a[href="../figimg.html"]').html(),
            "figure/img/caption");
    });



    it('should have correct tags feeds page', async function() {

        let { html, $ } = await akasha.readRenderedFile(config, 
            '/feeds-tags.html');

        assert.exists(html, 'result exists');
        assert.isString(html, 'result isString');

        assert.equal($('span.taglist').length, 1);
        assert.equal($('span.taglist a[href="tags/rssfeeds.html"]').length, 1);
        assert.include($('span.taglist a[href="tags/rssfeeds.html"]').html(),
                            "RSSFeeds");

        assert.equal($('#tags-feeds-list').length, 1);

        assert.equal($('#tags-feeds-list a[href="tags/external.xml"]').length, 1);
        assert.include($('#tags-feeds-list a[href="tags/external.xml"]').attr('rel'),
                            "alternate");
        assert.include($('#tags-feeds-list a[href="tags/external.xml"]').attr('type'),
                            "application/rss+xml");
        assert.include($('#tags-feeds-list a[href="tags/external.xml"]').html(),
                            "External");

        assert.equal($('#tags-feeds-list a[href="tags/figimg.xml"]').length, 1);
        assert.include($('#tags-feeds-list a[href="tags/figimg.xml"]').attr('rel'),
                            "alternate");
        assert.include($('#tags-feeds-list a[href="tags/figimg.xml"]').attr('type'),
                            "application/rss+xml");
        assert.include($('#tags-feeds-list a[href="tags/figimg.xml"]').html(),
                            "FigImg");

        assert.equal($('#tags-feeds-list a[href="tags/links.xml"]').length, 1);
        assert.include($('#tags-feeds-list a[href="tags/links.xml"]').attr('rel'),
                            "alternate");
        assert.include($('#tags-feeds-list a[href="tags/links.xml"]').attr('type'),
                            "application/rss+xml");
        assert.include($('#tags-feeds-list a[href="tags/links.xml"]').html(),
                            "Links");

        assert.equal($('#tags-feeds-list a[href="tags/rssfeeds.xml"]').length, 1);
        assert.include($('#tags-feeds-list a[href="tags/rssfeeds.xml"]').attr('rel'),
                            "alternate");
        assert.include($('#tags-feeds-list a[href="tags/rssfeeds.xml"]').attr('type'),
                            "application/rss+xml");
        assert.include($('#tags-feeds-list a[href="tags/rssfeeds.xml"]').html(),
                            "RSSFeeds");
    });

});
