/*
    irc.js - Node JS IRC client library

    (C) Copyright Martyn Smith 2010

    This library is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This library is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this library.  If not, see <http://www.gnu.org/licenses/>.
*/
exports.Client = Client;

var net  = require('net');
var tls  = require('tls');
var util = require('util');

//load codes from seperate file, seperate makes maintence easier
const messageCodes = require('./irc-message-codes');

function Client(server, nick, opt) {
    var self = this;
    self.opt = {
        server: server,
        nick: nick,
        password: null,
        userName: 'nodebot',
        realName: 'nodeJS IRC client',
        port: 6667,
        debug: false,
        showErrors: false,
        autoRejoin: true,
        autoConnect: true,
        channels: [],
        retryCount: null,
        retryDelay: 2000,
        secure: false,
    };

    if (typeof arguments[2] == 'object') {
        var keys = Object.keys(self.opt);
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (arguments[2][k] !== undefined)
                self.opt[k] = arguments[2][k];
        }
    }

    if (!self.opt.server || self.opt.server.trim().length == 0)
        self.emit('error', "server is null or empty, this is invalid");
    
    if (!self.opt.nick || self.opt.nick.trim().length == 0)
        self.emit('error', "nick is null or empty, this is invalid");
    
    // fail if username has a space in it
    if (self.opt.nick.match(/ +/g))
        self.emit('error', "username contains a space, this is invalid");
    
    if (self.opt.autoConnect)
        self.connect();

    self.addListener("raw", function (message) { // {{{
        switch (message.command) {
            case "rpl_connectionSuccess":
                // Set nick to whatever the server decided it really is
                // (normally this is because you chose something too long and
                // the server has shortened it
                self.nick = message.args[0];
                self.emit('registered');
                break;
            case "rpl_connectionSuccessWithVersion":
            case "rpl_connectionSuccessWithDateTime":
            case "rpl_connectionSuccessWithVersionAndFeatures":
            case "rpl_map":
            case "rpl_lUserClient":
            case "rpl_lUserOp":
            case "rpl_lUserChannels":
            case "rpl_lUserMe":
                // random welcome messages, dumping for now
                break;
            case "rpl_localUsers":
            case "rpl_globalUsers":
                //user count messages, not relevant so we'll just dump them for now.
                break;
            case "err_nickNameInUse":
                if (typeof(self.opt.nickMod) == 'undefined')
                    self.opt.nickMod = 0;
                self.opt.nickMod++;
                self.send("NICK", self.opt.nick + self.opt.nickMod);
                self.nick = self.opt.nick + self.opt.nickMod;
                break;
            case "PING":
                self.send("PONG", message.args[0]);
                break;
            case "NOTICE":
                var from = message.nick;
                var to   = message.args[0];
                if (!to)
                    to   = null;
                var text = message.args[1];
                self.emit('notice', from, to, text);

                if (self.opt.debug && to == self.nick)
                    util.log('GOT NOTICE from ' + (from?'"'+from+'"':'the server') + ': "' + text + '"');
                break;
                
            case "MODE":
                if (self.opt.debug)
                    util.log("MODE:" + message.args[0] + " sets mode: " + message.args[1]);
                    
                // properly handle mode changes for users
                if (message.args.length >= 3) {
                    var channel = self.chans[message.args[0]],
                        nicklist_offset = 2,
                        mode = message.args[1].split(''),
                        adding = mode.shift() === "+";
                    for (var i = 0; i < mode.length; i++) {
                        if (mode[i] == 'o') {
                            if (adding)
                                channel.users[message.args[nicklist_offset+i]] = '@';
                            else
                                channel.users[message.args[nicklist_offset+i]] = '';
                        } else if (mode[i] == 'v') {
                            if (adding)
                                channel.users[message.args[nicklist_offset+i]] = '+';
                            else
                                channel.users[message.args[nicklist_offset+i]] = '';
                        }
                    }
                }
                break;
            case "NICK":
                if (self.opt.debug)
                    util.log("NICK: " + message.nick + " changes nick to " + message.args[0]);
                var channels = [];

                // TODO better way of finding what channels a user is in?
                for (var channame in self.chans) {
                    var channel = self.chans[channame];
                    if ('string' == typeof channel.users[message.nick]) {
                        channel.users[message.args[0]] = channel.users[message.nick];
                        delete channel.users[message.nick];
                        channels.push(channame);
                    }
                }

                // old nick, new nick, channels
                self.emit('nick', message.nick, message.args[0], channels);
                break;
                
            case "rpl_motdStart":
                self.motd = message.args[1] + "\n";
                break;
            case "rpl_motd":
                self.motd += message.args[1] + "\n";
                break;
            case "rpl_endOfMotd":
            case "err_nomotd":
                self.motd += message.args[1] + "\n";
                self.emit('motd', self.motd);
                break;
                
            case "rpl_namReply":
                var channel = self.chans[message.args[2]];
                var users = message.args[3].split(/ +/);    
                users.forEach(function (user) {
                    var match = user.match(/^([@+%~\&])?(.*)$/);
                    if (!match[1])
                        match[1] = "";
                    channel.users[match[2]] = match[1];
                });
                break;
            case "rpl_endOfNames":
                var channel = self.chans[message.args[1]];
                self.emit('names', message.args[1], channel.users);
                self.send('MODE', message.args[1]);
                break;

            case "rpl_topic":
                var channel = self.chans[message.args[1]];
                if (channel)
                    channel.topic = message.args[2];
                break;
            case "rpl_topicDetails":
                // TODO emit?
                var channel = self.chans[message.args[1]];
                if (channel) {
                    channel.topicBy = message.args[2];
                    // channel, topic, nick
                    self.emit('topic', message.args[1], channel.topic, channel.topicBy);
                }
                break;
            case "TOPIC":
                // channel, topic, nick
                self.emit('topic', message.args[0], message.args[1], nick);

                var channel = self.chans[message.args[0]];
                if (channel) {
                    channel.topic = message.args[1];
                    channel.topicBy = message.nick;
                }
                break;

            case "rpl_channelModeIs":
                var channel = self.chans[message.args[1]];
                if (channel)
                    channel.mode = message.args[2];
                break;
            case "rpl_channelCreateTime":
                var channel = self.chans[message.args[1]];
                if (channel)
                    channel.created = message.args[2];
                break;
            case "JOIN":
                // channel, who
                self.emit('join', message.args[0], message.nick);
                self.emit('join' + message.args[0], message.nick);
                if (self.nick == message.nick) {
                    self.chans[message.args[0]] = {
                        users: {},
                    };
                } else {
                    var channel = self.chans[message.args[0]];
                    channel.users[message.nick] = '';
                }
                break;
            case "PART":
                // channel, who, reason
                self.emit('part', message.args[0], message.nick, message.args[1]);
                self.emit('part' + message.args[0], message.nick, message.args[1]);
                if (self.nick == message.nick) {
                    delete self.chans[message.args[0]];
                } else {
                    var channel = self.chans[message.args[0]];
                    delete channel.users[message.nick];
                }
                break;
            case "KICK":
                // channel, who, by, reason
                self.emit('kick', message.args[0], message.args[1], message.nick, message.args[2]);
                self.emit('kick' + message.args[0], message.args[1], message.nick, message.args[2]);

                if (self.nick == message.args[1]) {
                    delete self.chans[message.args[0]];
                } else {
                    var channel = self.chans[message.args[0]];
                    delete channel.users[message.args[1]];
                }
                break;
            case "KILL":
                var nick = message.args[0];
                for (var channel in self.chans)
                    delete self.chans[channel].users[nick];
                break;
            case "PRIVMSG":
                var from = message.nick;
                var to   = message.args[0];
                var text = message.args[1];
                
                if (to.match(/^[&#]/)) 
                    self.emit('message', from, to, text);
                else if (to == self.nick) 
                    self.emit('pm', from, text);
                    
                if (self.opt.debug && to == self.nick)
                    util.log('GOT MESSAGE from ' + from + ': ' + text);
                break;
            case "INVITE":
                var from = message.nick;
                var to   = message.args[0];
                var channel = message.args[1];
                self.emit('invite', channel, from);
                break;
            case "QUIT":
                if (self.opt.debug)
                    util.log("QUIT: " + message.prefix + " " + message.args.join(" "));
                if (self.nick == message.nick)
                    break; // TODO handle?
                // handle other people quitting
                var channels = [];

                // TODO better way of finding what channels a user is in?
                for (var channame in self.chans) {
                    var channel = self.chans[channame];
                    if ('string' == typeof channel.users[message.nick]) {
                        delete channel.users[message.nick];
                        channels.push(channame);
                    }
                }

                // who, reason, channels
                self.emit('quit', message.nick, message.args[0], channels);
                break;
            
            default:
                if (message.commandType == 'error') {
                    if (self.opt.showErrors)
                        util.log("\033[01;31mERROR: " + util.inspect(message) + "\033[0m");
                    self.emit('error', message);
                } else {
                    if (self.opt.debug)
                        util.log("\033[01;31mUnhandled message: " + util.inspect(message) + "\033[0m");
                }
        }
    }); // }}}

    self.addListener('kick', function(channel, who, by, reason) {
        if ( self.opt.autoRejoin )
            self.send('JOIN', channel);
    });
    self.addListener('motd', function (motd) {
        self.opt.channels.forEach(function(channel) {
            self.send('JOIN', channel);
        });
    });

    process.EventEmitter.call(this);
}

util.inherits(Client, process.EventEmitter);

Client.prototype.conn = null;
Client.prototype.chans = {};

Client.prototype.connect = function (retryCount) { // {{{
    retryCount = retryCount || 0;
    var self = this;
    self.chans = {};
	// try to connect to the server
    if (self.opt.secure) {
        var creds = self.opt.secure;
		if (typeof self.opt.secure !== 'object')
			creds = {};
			
        self.conn = tls.connect(self.opt.port, self.opt.server, creds, function() {
            self.conn.connected = true;
            if (!self.conn.authorized) {
                //log the certificate error and move on.
                util.log(self.conn.authorizationError);
            }
            self.conn.setEncoding('utf-8');
            
            if (self.opt.password !==  null) {
                self.send( "PASS", self.opt.password );
            }
            util.log('Sending irc NICK/USER');
            self.send("NICK", self.opt.nick);
            self.nick = self.opt.nick;
            self.send("USER", self.opt.userName, 8, "*", self.opt.realName);
            self.emit("connect");
		});
	} else {
        self.conn = net.createConnection(self.opt.port, self.opt.server);
	}
    self.conn.requestedDisconnect = false;
    self.conn.setTimeout(0);
    self.conn.setEncoding('utf8');
    self.conn.addListener("connect", function () {
        if (self.opt.password !==  null)
            self.send( "PASS", self.opt.password );
        self.send("NICK", self.opt.nick);
        self.nick = self.opt.nick;
        self.send("USER", self.opt.userName, 8, "*", self.opt.realName);
        self.emit("connect");
    });
    var buffer = '';
    self.conn.addListener("data", function (chunk) {
        buffer += chunk;
        var lines = buffer.split("\r\n");
        buffer = lines.pop();
        lines.forEach(function (line) {
            var message = parseMessage(line);
            try {
                self.emit('raw', message);
            } catch (err) {
                if (!self.conn.requestedDisconnect)
                    throw err;
            }
        });
    });
    self.conn.addListener("end", function() {
        if (self.opt.debug)
            util.log('Connection got "end" event');
    });
    self.conn.addListener("close", function() {
        if (self.opt.debug)
            util.log('Connection got "close" event');
        if (self.conn.requestedDisconnect)
            return;
        if (self.opt.debug)
            util.log('Disconnected: reconnecting');
        if (self.opt.retryCount !== null && retryCount >= self.opt.retryCount) {
            if (self.opt.debug)
                util.log('Maximum retry count (' + self.opt.retryCount + ') reached. Aborting');
            self.emit('abort', self.opt.retryCount);
            return;
        }

        if (self.opt.debug)
            util.log( 'Waiting ' + self.opt.retryDelay + 'ms before retrying' );
        setTimeout(function() {
            self.connect( retryCount + 1 );
        }, self.opt.retryDelay );
    });
}; // }}}

Client.prototype.disconnect = function ( message ) { // {{{
    message = message || "node-irc says goodbye";
    var self = this;
    if (self.conn.readyState == 'open')
        self.send( "QUIT", message );
    self.conn.requestedDisconnect = true;
    self.conn.end();
}; // }}}

Client.prototype.send = function(command) { // {{{
    var args = [];
    for (var k in arguments)
        args.push(arguments[k]);
    args[args.length - 1] = ":" + args[args.length - 1];

    // Remove the command
    args.shift();

    if (this.opt.debug)
        util.log('SEND: ' + command + " " + args.join(" "));

    this.conn.write(command + " " + args.join(" ") + "\r\n");
}; // }}}

Client.prototype.join = function(channel, callback) { // {{{
    if (typeof(callback) == 'function') {
        var callbackWrapper = function () {
            this.removeListener('join' + channel, callbackWrapper);
            return callback.apply(this, arguments);
        };
        this.addListener('join' + channel, callbackWrapper);
    }
    this.send('JOIN', channel);
} // }}}

Client.prototype.part = function(channel, callback) { // {{{
    if (typeof(callback) == 'function') {
        var callbackWrapper = function () {
            this.removeListener('part' + channel, callbackWrapper);
            return callback.apply(this, arguments);
        };
        this.addListener('part' + channel, callbackWrapper);
    }

    this.send('PART', channel);
} // }}}

Client.prototype.say = function(target, text) { // {{{
    this.send('PRIVMSG', target, text);
} // }}}

/*
 * parseMessage(line)
 *
 * takes a raw "line" from the IRC server and turns it into an object with
 * useful keys
 */
function parseMessage(line) { // {{{
    var message = {};
    var match;
    
    // Parse prefix
    if (match = line.match(/^:([^ ]+) +/)) {
        message.prefix = match[1];
        line = line.replace(/^:[^ ]+ +/, '');
        if (match = message.prefix.match(/^([\._a-zA-Z0-9\[\]\\`^{}|-]*)(!([^@]+)@(.*))?$/)) {
            message.nick = match[1];
            message.user = match[3];
            message.host = match[4];
        } else {
            message.server = message.prefix;
        }
    }

    // Parse command
    match = line.match(/^([^ ]+) +/);
    message.command = match[1];
    message.rawCommand = match[1];
    message.commandType = 'normal';
    line = line.replace(/^[^ ]+ +/, '');

    if (messageCodes[message.rawCommand]) {
        message.command     = messageCodes[message.rawCommand].name;
        message.commandType = messageCodes[message.rawCommand].type;
    }

    message.args = [];
    var middle, trailing;

    // Parse parameters
    if (line.indexOf(':') != -1) {
        var index = line.indexOf(':');
        middle = line.substr(0, index).replace(/ +$/, "");
        trailing = line.substr(index+1);
    } else {
        middle = line;
    }

    if (middle.length)
        message.args = middle.split(/ +/);

    if (typeof(trailing) != 'undefined' && trailing.length)
        message.args.push(trailing);

    return message;
} // }}}
