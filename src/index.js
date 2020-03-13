#!/usr/bin/env node


const fs = require('fs')
const path = require('path')
const {createFsFromVolume, Volume} = require('memfs')
const webpack = require('webpack')


// load package.json
const packageConfig = JSON.parse(fs.readFileSync('package.json'))
const packageMain = packageConfig.main || 'index.js'
// lambdapack config from package.json
const lambdapackConfig = packageConfig.lambdapack || {}
const userWebpackConfig = lambdapackConfig.webpack || {}


// output zip file name based on package name
const outZipName = `${packageConfig.name}.zip`
// use a fixed date for zip contents as aws tooling uses hashes of
// file contents to detect when deployment packages have changed
const zipContentsDate = new Date('Thu Mar 12 15:45:19 2020 -0400')


// required webpack config
const requiredWebpackConfig = {
  output: {
    path: '/zipcontents',
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
  outfs.readdirSync(webpackConfig.output.path, {withFileTypes: true})
    .filter(i => i.isFile())
    .map(i => i.name)
    .sort()
    .forEach(f => {
        console.log(`    ${f}`)
        zip.file(
            f,
            outfs.createReadStream(`${webpackConfig.output.path}/${f}`),
            {
              binary: true,
              compression: 'DEFLATE',
              date: zipContentsDate,
            }
          )
      })
  zip
    .generateNodeStream({type: 'nodebuffer', streamFiles: true})
    .pipe(fs.createWriteStream(outZipName))
    .on('finish', function () {
        console.log(`${outZipName} written`)
      })
})
.catch(ignore => null)

