(function(exports) {
  const { logger } = require('log-instance');
  const Resonator = require('./resonator');
  const assert = require('assert');

  class Noise {
    constructor(opts={}) {
      let { 
        basis = 12,
        color,
        frequency = 0,
        nSamples = 96,
        phase = 0,
        scale = 1,
        randomBasis,
      } = opts;

      assert(color, 'Use factory methods for Noise');

      let resonator = new Resonator({
        frequency, 
        phase, 
        scale,
        initialScale:frequency?scale:0, 
      });

      Object.assign(this, {
        basis,
        color,
        frequency,
        nSamples,
        randomBasis,
        resonator,
        scale,
      })
    }

    static createWhiteNoise(opts={}) {
      Object.assign(opts, {
        basis:12, 
        color:'white',
      }, opts);
      let noise = new Noise(opts);
      Object.defineProperty(noise, 'sample', {
        value: opts => noise.sampleWhite(opts),
      });
      return noise;
    }

    static createPinkNoise(opts={}) {
      let { basis = 12 } = opts;
      let randomBasis = new Array(basis).fill(0).map(v=>Math.random());
      Object.assign(opts, {basis:12, color:'pink', randomBasis}, opts);
      let noise = new Noise(opts);
      noise.lastSum = randomBasis.reduce(((a,v)=>a+v), 0);
      Object.defineProperty(noise, 'sample', {
        value: opts => noise.samplePink(opts),
      });
      return noise;
    }

    get variance() {
      return this.basis/12;
    }
    
    envelope(opts={}) {
      let { resonator, basis, scale} = this;
      let { 
        frequency = this.frequency,
        nSamples = this.nSamples, 
        phase = this.phase,
      } = opts;
      if (frequency === 0) {
        var envelope = new Array(nSamples).fill(scale);
      } else {
        var envelope = resonator.sample({nSamples, frequency, phase, })
          .map(v => Math.abs(v)); // scale to the magnitude only
      }
      return envelope;
    }

    sampleWhite(opts={}) {
      let { basis, } = this;
      let { nSamples=this.nSamples } = opts;
      let samples = this.envelope(opts);

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

    samplePink(opts={}) {
      let { resonator, basis, lastSum:sum, randomBasis } = this;
      let { nSamples = this.nSamples } = opts;
      let samples = this.envelope(opts);

      // pink-noise improved Gardner generator with staggered updates
      // https://www.dsprelated.com/showarticle/908.php
      for (let i = 0; i < nSamples; i++) {
        let iz = i;

        // incrementally update a single random value for each sample
        for (var nZeros = 0; (iz%2)===0 && nZeros < basis-1; nZeros++) { 
          iz >>= 1;
        }
        sum -= randomBasis[nZeros];
        randomBasis[nZeros] = Math.random();
        sum += randomBasis[nZeros];
        
        let value = (sum - basis/2);
        samples[i] *= value;
      }
      this.lastSum = sum;

      return samples;
    }

  }

  module.exports = exports.Noise = Noise;

})(typeof exports === "object" ? exports : (exports = {}));
