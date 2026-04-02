// electron-builder config that extends package.json "build" section.
// Reads APPLE_TEAM_ID from environment (exported by scripts/package.sh from .env).
/** @type {import('electron-builder').Configuration} */
module.exports = {
  mac: {
    notarize: process.env.APPLE_TEAM_ID
      ? { teamId: process.env.APPLE_TEAM_ID }
      : false,
  },
}
