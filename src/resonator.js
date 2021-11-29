(function(exports) {
  const { logger } = require('log-instance');
  const assert = require('assert');
  const Signal = require('./signal');

  class Resonator { // second order Helmholz resonator
    constructor(opts={}) {
      let {
        sampleRate = 22050,   // Common sample rate for speech MP3
        frequency = 0,       
        phase = 0,            // phase at t=0
        r,                    // ZIR exponential decay
        halfLifeSamples,
        y1,                   // output at t-1
        y2,                   // output at t-2
        scale = 1,            // peak amplitude
        initialScale = 0,     // prior state
      } = opts;
      assert(r == null || halfLifeSamples == null, `[E_HALFLIFESAMPLES_R] mutually exclusive`);
      if (r == null && halfLifeSamples == null) {
        r = 1;  // perfect non-decaying resonator
      } else if (r == null) {
        r = Resonator.halfLifeDecay(halfLifeSamples);
      }
      assert(1 < sampleRate, `[E_SAMPLERATE_NAN] expected positive number`);
      assert(0 <= frequency, `[E_FREQUENCY_NAN] expected >= 0`);
      assert(!isNaN(r) && 0 <= r <= 1, `[E_R] expected r:${r} between [0,1]`);
      assert(!isNaN(phase), `[E_PHASE_NAN] expected number:${phase}`);

      let samplePeriod = 1/sampleRate;

      Object.assign(this, { 
        r, frequency, sampleRate, samplePeriod, y1, y2, scale, phase, 
      });

      y1 == null && (this.y1 = this.yk(-1, 1, initialScale));
      y2 == null && (this.y2 = this.yk(-2, 1, initialScale));
      assert(!isNaN(this.y1), `[E_Y1_NAN] expected number:${y1}`);
      assert(!isNaN(this.y2), `[E_Y2_NAN] expected number:${y2}`);
    }

    static halfLifeSamples(decay) {
      return decay === 1 ? Infinity : Math.log(0.5) / Math.log(decay);
    }

    static halfLifeDecay(halfLifeSamples) {
      return halfLifeSamples === Infinity ? 1 : Math.pow(0.5, 1/halfLifeSamples);
    }

    get halfLifeSamples() {
      return Resonator.halfLifeSamples(this.r);
    }

    set halfLifeSamples(value) {
      this.r = Resonator.halfLifeDecay(value);
    }

    clear() {
      this.y1 = 0;
      this.y2 = 0;
    }

    yk(k, decay=this.r, scale=this.scale) {
      let { phase, frequency, sampleRate } = this;
      let beta = 2 * Math.PI * frequency / sampleRate;
      return scale * Math.pow(decay, k) * Math.cos(k*beta + phase);
    }

    sample(opts={}) {
      let { 
        sampleRate, 
        frequency: frequency1,
        halfLifeSamples: halfLifeSamples1,
        scale:scale1, 
        phase:phase1,
      } = this;
      let {
        frequency = frequency1,
        nSamples = 1,
        phase = phase1,
        halfLifeSamples = halfLifeSamples1,
        scale = scale1,
        type = Array,
        verbose = false,
      } = opts;

      Object.assign(this, {frequency, halfLifeSamples, scale, phase});
      let { r: decay } = this;
      let samples = Signal.cosineWave({frequency, scale, phase, nSamples, sampleRate});
      let beta = 2 * Math.PI * frequency / sampleRate;
      let ym1 = this.y1 - this.yk(-1,1);
      let ym2 = this.y2 - this.yk(-2,1);
      let a0 = decay * decay;
      let a1 = - 2 * decay * Math.cos(beta);
      for (let k = 0; k < nSamples; k++) {
        let yDecay = -ym1*a1 - ym2*a0;
        samples[k] += yDecay;
        ym2 = ym1;
        ym1 = yDecay;
      }
      this.y2 = samples[nSamples-2];
      this.y1 = samples[nSamples-1];

      return samples;
    }

  }

  module.exports = exports.Resonator = Resonator;

})(typeof exports === "object" ? exports : (exports = {}));
