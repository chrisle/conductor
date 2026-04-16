// electron-builder config that extends the package.json "build" section.
// Reads credentials from environment variables injected by the release workflow.
/** @type {import('electron-builder').Configuration} */
module.exports = {
  mac: {
    notarize: process.env.APPLE_TEAM_ID
      ? { teamId: process.env.APPLE_TEAM_ID }
      : false,
    extraResources: [{ from: 'conductord/conductord', to: 'conductord' }],
  },
  win: {
    extraResources: [{ from: 'conductord/conductord.exe', to: 'conductord.exe' }],
  },

  // Publish to GitHub Releases. electron-builder writes the installers plus
  // `latest.yml` / `latest-mac.yml` to the release, which electron-updater
  // reads via the matching `provider: 'github'` config in the app.
  //
  // Required env var (provided automatically by GitHub Actions):
  //   GH_TOKEN  →  ${{ secrets.GITHUB_TOKEN }}
  publish: {
    provider: 'github',
    owner: 'chrisle',
    repo: 'conductor',
    releaseType: 'release',
  },
}
