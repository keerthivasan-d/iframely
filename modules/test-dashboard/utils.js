var _ = require('underscore');
var FeedParser = require('feedparser');
var request = require('request');

var iframely = require("../../lib/iframely");

exports.getPluginUnusedMethods = function(pluginId, debugData) {

    var usedMethods = getAllUsedMethods(debugData);
    var pluginMethods = findAllPluginMethods(pluginId, debugData.plugins);

    return _.difference(pluginMethods, usedMethods);
};

exports.getErrors = function(debugData) {

    var errors = [];

    debugData.debug.forEach(function(level, levelIdx) {
        level.data.forEach(function(methodData) {
            if (methodData.error) {
                var methodId = methodData.method.pluginId + " - " + methodData.method.name;
                errors.push(methodId + ": " + methodData.error);
            }
        });
    });

    if (errors.length) {
        return errors;
    } else {
        return null;
    }
};

var MAX_FEED_URLS = 5;

exports.fetchFeedUrls = function(feedUrl, cb) {

    var urls = [];

    var cbed = false;
    var _cb = function(error) {
        if (cbed) {
            return;
        }
        cbed = true;
        cb(error, urls);
    };

    request(feedUrl)
        .pipe(new FeedParser({addmeta: false}))
        .on('error', function(error) {
            _cb(error);
        })
        .on('readable', function () {
            var stream = this, item;
            while (item = stream.read()) {

                if (urls.length < MAX_FEED_URLS) {

                    urls.push(item.origlink || item.link);

                    if (MAX_FEED_URLS == urls.length) {
                        _cb();
                    }
                }
            }
        })
        .on('end', function() {
            _cb();
        });
};

function getAllUsedMethods(debugData) {

    var result = [];

    // Collect all meta sources.
    for(var metaKey in debugData.meta._sources) {
        findUsedMethods({findByMeta: metaKey}, debugData, result);
    }

    // Collect all links sources
    debugData.links.forEach(function(link) {
        findUsedMethods({link: link}, debugData, result);
    });

    return result;
}

function findAllPluginMethods(pluginId, plugins, result) {

    result = result || [];

    var plugin = plugins[pluginId];

    plugin.module.mixins && plugin.module.mixins.forEach(function(mixin) {
        findAllPluginMethods(mixin, plugins, result);
    });

    iframely.PLUGIN_METHODS.forEach(function(method) {
        var methodId = pluginId + " - " + method;
        if (method in plugin.methods && result.indexOf(methodId) == -1) {
            result.push(methodId);
        }
    });

    return result;
}

function findUsedMethods(options, debugData, result) {

    // Find debug data for specific link.

    var defaultContext = debugData.debug[0] && debugData.debug[0].context;
    defaultContext.request = true;
    defaultContext.$selector = true;

    result = result || [];

    debugData.debug.forEach(function(level, levelIdx) {
        if (options.maxLevel <= levelIdx) {
            return;
        }
        level.data.forEach(function(methodData) {

            if (!methodData.data) {
                return;
            }

            var resultData = methodData.data;
            if (!(resultData instanceof Array)) {
                resultData = [resultData];
            }

            resultData.forEach(function(l) {

                var good = false;
                if (options.link) {
                    good = l.sourceId == options.link.sourceId;
                }

                if (options.findByMeta) {
                    var s = debugData.meta._sources[options.findByMeta];
                    good = s.pluginId == methodData.method.pluginId && s.method == methodData.method.name;
                }

                if (options.findByData) {
                    good = _.intersection(_.keys(l), options.findByData).length > 0;
                }

                if (good) {

                    var methodId = methodData.method.pluginId + " - " + methodData.method.name;

                    var exists = result.indexOf(methodId) > -1
                    if (exists) {
                        return
                    }

                    result.push(methodId);

                    var params = debugData.plugins[methodData.method.pluginId].methods[methodData.method.name];

                    // Find parent data source.

                    var findSourceForRequirements = _.difference(params, defaultContext);

                    if (findSourceForRequirements.length > 0) {
                        findUsedMethods({
                            maxLevel: levelIdx,
                            findByData: findSourceForRequirements
                        }, debugData, result);
                    }
                }
            });
        });
    });

    return result;
}