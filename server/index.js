'use strict';
/*
 * Game server network: game and Minecraft servers as groups – start, stop and watch them together; Velocity networks
 * from Hostwerk's Minecraft area are taken over with one click. Needs the "game-servers" extension (manifest "requires").
 */
const { GameNetwork } = require('./network');

exports.activate = (host) => {
  const net = host.provide('gameNetwork', new GameNetwork(host));
  net.routes(host.router);
};

exports.deactivate = () => {};
