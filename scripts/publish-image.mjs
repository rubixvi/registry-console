import { imageArgument, run } from './helpers/process.mjs'

const image = imageArgument('image:publish')

run(process.execPath, ['scripts/build-image.mjs', image])
run('docker', ['push', image])
