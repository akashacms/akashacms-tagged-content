
module.exports = function(grunt) {
    grunt.registerTask('generateTagIndexes', function() {
        var done = this.async();
        grunt.config.requires('akasha');
        grunt.config.requires('config');
        var akasha = grunt.config('akasha');
        var config = grunt.config('config');
        akasha.plugin('akashacms-tagged-content').generateTagIndexes(akasha, config, function(err) {
            if (err) done(err);
            else done();
        });
    });
};
