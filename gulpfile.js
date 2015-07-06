var gulp = require('gulp');
//var gutil = require('gulp-util');
var uglify = require('gulp-uglify');
var rename = require('gulp-rename');
var less = require('gulp-less');
var path = require('path');
var minifyCSS = require('gulp-minify-css');


gulp.task('default', function () {

    gulp.src('./ng-mtab-api.js')
        .pipe(rename('ng-mtab-api.min.js'))
        .pipe(uglify())
        .pipe(gulp.dest('./'));

    gulp.src('./ng-mtab-directives.js')
        .pipe(rename('ng-mtab-directives.min.js'))
        .pipe(uglify())
        .pipe(gulp.dest('./'));

    gulp.src('./opd.less')
        .pipe(less())
        .pipe(minifyCSS())
        .pipe(gulp.dest('.'));

    gulp.src('./demos/style.less')
        .pipe(less())
        .pipe(minifyCSS())
        .pipe(gulp.dest('./demos/'));

});
