# lambdapack
Bundles modules for the AWS Lambda Node.js runtime (using webpack).


## Overview

lambdapack simply mechanizes running webpack with the configuration needed
for the AWS Lambda Node.js runtime and then creating a zip file of the
webpack output.

Use for most Lambda function implementations is hopefully straightforward:

```
$ npm install -D @sspiff/lambdapack
$ node_modules/.bin/lambdapack
```

will install lambdapack and run it.  This should produce a zip file named
after the local package and containing the output from running webpack on
the local package entry point.  The webpack bundle file within the zip file
will have the same name as the entry point.

For example, with a `package.json` containing:

```
  "name": "my-lambda",
  "main": "index.js"
```

lambdapack will run webpack on `index.js` and produce `my-lambda.zip`
containing a webpack-bundled `index.js`.  `my-lambda.zip` is the deployment
package that should be uploaded to AWS Lambda, and the handler setting
for the Lambda would be `index.HANDLER` (where `HANDLER` is the name of a
function exported by `index.js`).


## ES6 and webpack Optimization

lambdapack is intended for use with ES6-style module imports and exports
(though their use may not be required).  It is known to work when the Lambda
handler is exported from the main/entry file as an ES6 named export.

For optimizing deployment package size, lambdapack relies entirely on related
features of webpack, including tree shaking.  As tree shaking requires ES6
module syntax, better results may be had with shake-friendly modules:
those that use `import`/`export` and that accurately advertise `sideEffects`.

**Note** that lambdapack enables webpack tree shaking but disables minimizing
by default (see below).


## Configuration

lambdapack uses the following default webpack configuration:

<pre>
{
  mode: 'production',
  optimization: { minimize: false },
  entry: PACKAGE.main,
  output: {
    filename: path.basename(PACKAGE.main),
    <b>path</b>: '/zipcontents',
    <b>libraryTarget</b>: 'commonjs2'
  },
  <b>target</b>: 'node'
}
</pre>

where `PACKAGE` is the contents of the local `package.json`.
The output zip file will be named `` `${PACKAGE.name}.zip` ``.

By default,`mode` is set to `production` to enable tree shaking, while
`optimization.minimize` is set to `false` to facilitate debugging in the AWS
console.

The webpack configuration parameters in **bold** are fixed.  Others can be
customized by including them in a block in `package.json`, for example:

```
  ...
  "lambdapack": {
    "webpack": {
      "optimization": { "minimize": true }
    }
  },
  ...
```

## Build Reproducibility

Some AWS tooling, such as `aws cloudformation package`, uses hashes of
Lambda deployment packages to (effectively) determine if a function
implementation has changed and needs to be updated.

Zip archives have a timestamp for each file that they contain.  Even if the
constituent files' contents are identical, differences in the timestamps will
cause the overall zip file to appear different.  This can trigger unnecessary
CloudFormation updates to the Lambda function.

To mitigate this, lambdapack applies a fixed timestamp to the files in the
zip archive.  If the webpack output does not change from one run to the next,
the zip archives produced by lambdapack should be identical.

## `make` Dependency Generation

lambdapack is capable of outputting dependency information as rules for `make`
using the stats data provided by webpack.  This can be useful in AWS projects
with multiple lambdas that share common (but unpackaged) project-specific
modules.

The generated rules will include the zip file as a target with the webpack
bundle's assets' source files as the zip's dependencies.  However, all assets
from `node_modules` will be represented by a single dependency on
`node_modules` itself.

The following command line options control `make` dependency generation:

<pre>
-MD [-MP] [-MF <em>OUTFILE</em>] [-MT <em>TARGET</em>] [-MR <em>SRCPREFIX</em>]
</pre>

Where:

* `-MD` enables `make` dependency generation.
* `-MP` adds an empty phony target for each dependency.  This can prevent
errors from `make` if a dependency is later removed.
* `OUTFILE` is the name of the file where the rules are written.  Defaults to
the name of the output zip file with `.d` appended.
* `TARGET` is the target to define in the generated rules.  Defaults to the
name of the output zip file.
* `SRCPREFIX` is prepended to each dependency in the rules.  This can
be useful if lambdapack is invoked in a directory different from where
`make` is run.

