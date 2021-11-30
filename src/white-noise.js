(function(exports) {
  const { logger } = require('log-instance');
  const Resonator = require('./resonator');
  const assert = require('assert');

  class WhiteNoise {
    constructor(opts={}) {
      let { 
        basis = 12,
        frequency = 0,
        phase = 0,
      } = opts;

      let resonator = new Resonator({
        frequency, 
        phase, 
        scale:1, 
        initialScale:frequency?1:0, 
      });

      Object.assign(this, {
        frequency,
        resonator,
        basis,
      })
    }

    get variance() {
      return this.basis/12;
    }
    
    sample(opts={}) {
      let { resonator, basis, } = this;
      let { 
        frequency = this.frequency,
        nSamples, 
        phase = this.phase,
      } = opts;
      let samples = resonator.sample({nSamples, frequency, phase, });
      if (frequency === 0) {
        samples.fill(1);
      }

      for (let i = 0; i < nSamples; i++) {
        let sum = 0;
        for (let j = 0; j < basis; j++) {
          sum += Math.random();
        }
        let value = (sum - basis/2);
        samples[i] *= value;
      }

      return samples;
    }

  }

  module.exports = exports.WhiteNoise = WhiteNoise;

})(typeof exports === "object" ? exports : (exports = {}));
