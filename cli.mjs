
const program   = require('commander');
const path      = require('path');
const tcplugin  = require('./index.js');

const pluginName = "@akashacms/plugins-tagged-content";

process.title = 'akashacms-tagged-content';
program.version('0.7.5');

program
    .command('docs <configFN> <tagName>')
    .description('List documents for a given tag')
    .action(async (configFN, tagName) => {
        try {
            const config = require(path.join(process.cwd(), configFN));
            const akasha = config.akasha;
            const plugin = config.plugin(pluginName)
            await akasha.cacheSetupComplete(config);
            let results = await plugin.documentsWithTag(tagName);
            for (let result of results) {
                console.log(result.renderPath);
            }
            await akasha.closeCaches();
        } catch (e) {
            console.error(`docs command ERRORED ${e.stack}`);
        }
    });


program
    .command('tags <configFN>')
    .description('List the tags used on this site')
    .action(async (configFN) => {
        try {
            const config = require(path.join(process.cwd(), configFN));
            const akasha = config.akasha;
            const plugin = config.plugin(pluginName)
            await akasha.cacheSetupComplete(config);
            // data.init();
            let results = await plugin.allTags();
            for (let result of results) {
                console.log(result);
            }
            await akasha.closeCaches();
        } catch (e) {
            console.error(`tags command ERRORED ${e.stack}`);
        }
    });



program.parse(process.argv);
