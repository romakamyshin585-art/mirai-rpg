const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const existing = config.resolver.blockList;
const escapedRoot = path.resolve(__dirname).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const extra = [
  new RegExp(`^${escapedRoot}[\\\\/]\\.git[\\\\/].*`),
  new RegExp(`^${escapedRoot}[\\\\/]\\.scratch-Documents-MiraiRPG-backup[\\\\/].*`),
  new RegExp(`^${escapedRoot}[\\\\/]android[\\\\/].*`),
  new RegExp(`^${escapedRoot}[\\\\/]dist[\\\\/].*`),
  new RegExp(`^${escapedRoot}[\\\\/]coverage[\\\\/].*`),
];

config.resolver.blockList = Array.isArray(existing)
  ? [...existing, ...extra]
  : [existing, ...extra].filter(Boolean);

module.exports = config;
