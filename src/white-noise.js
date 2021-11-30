(function(exports) {
  const { logger } = require('log-instance');
  const { WaveFile } = require('wavefile');
  const assert = require('assert');

  class WhiteNoise {
    constructor(opts={}) {
      let { 
        variance = 1,
        supportSize = 256,
        type = Array,
      } = opts;

      Object.assign(this, {
        variance,
        supportSize,
        type,
      })
    }

    sample(opts={}) {
      let { type:type0, variance, supportSize, } = this;
      let { nSamples, type=type0 } = opts;
      let samples = type === Array
         ? new Array(nSamples).fill(0)
         : new type(nSamples);

      let scale = Math.sqrt(variance*12/supportSize);
      for (let i = 0; i < nSamples; i++) {
        let value = 0;
        for (let j = 0; j < supportSize; j++) {
          value += Math.random();
        }
        samples[i] = scale*(value - supportSize/2);
      }


      return samples;
    }

  }

  module.exports = exports.WhiteNoise = WhiteNoise;

})(typeof exports === "object" ? exports : (exports = {}));
