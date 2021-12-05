(function(exports) {
  const { logger } = require('log-instance');
  const assert = require('assert');
  const Resonator = require('./resonator');
  const Signal = require('./signal');

  class Synthesizer { 
    constructor(opts={}) {
      let {
        length = 10,
        sampleRate = 22050,   // Common sample rate for speech MP3
        scale = 16384,        // peak amplitude for 16-bit audio speech
        frequency = 200,      // initial frequency
        halfLifeSamples,      // alterenate decay initializer
        phase = 0,            // initial phase
        frameSize = 192,      // frame size
        r,                    // decay
      } = opts;

      let resonators = new Array(length).fill(0).map((v,i)=>{
        let il1 = i/(length-1);
        return new Resonator({ frequency, phase, r, sampleRate, scale,
          halfLifeSamples, 
      })});
      Object.defineProperty(this, "resonators", {value: resonators});
      Object.assign(this, {
        frequency,
        phase,
        frameSize,
        length,
        sampleRate,
        scale,
      });
    }

    static sampleSineWaves(args={}) {
      let {
        sineWaves = [],
        nSamples = 96,
        sampleRate = 22050,
        tStart = 0,
      } = args;
      assert(0<sineWaves.length, `expected array of sineWave declarations`);
      sineWaves.forEach(wave=>{
        let {frequency, scale, phase} = wave;
        Object.defineProperty(wave, 'samples', { // non-enumerable
          value: Signal.sineWave({frequency, nSamples, phase, scale, sampleRate, tStart,
        })});
        wave.samplesPerCycle = sampleRate/frequency;
      });
      let samples = sineWaves.reduce((a,wave)=>{
        let { samples } = wave;
        return a == null
          ? samples
          : samples.map((v,i) => v + a[i]);
      }, null);

      return samples;
    }


    get halfLifeSamples() {
      let r0 = this.resonators[0] || {};
      return r0.halfLifeSamples;
    }

    get r() {
      let r0 = this.resonators[0] || {};
      return r0.r;
    }

    sample(harmonics, opts={}) {
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
        let hs = resonator.sample({ frequency, nSamples, scale, phase, type, verbose, });
        for (let j = 0; j < hs.length; j++) {
          samples[j] += hs[j];
        }
      });

      return samples;
    }

  }

  module.exports = exports.Synthesizer = Synthesizer;

})(typeof exports === "object" ? exports : (exports = {}));
