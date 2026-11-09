// Metro loads this Node configuration as CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('node:path')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDefaultConfig } = require('expo/metro-config')

const workspaceRoot = path.resolve(__dirname, '../..')
const config = getDefaultConfig(__dirname)

// All shared native contracts/helpers live in lib. Avoid watching the entire
// backend workspace, including its generated caches, uploads and Git data.
config.watchFolders = [...new Set([...config.watchFolders, path.join(workspaceRoot, 'lib')])]

module.exports = config
