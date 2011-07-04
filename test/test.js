#!/usr/bin/env node

// Make sure the irc lib is available
require.paths.unshift(__dirname + '/../lib');

var irc = require('irc');
var assert = require('assert');

var defaultServer = 'irc.freenode.net';
var defaultChannel = '#botwars';
var defaultNick = 'nodeTestBot';

function getDefaultServerOptions() {
  return {
      port: 6665, secure: false, debug: true,
      retryCount: 0, channels: []};
}

exports.testIrcEmptyServer = function() {
  assert.throws(function() {
      var bot = new irc.Client(null, defaultNick, getDefaultServerOptions());
    },
    /server is null or empty\, this is invalid/);
}

exports.testIrcEmptyNick = function() {
  assert.throws(function() {
      var bot = new irc.Client(defaultServer, null, getDefaultServerOptions());
    },
    /nick is null or empty\, this is invalid/);
}

exports.testIrcNickWithSpace = function() {
  assert.throws(function() {
      var bot = new irc.Client(defaultServer, "foo bar", getDefaultServerOptions());
    },
    /username contains a space\, this is invalid/);
}

exports.testIrcFastConnectionDisconnect = function() {
  var bot = new irc.Client(defaultServer, defaultNick, getDefaultServerOptions());
  bot.disconnect();
}

exports.testIrcChannelJoin = function() {
  var connectOptions = getDefaultServerOptions();
  connectOptions.channels.push(defaultChannel);
  
  var channelJoined = false;

  var bot = new irc.Client(defaultServer, defaultNick, connectOptions);
  bot.addListener('join', function(channel, who) {
    console.log('%s has joined %s', who, channel);
    channelJoined = true;
    bot.disconnect();
  });
  setTimeout(function() {assert.ok(channelJoined, "gave it 15 seconds to connect and join the channel, looks like that failed for some reason, double check the logs.");}, 15000);
}

exports.testIrcFastConnectionDisconnectSecure = function() {
  var connectOptions = getDefaultServerOptions();
  connectOptions.secure = true;
  connectOptions.port = 6697;

  var bot = new irc.Client(defaultServer, defaultNick, connectOptions);
  bot.disconnect();
}