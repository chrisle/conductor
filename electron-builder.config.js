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

  // Publish artifacts to Backblaze B2 via its S3-compatible API.
  // electron-updater reads the resulting `latest.yml` / `latest-mac.yml`
  // files from the same bucket to serve in-app updates.
  //
  // Required env vars (set as GitHub Actions secrets):
  //   AWS_ACCESS_KEY_ID     → B2_KEY_ID
  //   AWS_SECRET_ACCESS_KEY → B2_APPLICATION_KEY
  //   B2_BUCKET             → bucket name, e.g. conductor-releases
  //   B2_ENDPOINT           → https://s3.<region>.backblazeb2.com
  publish: {
    provider: 's3',
    bucket: process.env.B2_BUCKET,
    endpoint: process.env.B2_ENDPOINT,
    // 'auto' lets B2 resolve the region from the endpoint URL.
    region: 'auto',
    // B2 does not support S3-style ACLs; setting null suppresses the error.
    acl: null,
  },
}
