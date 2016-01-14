var gulp = require('gulp')

var coveralls = require('gulp-coveralls')
var shell = require('gulp-shell')
var mocha = require('gulp-mocha')
var uglify = require('gulp-uglify')
var standard = require('gulp-standard')
var rename = require('gulp-rename')
var ghPages = require('gulp-gh-pages')
var runsequence = require('run-sequence')

runsequence.use(gulp)

var fullname = 'dropzone-lib'
var files = ['lib/**/*.js']
var tests = ['test/**/*.js']
var alljs = files.concat(tests)

var buildPath = './'
var buildModulesPath = buildPath + 'node_modules/'
var buildBinPath = buildPath + 'node_modules/.bin/'

var testkarma = shell.task([
  buildModulesPath + 'karma/bin/karma start ' + buildPath + 'karma.conf.js'
])

var testmocha = function() {
  return gulp.src(tests).pipe(new mocha({
    reporter: 'spec'
  }))
}

gulp.task('test:node', testmocha)

gulp.task('test:node:nofail', function() {
  return testmocha().on('error', ignoreerror)
})

gulp.task('test:browser', ['browser:uncompressed', 'browser:maketests'], testkarma)


gulp.task('test', function(callback) {
  runsequence(['test:node'], ['test:browser'], callback)
})

gulp.task('browser:uncompressed', shell.task([
  buildBinPath + 'browserify -d --require ./index.js:dropzone-lib -o dropzone-lib.js'
]))

gulp.task('browser:compressed', ['browser:uncompressed'], function() {
  return gulp.src(fullname + '.js')
    .pipe(uglify({mangle: true, compress: true}))
    .pipe(rename(fullname + '.min.js'))
    .pipe(gulp.dest('.'))
})

gulp.task('browser:maketests', shell.task([
  'find test/ -type f -name "*.js" | xargs ' + buildBinPath + 'browserify -t brfs -o tests.js'
]))

gulp.task('browser', function(callback) {
  runsequence(['browser:compressed'], callback)
})

gulp.task('lint', function() {
  return gulp.src(alljs)
    .pipe(jshint())
    .pipe(jshint.reporter('default'))
})

gulp.task('coverage', shell.task([buildBinPath + './istanbul cover ' + buildBinPath + '_mocha -- --recursive']))

gulp.task('coveralls', ['coverage'], function() {
  gulp.src('coverage/lcov.info').pipe(coveralls())
})

gulp.task('standard', function () {
  return gulp.src(alljs)
    .pipe(standard())
    .pipe(standard.reporter('default', {
      breakOnError: true
    }))
})

gulp.task('jsdoc', shell.task([
  buildBinPath + 'jsdoc -c ./jsdoc.conf'
]))

gulp.task('publish:jsdoc', ['jsdoc'], function() {
  return gulp.src('./docs/**/*')
    .pipe(ghPages())
})
