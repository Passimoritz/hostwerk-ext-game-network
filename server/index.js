'use strict';
/*
 * Game server network: game and Minecraft servers as groups – start, stop and watch them together; Velocity networks
 * from Hostwerk's Minecraft area are taken over with one click. Needs the "game-servers" extension (manifest "requires").
 * A timer checks every 30 seconds for scheduled restarts (with an announcement in the chat).
 */
const { GameNetwork } = require('./network');

exports.activate = (host) => {
  const net = host.provide('gameNetwork', new GameNetwork(host));
  net.routes(host.router);
  if (!process.env.HW_TEST) net.startTimer();
  if (typeof host.on === 'function') host.on('shutdown', () => net.stopTimer());
};

exports.deactivate = () => {};
