#!/usr/bin/env node

// Make sure the irc lib is available
require.paths.unshift(__dirname + '/../lib');

var irc = require('irc');
var assert = require('assert');
var util = require('util') 

var server = 'irc.gatewayy.net';
var channel = '#botwars';
var nick = 'nodebot';

module.exports = {
    'test irc#testEmptyServer': function(){
        assert.throws(function() {
        	var bot = new irc.Client(null, nick, {
						port: 6697,
					  secure: true,
					  debug: true,
					  channels: [channel]
					});
        },
        /server is null or empty\, this is invalid/);
    },
    
    'test irc#testEmptyNick': function(){
        assert.throws(function() {
        	var bot = new irc.Client(server, null, {
						port: 6697,
					  secure: true,
					  debug: true,
					  channels: [channel]
					});
        },
        /nick is null or empty\, this is invalid/);
    },
    
    'test irc#testNickWithSpace': function(){
        assert.throws(function() {
        	var bot = new irc.Client(server, "foo bar", {
						port: 6697,
					  secure: true,
					  debug: true,
					  channels: [channel]
					});
        },
        /username contains a space\, this is invali/);
    }
};