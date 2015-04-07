/*
 * AccessSniff
 * https://yargalot@github.com/yargalot/AccessSniff
 *
 * Copyright (c) 2015 Steven John Miller
 * Licensed under the MIT license.
 */

var fs        = require('fs');
var path      = require('path');
var chalk     = require('chalk');
var Promise   = require('bluebird');
var _         = require('underscore');
var asset     = path.join.bind(null, __dirname, '..');
var logger    = require('./logger.js');
var reporter  = require('./reports.js');

var childProcess  = require('child_process');
var phantomPath   = require('phantomjs').path;

var _that;

function Accessibility(options) {

  this.options  = Accessibility.Defaults;
  this.basepath = process.cwd();
  this.failTask = false;

  this.log          = '';
  this.fileContents = '';

  if (this.options.accessibilityrc) {
    this.options.ignore = fs.readFile('.accessibilityrc').ignore;
  }

  // Extend options with input options
  _.extend(this.options, options);

  _that = this;

}

Accessibility.Defaults = {
  ignore: [],
  verbose: true,
  force: false,
  domElement: true,
  reportType: null,
  reportLevels: {
    notice: true,
    warning: true,
    error: true
  },
  reportLocation : 'reports',
  accessibilityrc: false,
  accessibilityLevel: 'WCAG2A'
};

/**
* The Message Terminal, choo choo
*
*
*/
Accessibility.prototype.terminalLog = function(msg, trace) {

  var ignore  = false;
  var options = _that.options;
  var message = {};
  var msgSplit = msg.split('|');
  var reportLevels = [];

  // If ignore get the hell out
  _.each(options.ignore, function(value, key) {
    if (value === msgSplit[1]) {
      ignore = true;
    }
  });

  if (ignore) {
    return;
  }

  if (options.reportLevels.notice) {
    reportLevels.push('NOTICE');
  }

  if (options.reportLevels.warning) {
    reportLevels.push('WARNING');
  }

  if (options.reportLevels.error) {
    reportLevels.push('ERROR');
  }

  // Start the Logging
  if (_.contains(reportLevels, msgSplit[0])) {

    var element = {
      node:   msgSplit[3],
      class:  msgSplit[4],
      id:     msgSplit[5]
    };

    message = {
      heading:      msgSplit[0],
      issue:        msgSplit[1],
      element:      element,
      position:     this.getElementPosition(msgSplit[3]),
      description:  msgSplit[2],
    };

    if (message.heading === 'ERROR') {
      _that.failTask = true;
    }

    if (options.verbose) {
      logger.generalMessage(message);
    }

  } else {

    message = null;

    //console.log(msg);

  }

  return message;

};

/**
* Get Elements Line and Column Number
*
*
*/
Accessibility.prototype.getElementPosition = function(htmlString) {

  var position = {};
  var htmlArray = this.fileContents.split('\n');

  htmlArray.every(function(element, lineNumber) {
    if (!element.match(htmlString)) {
      return true;
    }

    var columnNumber = 0;
    var colIndex = 0;
    var pattern = /(\s|\t)/g;

    while (element.charAt(colIndex).match(pattern)) {
      columnNumber++;
      colIndex++;
    }

    position.lineNumber = lineNumber;
    position.columnNumber = columnNumber;

    return false;

  });

  return position;

};

Accessibility.prototype.parseOutput = function(file, deferred) {

  var test = file.split('\n');
  var _this = this;
  var messageLog = [];

  test.every(function(element, index, array) {

    var something = JSON.parse(element);

    if (something[0] === 'wcaglint.done') {
      return false;
    }

    var message = _this.terminalLog(something[1]);

    if (message) {
      messageLog.push(message);
    }

    return true;

  });

  if (this.options.reportType) {
    reporter.terminal(messageLog, _this.options, function() {
      deferred.fulfill();
    });
  } else {
    deferred.fulfill();
  }

};

/**
* Run task
*
* @param {Object} grunt - grunt object
*
* @returns {Object} a promise that resolves with final html
*
*/
Accessibility.prototype.run = function(filesInput, callback) {

  var files   = Promise.resolve(filesInput);
  var _this = this;

  var promiseMapOptions = {
    concurrency: 1
  };

  return files
    .bind(this)
    .map(function(file) {

      var deferredOutside = Promise.pending();
      var childArgs = [
        path.join(__dirname, './phantom.js'),
        file,
        {}
      ];

      logger.startMessage('Testing ' + childArgs[1]);

      this.options.fileName = path.basename(childArgs[1], '.html');

      childProcess.execFile(phantomPath, childArgs, function(err, stdout, stderr) {
        // handle results

        if (!err) {

          _this.parseOutput(stdout, deferredOutside);

          return;
        }

        deferredOutside.fulfill();
      });

      fs.readFile(file, 'utf8', function(err, data) {
        _this.fileContents = data.toString();
      });

      return deferredOutside.promise;

    }, promiseMapOptions)
    .catch(function(err) {

      return err;

    })
    .finally(function() {

      if (typeof callback === 'function') {
        callback();
      }

      return true;

    });

};

Accessibility.start = function(files, options, callback) {

  var task = new Accessibility(options);

  return task.run(files, callback);

};

module.exports = Accessibility;
