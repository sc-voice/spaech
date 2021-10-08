(function(exports) {
  const { logger } = require('log-instance');
  const assert = require('assert');
  const Compander = require('./compander');
  const Int16Frames = require(`./int16-frames`);
  const Signal = require('./signal');
  const FREQ_CHILD = 300;
  const FREQ_WOMAN = 255;     // adult woman speech 165-255Hz
  const FREQ_MAN = 85;        // adult male speech 85-155Hz
  const SAMPLE_RATE = 22050;  // 2 * 3**2 * 5**2 * 7**2
  const TAU_MIN = Math.round(SAMPLE_RATE/FREQ_CHILD);       // 74
  const TAU_MIN_ADULT = Math.round(SAMPLE_RATE/FREQ_WOMAN); // 86
  const TAU_MAX = Math.round(SAMPLE_RATE/FREQ_MAN);         // 259
  const WINDOW_25MS = Math.round(SAMPLE_RATE * 0.0025);      // 55

  // http://audition.ens.fr/adc/pdf/2002_JASA_YIN.pdf

  class YinPitch {
    constructor(args={}) {
      let {
        sampleRate = 22050,
        diffMax = 0.1,
        window = WINDOW_25MS,
        fMin = FREQ_MAN,
        fMax = FREQ_CHILD,
      } = args;
      assert(Number.isInteger(window) && 0<window, 
        `[E_WINDOW] window size must be positive integer:${window}`);

      Object.assign(this, {
        diffMax,
        fMin,
        fMax,
        sampleRate,
        tauMin: Math.round(sampleRate/fMax)-1,
        tauMax: Math.round(sampleRate/fMin)+2,
        window,
      });
    }

    static interpolateParabolic(x,y) {
      let x10 = x[1] - x[0];
      let x12 = x[1] - x[2];
      let y10 = y[1] - y[0];
      let y12 = y[1] - y[2];
      let numerator = x10**2 * y12 - x12**2 * y10;
      let denominator = x10*y12 - x12*y10;
      return x[1] - 0.5 * numerator / denominator;
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
      return (
        this.autoCorrelate(samples, t,0) 
        + this.autoCorrelate(samples, t+tau, 0) 
        - 2*this.autoCorrelate(samples, t, tau)
      )
    }

    pitch(samples) {
      assert(Array.isArray(samples) && 0<samples.length, `[E_SAMPLES] expected signal samples`);
      let { window, tauMin, tauMax, sampleRate, diffMax } = this;
      let acf = [...new Int8Array(tauMin)].fill(diffMax+1); // ignore tau below tauMin
      let t = 0;
      let tauEst = undefined;
      for (let tau = tauMin; tau < tauMax; tau++) {
        let v = this.acfDifference(samples, t, tau);
        acf.push(v);
        if (tauEst==null || tau < tauMin) {
          tauEst = tauMin <= tau ? tau : undefined;
        } else if (acf[tau] < acf[tauEst]) {
          tauEst = tau || undefined;
        } else if (acf[tauEst] <= diffMax) {
          break;
        }
      }

      let x = [ tauEst-1, tauEst, tauEst+1 ];
      let y = x.map(x=>acf[x]);
      let tau = YinPitch.interpolateParabolic(x,y);
      let pitch = sampleRate/tau;
      let pitchEst = sampleRate/tauEst;

      return { acf, pitch, pitchEst, tau, tauEst };
    }

  }

  module.exports = exports.YinPitch = YinPitch;

})(typeof exports === "object" ? exports : (exports = {}));
