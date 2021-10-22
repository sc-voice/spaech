(function(exports) {
  const { logger } = require('log-instance');
  const assert = require('assert');
  const Resonator = require('./resonator');

  class ResonatorBank { 
    constructor(opts={}) {
      let {
        length = 10,
        sampleRate = 22050, // Common sample rate for speech MP3
        scale = 16384,      // peak amplitude for 16-bit audio speech
        frequency = 200,    // initial frequency
        phase = 0,          // initial phase
        frameSize = 192,    // frame size
        tween = false,      // interpolate resonator changes
        r = 0.98,           // decay
      } = opts;

      Object.defineProperty(this, "resonators", {
        value: new Array(length).fill(0).map((v,i)=>{
          let il1 = i/(length-1);
          let ri = Array.isArray(r)
            ? (1-il1)*r[0] + il1*r[r.length-1]
            : r;
          return new Resonator({ frequency, phase, sampleRate, scale,
            r:ri, tween,
          })}),
      });
      Object.assign(this, {
        frequency,
        phase,
        frameSize,
        length,
        sampleRate,
        scale,
        r,
        tween,
      });
    }

    resonate(harmonics, opts={}) {
      let { resonators, length, frameSize } = this;
      let { length:hLen } = harmonics;
      let {
        nSamples = frameSize,
        type = Array,
        verbose = false,
      } = opts;
      let samples = new type(nSamples).fill(0);
      let harmonicMap = harmonics.reduce((a,harmonic,i)=>{
        let { frequency, amplitude:scale=0, phase, order } = harmonic;
        assert(order != null, `[E_HARMONIC_ORDER] required: order`);
        a[order] = harmonic;
        return a;
      }, {});
      resonators.forEach((resonator, i) => {
        let harmonic = harmonicMap[i] || {};
        let { frequency, amplitude:scale=0, phase } = harmonic;
        let hs = resonator.resonate({ frequency, nSamples, scale, phase, type, verbose, });
        for (let j = 0; j < hs.length; j++) {
          samples[j] += hs[j];
        }
      });

      return samples;
    }

  }

  module.exports = exports.ResonatorBank = ResonatorBank;

})(typeof exports === "object" ? exports : (exports = {}));
