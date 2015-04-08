/*
* @Author: dm.yang
* @Date:   2015-04-05 15:55:27
* @Last Modified by:   dm.yang
* @Last Modified time: 2015-04-08 20:13:55
*/

'use strict';

var net = require('net');
var fs = require('fs');
var pty = require('pty.js');
var ProtoBuf = require('protobufjs');

var builder = ProtoBuf.loadProtoFile('../conf/socket.proto');
var Proto = builder.build('Socket');
var Input = Proto.Input;
var Output = Proto.Output;

var monitHost = '192.168.33.88';
var monitPort = 3977;

var client = new net.Socket();
var stream;
var terms = {};

connect();

function connect() {
    client.connect(monitPort, monitHost);
    client.setEncoding('utf8');
};

client.on('connect', function() {
    console.log('monitor client connect to %s:%s success', monitHost, monitPort);
    client.isConnect = true;
});

client.on('timeout', function() {
    console.warn('monitor client timeout');
});

client.on('error', function(err) {
    console.error('monitor client error', err);
});

client.on('close', function() {
    client.isConnect = false;
    client.clientId = null;

    if(!client.isDestroy) {
        console.warn('monitor client closed');
        setTimeout(function() {
            console.log('try to reconnect monitor');
            connect();
        }, 1000);
    }
});

client.on('data', dataHandle);

function dataHandle1(msg) {
    msg = msg.toString('utf8');

    console.info('reveived msg:%s', msg);

    msg = JSON.parse(msg);

    if(!msg.cmd) {
        console.warn('param `cmd` missing');
        return;
    }

    switch(msg.cmd) {
        case 'client:ready':
            if(msg.clientId) client.clientId = msg.clientId;

            send2monit({cmd: 'client:online', group: 'foo'});

            break;

        case 'client:destroy':
            process.exit();
            break;

        case 'term:input':
            var term = getTerm(msg.termId);

            if(term) term.write(msg.input, 'utf8');
            console.log('INPUT:', msg.input);
            break;

        case 'term:destroy':
            var term = getTerm(msg.termId);

            if(term) {
                delete terms[msg.termId];
                console.log('remove term:%s', msg.termId);
            }
            break;

        default: break;
    }
};

function dataHandle(data) {
    console.info('reveived msg:%s', msg);

    var msg = Input.decode(data);

    if(!msg.cmd) {
        console.warn('param `cmd` missing');
        return;
    }

    switch(msg.cmd) {
        case 'client:ready':
            if(msg.clientId) client.clientId = msg.clientId;

            send2monit({cmd: 'client:conf', conf: {group: 'foo'}});
            send2monit({cmd: 'client:online'});

            break;

        case 'client:destroy':
            process.exit();
            break;

        case 'term:input':
            var term = getTerm(msg.termId);

            if(term) term.write(msg.input, 'utf8');
            console.log('INPUT:', msg.input);
            break;

        case 'term:destroy':
            var term = getTerm(msg.termId);

            if(term) {
                delete terms[msg.termId];
                console.log('remove term:%s', msg.termId);
            }
            break;

        default: break;
    }
};

function send2monit(msg) {
    if(!msg || !Object.keys(msg).length) return;

    if(!client.isConnect) {
        console.warn('socket has not connected');
        return;
    }

    if(!client.clientId) {
        console.error('client id has not assigned');
        return;
    }

    msg.clientId = client.clientId;

    console.log('client write msg:%s', JSON.stringify(msg));
    var buffer = new Output(msg);
    client.write(buffer.encode().toString('utf8'));
};

function getTerm(termId) {
    if(termId in terms) return terms[termId];

    var term = pty.fork(
        process.env.SHELL || 'sh', [], {
            name: fs.existsSync('/usr/share/terminfo/x/xterm-256color')
                ? 'xterm-256color'
                : 'xterm',
            cols: 130,
            rows: 45,
            cwd: process.env.HOME
        }
    );

    // client.setNoDelay(false) may not work?
    term.on('data', function(data) {
        console.log('OUTPUT:', data);
        send2monit({cmd: 'client:output', termId: termId, output: data});
    });

    terms[termId] = term;

    return term;
};
