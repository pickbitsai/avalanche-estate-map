// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
import net from 'node:net';
import dgram from 'node:dgram';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
const forbidden = () => { throw new Error('Tests must not bind ports or use a network'); };
net.Server.prototype.listen = forbidden;
net.Socket.prototype.connect = forbidden;
dgram.Socket.prototype.bind = forbidden;
dgram.Socket.prototype.send = forbidden;
http.request = https.request = http.get = https.get = forbidden;
globalThis.fetch = forbidden;
syncBuiltinESMExports();
