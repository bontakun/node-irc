#!/usr/bin/env node

// Make sure the irc lib is available
require.paths.unshift(__dirname + '/../lib');

var irc = require('irc');
var assert = require('assert');
var util = require('util');

////////
// Constants/Defaults
////////

const defaultServer = 'irc.freenode.net';
const defaultChannel = '#botwars';
const defaultNick = 'nodeTestBot';

////////
// Helpers
////////

function getDefaultServerOptions() {
  return {
      port: 6665, secure: false, debug: true,
      retryCount: 0, channels: []};
}

////////
// Validation code tests
////////

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

////////
// Insecure connection tests
////////

exports.testIrcFastConnectionDisconnect = function() {
  var bot = new irc.Client(defaultServer, defaultNick, getDefaultServerOptions());
  bot.disconnect();
  
  //these test internal implementation details I do not expect to change.
  setTimeout(function() {
  	assert.ok(!bot.conn.connected);
  	assert.equal(bot.conn.readyState, "closed", "gave it 5 seconds to close the connection and tidy up, it appears to have taken longer, investigate");
  }, 5000);
}

exports.testIrcChannelJoin = function() {
  var connectOptions = getDefaultServerOptions();
  connectOptions.channels.push(defaultChannel);
  
  var channelJoined = false;

  var bot = new irc.Client(defaultServer, defaultNick, connectOptions);
  bot.addListener('join', function(channel, who) {
    channelJoined = true;
    bot.disconnect();
  });
  
  setTimeout(function() {assert.ok(channelJoined, "gave it 15 seconds to connect and join the channel, looks like that failed for some reason, double check the logs.");}, 15000);
}

////////
// Secure connection tests
////////

exports.testIrcFastConnectionDisconnectSecure = function() {
  var connectOptions = getDefaultServerOptions();
  connectOptions.secure = true;
  connectOptions.port = 6697;

  var bot = new irc.Client(defaultServer, defaultNick, connectOptions);
  bot.disconnect();
  
  //these test internal implementation details I do not expect to change.
  setTimeout(function() {
  	assert.ok(!bot.conn.connected);
  	assert.equal(bot.conn.readyState, "closed", "gave it 5 seconds to close the connection and tidy up, it appears to have taken longer, investigate");
  }, 5000);
}

exports.testIrcChannelJoinSecure = function() {
  var connectOptions = getDefaultServerOptions();
  connectOptions.channels.push(defaultChannel);
  
  var channelJoined = false;

  var bot = new irc.Client(defaultServer, defaultNick, connectOptions);
  bot.addListener('join', function(channel, who) {
    channelJoined = true;
    bot.disconnect();
  });
  
  setTimeout(function() {assert.ok(channelJoined, "gave it 15 seconds to connect and join the channel, looks like that failed for some reason, double check the logs.");}, 15000);
}

////////
// Functional tests
////////


/* This test is ambitious enough that it has earned a comment, it tests a secure 
 * and insecure bot talking to each other. Joining a channel and listening 
 * to what each other say.
 */

exports.testIrcTalkingInChannel = function() {
	var insecureBotIn = false;
	var secureBotIn = false;
	
	var haveConversation = function () {
		assert.ok(insecureBot.conn.connected);
		assert.ok(secureBot.conn.connected);
		
		//setup listeners to check incoming messages
		insecureBot.addListener('message', function (from, to, message) {
			if (from.match(/nodeTestBot[0-9]*/))
    		assert.equal(message, "hello insecureBot");
    		insecureBot.disconnect();
		});
		secureBot.addListener('message', function (from, to, message) {
			if (from.match(/nodeTestBot[0-9]*/))
    		assert.equal(message, "hello secureBot")
    		secureBot.disconnect();
		});
		
		insecureBot.say(defaultChannel, "hello secureBot");
		secureBot.say(defaultChannel, "hello insecureBot");
	}

  var connectOptions = getDefaultServerOptions();
  connectOptions.channels.push(defaultChannel);

  var insecureBot = new irc.Client(defaultServer, defaultNick, connectOptions);
  insecureBot.addListener('join', function(channel, who) {
    insecureBotIn = true;
    if (insecureBotIn && secureBotIn)
    	haveConversation();
  });

	connectOptions = getDefaultServerOptions();
  connectOptions.channels.push(defaultChannel);
	connectOptions.secure = true;
  connectOptions.port = 6697;

  var secureBot = new irc.Client(defaultServer, defaultNick, connectOptions);
  secureBot.addListener('join', function(channel, who) {
    secureBotIn = true;
    if (insecureBotIn && secureBotIn)
    	haveConversation();
  });
  
}
