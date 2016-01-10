/**
 * @file Contains the DropzoneError object, and shared error related concerns
 */

var inherits = require('inherits')

inherits(DropzoneError, Error)

/**
 * Base class for all Dropzone errors
 *
 * @class DropzoneError
 * @param {String} message - plain text description of the problem
 */
function DropzoneError (message) {
  /**
   * Returns the name of this error
   *
   * @name DropzoneError#name
   * @type String
  */ 
  this.__defineGetter__('name', function () { return this.constructor.name })

  /**
   * Returns a short description of what happened
   *
   * @name DropzoneError#name
   * @type String
  */ 
  this.__defineGetter__('message', function () { return message })

  if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor)
}

module.exports = DropzoneError
