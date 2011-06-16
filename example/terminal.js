#!/usr/bin/env node

// Make sure the irc lib is available
require.paths.unshift(__dirname + '/../lib');

var server = 'irc.gatewayy.net';
var channel = '#public';
var nick = 'nodebot';

if (process.argv[2]) {
    nick = process.argv[2];
}

if (process.argv[3]) {
    channel = process.argv[3];
}

if (process.argv[4]) {
    server = process.argv[4];
}
var irc = require('irc');
var bot = new irc.Client(server, nick, {
	port: 6697,
    secure: true,
    debug: false,
    channels: [channel],
});

bot.addListener('error', function(message) {
    console.error('ERROR: %s: %s', message.command, message.args.join(' '));
});

bot.addListener('message', function (from, to, message) {
    console.log('%s: %s', from, message);
});

bot.addListener('pm', function(nick, message) {
    console.log('Got private message from %s: %s', nick, message);
});

bot.addListener('part', function(channel, who, reason) {
    console.log('%s has left %s: %s', who, channel, reason);
});

bot.addListener('kick', function(channel, who, by, reason) {
    console.log('%s was kicked from %s by %s: %s', who, channel, by, reason);
});

process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on('data', function(chunk) {
    bot.say(channel, chunk);
});


