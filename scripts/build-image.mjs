import { imageArgument, run } from './helpers/process.mjs'

const image = imageArgument('image:build')

run('docker', ['build', '--pull', '--tag', image, '.'])
