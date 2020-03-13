"use strict";

// from https://github.com/webpack/memory-fs/blob/master/lib/join.js

// Copyright JS Foundation and other contributors
//
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// 'Software'), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
// IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
// CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
// TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

const normalize = require("./normalize");

const absoluteWinRegExp = /^[A-Z]:([\\\/]|$)/i;
const absoluteNixRegExp = /^\//i;

module.exports = function join(path, request) {
	if(!request) return normalize(path);
	if(absoluteWinRegExp.test(request)) return normalize(request.replace(/\//g, "\\"));
	if(absoluteNixRegExp.test(request)) return normalize(request);
	if(path == "/") return normalize(path + request);
	if(absoluteWinRegExp.test(path)) return normalize(path.replace(/\//g, "\\") + "\\" + request.replace(/\//g, "\\"));
	if(absoluteNixRegExp.test(path)) return normalize(path + "/" + request);
	return normalize(path + "/" + request);
};
