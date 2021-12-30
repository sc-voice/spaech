(function(exports) {
  const { logger } = require('log-instance');
  const Resonator = require('./resonator');
  const assert = require('assert');

  class Butterworth {
    constructor(opts={}) {
    }

    static orderOfPassStop({dBPass, omegaPass, dBStop, omegaStop}) {
      let pass = Math.pow(10, -dBPass/10 - 1);
      let stop = Math.pow(10, -dBStop/10 - 1);
      return Math.log10(stop/pass) / (2*Math.log10(omegaStop/omegaPass));
    }

    static cutoffFrequency({f, dB}) {
    }

  }

  module.exports = exports.Butterworth = Butterworth;

})(typeof exports === "object" ? exports : (exports = {}));
