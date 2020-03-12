#!/usr/bin/env node


const fs = require('fs')
const path = require('path')
const {createFsFromVolume, Volume} = require('memfs')
const webpack = require('webpack')

const appRoot = require('app-root-path').toString()


// load package.json
const packageConfig = JSON.parse(
  fs.readFileSync(path.join(appRoot, 'package.json')))
const packageMain = path.relative('.',
  path.normalize(path.join(appRoot, packageConfig.main || 'index.js')))
// lambdapack config from package.json
const lambdaConfig = packageConfig.lambdapack || {}
const userWebpackConfig = lambdaConfig.webpack || {}
// output zip file name based on package name
const outZipName = `${packageConfig.name}.zip`


// required webpack config
const requiredWebpackConfig = {
  output: {
    path: '/dist',
    libraryTarget: 'commonjs2',
  },
  target: 'node',
}

// default overrideable webpack config
const defaultWebpackConfig = {
  mode: 'production',  // enables tree-shaking
  optimization: {
    minimize: false,   // helps with debugging in the aws console
  },
}

// craft our runtime webpack config
const webpackConfig = {
  ...defaultWebpackConfig,
  entry: `./${packageMain}`,
  ...userWebpackConfig,
  ...requiredWebpackConfig,
  output: {
    ...defaultWebpackConfig.output || {},
    filename: path.basename(packageMain),
    ...userWebpackConfig.output || {},
    ...requiredWebpackConfig.output || {},
  },
}


// send webpack output to memfs
const outfs = createFsFromVolume(new Volume())
outfs.join = require('./join')

const compiler = webpack(webpackConfig)

compiler.outputFileSystem = outfs

const compileDone = new Promise((resolve, reject) => {
  compiler.run((err, stats) => {
    if (err) {
      console.error(err.stack || err)
      if (err.details)
        console.error(err.details)
      reject()
      return
    }
    console.log(stats.toString({colors: true, chunks: false}))
    if (stats.hasErrors())
      reject()
    else
      resolve()
  })
})


// zip up webpack output
const JSZip = require('jszip')
compileDone.then(() => {
  console.log(`lambdapack ${outZipName}:`)
  const zip = new JSZip()
  outfs.readdirSync('/dist', {withFileTypes: true})
    .filter(i => i.isFile())
    .map(i => i.name)
    .forEach(f => {
        console.log(`    ${f}`)
        zip.file(f, outfs.readFileSync(`/dist/${f}`, 'utf8'),
          {compression: 'DEFLATE'})
      })
  zip
    .generateNodeStream({type: 'nodebuffer', streamFiles: true})
    .pipe(fs.createWriteStream(outZipName))
    .on('finish', function () {
        console.log(`${outZipName} written`)
      })
})
.catch(ignore => null)

