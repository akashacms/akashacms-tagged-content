#!/usr/bin/env node

/**
 *
 * Copyright 2013-2025 David Herron
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

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { program } from 'commander';
import * as YAML from 'js-yaml';

import { generateTagIndexes } from './index.mjs';

const pluginName = "@akashacms/plugins-tagged-content";

// Derive the CLI version from this package's package.json rather than
// hard-coding it. Read relative to this module so it works from any CWD.
const { version } = JSON.parse(
    readFileSync(path.join(import.meta.dirname, 'package.json'), 'utf-8')
);

process.title = 'akashacms-tagged-content';
program.version(version);

/**
 * Import an AkashaCMS configuration file and run akasha.setup.
 *
 * The configuration pathname is not known at compile time, so it is
 * imported dynamically relative to the current working directory.
 *
 * @param {string} configFN Path to the config file (e.g. config.mjs)
 * @returns {Promise<{ config: any, akasha: any }>}
 */
async function setupConfig(configFN) {
    const config = (await import(
        path.join(process.cwd(), configFN)
    )).default;
    const akasha = config.akasha;
    await akasha.setup(config);
    return { config, akasha };
}

program
    .command('generate-indexes <configFN>')
    .description('Generate the tag index pages and per-tag RSS feeds into the output directory')
    .action(async (configFN) => {
        try {
            const { config, akasha } = await setupConfig(configFN);
            await generateTagIndexes(config);
            await akasha.closeCaches();
        } catch (e) {
            console.error(`generate-indexes command ERRORED ${e.stack ? e.stack : e}`);
            process.exit(1);
        }
    });

program
    .command('tag-url <configFN> <tagName>')
    .description('Show the URL the plugin generates for a given tag index page')
    .action(async (configFN, tagName) => {
        try {
            const { config, akasha } = await setupConfig(configFN);
            const plugin = config.plugin(pluginName);
            console.log(YAML.dump({
                tagName,
                tagURL: plugin.tagPageUrl(config, tagName)
            }, { indent: 4 }));
            await akasha.closeCaches();
        } catch (e) {
            console.error(`tag-url command ERRORED ${e.stack ? e.stack : e}`);
            process.exit(1);
        }
    });

program
    .command('obsidian-incompatible-tags <configFN>')
    .description('ADVISORY: list tags that are not compatible with Obsidian\'s tag format (no changes made)')
    .action(async (configFN) => {
        try {
            const { config, akasha } = await setupConfig(configFN);
            const plugin = config.plugin(pluginName);
            const incompatible = await plugin.obsidianIncompatibleTags(config);
            console.log(YAML.dump({
                obsidianIncompatibleTags: incompatible
            }, { indent: 4 }));
            await akasha.closeCaches();
        } catch (e) {
            console.error(`obsidian-incompatible-tags command ERRORED ${e.stack ? e.stack : e}`);
            process.exit(1);
        }
    });

program.parse(process.argv);
