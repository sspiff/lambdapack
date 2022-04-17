#!/usr/bin/env node


// grok our command line
//
// -o output zip file
// -MD
// -MT target
// -MP prereqs as targets
// -MF output file
// -MR prereq directory prefix
//
const argv = {}
for (let i = 2; i < process.argv.length; ) {
  if (process.argv[i] === '-MD')
    argv.MD = true
  else if (process.argv[i] === '-MF')
    argv.MF = process.argv[++i]
  else if (process.argv[i] === '-MP')
    argv.MP = true
  else if (process.argv[i] === '-MR')
    argv.MR = process.argv[++i]
  else if (process.argv[i] === '-MT')
    argv.MT = process.argv[++i]
  else if (process.argv[i] === '-o')
    argv.o = process.argv[++i]
  i++
}


const fs = require('fs')
const path = require('path')
const {createFsFromVolume, Volume} = require('memfs')
const webpack = require('webpack')


// load package.json
const packageJsonPath = './package.json'
const packageConfig = JSON.parse(fs.readFileSync(packageJsonPath))
const packageMain = packageConfig.main || 'index.js'
// lambdapack config from package.json
const lambdapackConfig = packageConfig.lambdapack || {}
const userWebpackConfig = lambdapackConfig.webpack || {}


// output zip file name based on package name
const outZipName = argv.o || `${packageConfig.name}.zip`
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


// construct our make dependency generation config
var makedep
if (argv.MD) {
  makedep = {
    output: argv.MF || `${outZipName}.d`,
    target: argv.MT || outZipName,
    srcdir: argv.MR || '.',
    depTargets: argv.MP,
    otherDeps: [packageJsonPath],
  }
}


// send webpack output to memfs
const outfs = createFsFromVolume(new Volume())
outfs.join = require('./join')

const compiler = webpack(webpackConfig)

compiler.outputFileSystem = outfs


const depsFromModuleStats = (m) => {
    const nodeModules = m.name.match(/^[\.\/]*\/node_modules\//)
    if (nodeModules)
      return [nodeModules[0].slice(0, -1)]
    else if (m.modules && m.modules.length)
      return m.modules.map(n => depsFromModuleStats(n))
    else
      return [m.name, ...(m.issuerPath || []).map(p => p.name)]
  }

const depsFromStats = (stats) => [...new Set([
    ...makedep.otherDeps,
    ...stats.toJson('detailed').modules.map(m => {
        if (m.chunks.length === 0 || m.name.startsWith('webpack/runtime/'))
          return []
        else
          return depsFromModuleStats(m)
      }).flat(2)
  ])]

const makeRules = (deps) =>
  deps.reduce((chunks, dep, i) => {
      const ci = Math.floor(i / 5)
      if (!chunks[ci])
        chunks[ci] = []
      chunks[ci].push(dep)
      return chunks
    }, [])
  .map(deps => {
      let depTargets = makedep.depTargets
                         ? deps.filter(d => !d.endsWith('node_modules'))
                         : []
      return `${makedep.target}: ${deps.join(' ')}\n` +
             (depTargets.length ? `${depTargets.join(' ')}:\n` : '')
    })
  .join('')


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
      resolve(stats)
  })
})


// output make dependency file
const makeDepWritten = compileDone.then(
  stats => new Promise((resolve, reject) => {
    if (makedep) {
      fs.writeFile(
        makedep.output,
        makeRules(
            depsFromStats(stats)
              .map(d => `${makedep.srcdir}/${d}`)
              .map(p => path.normalize(p))
          ),
        (err) => {
            if (err)
              reject(err)
            else
              resolve()
          })
    }
    else
      resolve()
  })
)


// zip up webpack output
const JSZip = require('jszip')
const zipWritten = compileDone.then(() => {
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

