#!/usr/bin/env node

var fs = require('fs')
var path = require('path')
var jsdiff = require('diff')

var walk = function (dir, done) {
  var results = []
  fs.readdir(dir, function (err, list) {
    if (err) return done(err)
    var pending = list.length
    if (!pending) return done(null, results)
    list.forEach(function (file) {
      file = path.resolve(dir, file)
      fs.stat(file, function (err, stat) {
        if (err) throw err
        if (stat && stat.isDirectory()) {
          walk(file, function (err, res) {
            if (err) throw err
            results = results.concat(res)
            if (!--pending) done(null, results)
          })
        } else {
          results.push(file)
          if (!--pending) done(null, results)
        }
      })
    })
  })
}

walk(path.resolve(__dirname, '../patches'), function (err, results) {
  if (err) throw err
  results.map(function (file) {
    var parsed = path.parse(file)
    parsed.origin = file
    return parsed
  }).filter(function (fpath) {
    return fpath.base === 'patch'
  }).map(function (fpath) {
    var modules = path.resolve(__dirname, '../node_modules')
    var parts = fpath.dir.split(path.sep)
    var rdest = parts.slice(parts.lastIndexOf('patches') + 1).join(path.sep)
    return {
      patch: fpath.origin,
      dest: path.join(modules, rdest)
    }
  }).forEach(function (op) {
    var strPatch = fs.readFileSync(op.patch, 'utf-8')
    var strDest
    try {
      strDest = fs.readFileSync(op.dest, 'utf-8')
    } catch (err) {
      strDest = ''
    }
    fs.writeFileSync(op.dest,
      jsdiff.applyPatch(strDest, jsdiff.parsePatch(strPatch)))
    console.log('> patched', path.relative(__dirname, op.dest))
  })
  console.log()
})
