
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import akasha from 'akasharender';
import {
    isObsidianCompatibleTag,
    obsidianTagIncompatibilityReasons
} from '@akashacms/plugins-tagged-content';

import config from './config.mjs';

const pluginName = '@akashacms/plugins-tagged-content';
let plugin;

describe('tagged-content plugin API (0.10)', () => {

    before(async () => {
        await akasha.setup(config);
        plugin = config.plugin(pluginName);
        // Wait for the tag tables to be populated. The documents cache fills
        // TAGGLUE asynchronously after setup(); poll until the tag list is
        // stable so the API tests are deterministic.
        const dc = config.akasha.filecache.documentsCache;
        let prev = -1;
        for (let i = 0; i < 100; i++) {
            const tags = await dc.tags();
            if (tags.length > 0 && tags.length === prev) break;
            prev = tags.length;
            await new Promise(r => setTimeout(r, 50));
        }
    });

    after(async () => {
        await akasha.closeCaches();
    });

    describe('tagPageUrl / tagRSSUrl', () => {
        it('builds tag page and RSS URLs under pathIndexes', () => {
            assert.equal(plugin.tagPageUrl(config, 'External'),
                '/tags/external.html');
            assert.equal(plugin.tagRSSUrl(config, 'External'),
                '/tags/external.xml');
        });
        it('encodes spaces and special characters', () => {
            assert.equal(plugin.tagPageUrl(config, 'Foo Bar'),
                '/tags/foo-bar.html');
        });
    });

    describe('tagsDirectoryData', () => {
        it('returns one entry per tag with the expected shape', async () => {
            const data = await plugin.tagsDirectoryData(config);
            assert.ok(Array.isArray(data));
            assert.ok(data.length >= 4);

            const ext = data.find(d => d.tagName === 'External');
            assert.ok(ext, 'External entry exists');
            assert.equal(ext.tagUrl, '/tags/external.html');
            assert.equal(ext.rssUrl, '/tags/external.xml');
            assert.equal(typeof ext.description, 'string');
            assert.ok(ext.count >= 1);
        });
        it('is sorted by tag name', async () => {
            const data = await plugin.tagsDirectoryData(config);
            const names = data.map(d => d.tagName);
            const sorted = [...names].sort((a, b) =>
                a.toLowerCase() < b.toLowerCase() ? -1
                    : a.toLowerCase() > b.toLowerCase() ? 1 : 0);
            assert.deepEqual(names, sorted);
        });
    });

    describe('tagEntryList', () => {
        it('returns enriched entries for a tag', async () => {
            const entries = await plugin.tagEntryList(config, 'External');
            assert.ok(Array.isArray(entries));
            assert.ok(entries.length >= 1);
            const e = entries[0];
            assert.equal(typeof e.renderPath, 'string');
            assert.equal(typeof e.title, 'string');
            assert.ok(e.publishedISO, 'has an ISO published date');
            assert.ok(!Number.isNaN(Date.parse(e.publishedISO)));
        });
        it('honors the limit option', async () => {
            const all = await plugin.tagEntryList(config, 'External');
            const limited = await plugin.tagEntryList(config, 'External',
                { limit: 1 });
            assert.equal(limited.length, Math.min(1, all.length));
        });
    });

    describe('doOpenGraphTags', () => {
        it('emits one article:tag meta per tag (array)', async () => {
            const html = await plugin.doOpenGraphTags(config,
                { tags: ['External', 'Links'] });
            assert.ok(html.includes('property="article:tag" content="External"'));
            assert.ok(html.includes('property="article:tag" content="Links"'));
            assert.ok(!html.includes('og:type'));
        });
        it('parses a comma-separated tags string', async () => {
            const html = await plugin.doOpenGraphTags(config,
                { tags: 'Alpha, Beta , Gamma' });
            assert.ok(html.includes('content="Alpha"'));
            assert.ok(html.includes('content="Beta"'));
            assert.ok(html.includes('content="Gamma"'));
        });
        it('adds og:type=article when requested', async () => {
            const html = await plugin.doOpenGraphTags(config,
                { tags: ['External'] }, { ogType: true });
            assert.ok(html.includes('property="og:type" content="article"'));
        });
        it('emits nothing when there are no tags', async () => {
            const html = await plugin.doOpenGraphTags(config, {});
            assert.equal(html, '');
        });
    });

    describe('doTaggedContentItems', () => {
        it('renders a default title + teaser list', async () => {
            const html = await plugin.doTaggedContentItems(config,
                { tag: 'External' });
            assert.ok(html.includes('h-feed'));
            assert.ok(html.includes('h-entry'));
            assert.ok(html.includes('class="p-name u-url"'));
        });
        it('renders a title-only list with template=title', async () => {
            const html = await plugin.doTaggedContentItems(config,
                { tag: 'External', template: 'title' });
            assert.ok(html.includes('tagged-content-items-titles'));
        });
        it('throws when no tag is given', async () => {
            await assert.rejects(
                () => plugin.doTaggedContentItems(config, {}),
                /requires a "tag" attribute/);
        });
    });

    describe('obsidianIncompatibleTags', () => {
        it('reports no incompatible tags for the test site', async () => {
            // The test site uses only Obsidian-compatible tag names.
            const inc = await plugin.obsidianIncompatibleTags(config);
            assert.ok(Array.isArray(inc));
            assert.equal(inc.length, 0);
        });
    });
});

describe('obsidian tag compatibility helpers (0.10)', () => {
    it('accepts compatible tag names', () => {
        for (const t of ['External', 'nested/tag', 'tag_name', 'tag-name',
                         'café', '项目', 'y1984']) {
            assert.equal(isObsidianCompatibleTag(t), true, `${t} should be ok`);
            assert.equal(obsidianTagIncompatibilityReasons(t).length, 0);
        }
    });
    it('rejects incompatible tag names with reasons', () => {
        const cases = {
            '1984': /numbers-only/,
            'has space': /whitespace/,
            'a.b': /disallowed/,
            'a?b': /disallowed/,
            '': /empty/
        };
        for (const [tag, re] of Object.entries(cases)) {
            assert.equal(isObsidianCompatibleTag(tag), false, `${tag} should fail`);
            const reasons = obsidianTagIncompatibilityReasons(tag);
            assert.ok(reasons.length > 0);
            assert.ok(reasons.some(r => re.test(r)),
                `${tag} reason matches ${re}`);
        }
    });
});
