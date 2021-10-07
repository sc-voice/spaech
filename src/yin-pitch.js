(function(exports) {
  const { logger } = require('log-instance');
  const assert = require('assert');
  const Compander = require('./compander');
  const Int16Frames = require(`./int16-frames`);
  const Signal = require('./signal');

  // http://audition.ens.fr/adc/pdf/2002_JASA_YIN.pdf

  class YinPitch {
    constructor(args={}) {
      let {
        sampleRate = 22050,
        tauEnd,
        window,
        fMin = 85, // male speech low
        fMax = 300, // child speech high
      } = args;
      assert(Number.isInteger(window) && 0<window, 
        `[E_WINDOW] window size must be positive integer:${window}`);
      tauEnd = tauEnd || Math.round(sampleRate/fMin);

      Object.assign(this, {
        fMin,
        fMax,
        sampleRate,
        tauEnd,
        window,
      });
    }

    autoCorrelate(samples, t, tau) {
      let { window} = this;
      assert(0<=t && t+window+tau<samples.length, 
        `[E_ACF_BOUNDS] autocorrelation bounds violation [${t}, ${t+window+tau}] `+
        `samples:${samples.length}`);

      let sum = 0;
      for (let i = t+1; i <= t+window; i++) {
        sum += samples[i] * samples[i+tau];
      }
      return sum;
    }

    acfDifference(samples, t, tau) {
      return this.autoCorrelate(samples, t,0) + this.autoCorrelate(samples, t+tau, 0) 
        - 2*this.autoCorrelate(samples, t, tau);
    }

    pitch(samples) {
      assert(Array.isArray(samples) && 0<samples.length, `[E_SAMPLES] expected signal samples`);
      let { window, tauEnd, sampleRate } = this;
      let diffs = [];
      let t = 0;
      let a = undefined;
      for (let tau = 0; tau < tauEnd; tau++) {
        let v = this.acfDifference(samples, t, tau);
        diffs.push(v);
        if (a==null || (diffs[tau] < diffs[a])) {
          a = tau || undefined;
        }
      }

      return sampleRate/a;
    }

  }

  module.exports = exports.YinPitch = YinPitch;

})(typeof exports === "object" ? exports : (exports = {}));
