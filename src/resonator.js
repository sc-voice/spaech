(function(exports) {
  const { logger } = require('log-instance');
  const assert = require('assert');

  class Resonator { // second order Helmholz resonator
    constructor(opts={}) {
      this.clear();
      let {
        sampleRate = 22050, // Common sample rate for speech MP3
        frequency = 200,    // Median adult woman speech frequency
        r=0.995,            // pole radius [0,1]
        y1=this.y1,         // output at t-1
        y2=this.y2,         // output at t-2
        x1=this.x1,         // input at t-1
        x2=this.x2,         // input at t-2
        scale = 1,          /// peak amplitude
        t=0,
        tween = false,
      } = opts;
      assert(1 < sampleRate, `[E_SAMPLERATE_NAN] expected positive number`);
      assert(0 < frequency, `[E_FREQUENCY_NAN] expected positive number`);
      assert(Array.isArray(r) || !isNaN(r) && 0 <= r <= 1, `[E_R] expected r:${r} between [0,1]`);
      assert(!isNaN(x1), `[E_X1_NAN] expected number:${x1}`);
      assert(!isNaN(x2), `[E_X2_NAN] expected number:${x2}`);
      assert(!isNaN(y1), `[E_Y1_NAN] expected number:${y1}`);
      assert(!isNaN(y2), `[E_Y2_NAN] expected number:${y2}`);

      let samplePeriod = 1/sampleRate;

      Object.assign(this, { 
        r, frequency, sampleRate, samplePeriod, x1, x2, y1, y2, scale, t, tween,
      });
    }

    clear() {
      this.y1 = 0;
      this.y2 = 0;
      this.x1 = 0;
      this.x2 = 0;
      this.t = 0;
    }

    step(x0) {
      // https://www.music.mcgill.ca/~gary/307/week10/node4.html
      let { y1, y2, x1, x2, r, frequency, samplePeriod } = this;
      let a1 = -2 * r * Math.cos(2*Math.PI*frequency*samplePeriod);
      let r2 = r * r;
      let a2 = r2;
      let feedback = a1*y1 + a2*y2;

      let b0 = (1 - r2)/2;
      let b1 = 0;
      let b2 = -b0;
      let feedforward = b0*x0 + b1*x1 + b2*x2;

      let y0 = feedforward - feedback;
      this.x1 = x0;
      this.x2 = x1;
      this.y1 = y0;
      this.y2 = y1;
      this.t++;

      return y0;
    }

    resonate(opts={}) {
      let { sampleRate, frequency:frequency1, r:r1, scale:scale1, } = this;
      let {
        frequency:frequency2 = frequency1,
        nSamples = 1,
        phase=0,
        r:r2 = r1,
        scale:scale2 = scale1,
        tStart = this.t,
        tween = this.tween,
        type = Array,
        verbose = false,
      } = opts;

      if (!tween) {
        this.frequency = frequency1 = frequency2;
        this.r = r1 = r2;
        this.scale = scale1 = scale2;
      }
      let samples = type === Array
         ? [...new Int8Array(nSamples)]
         : new type(nSamples);
      if (nSamples === 1) {
        assert(frequency2 === frequency1, 
          `[E_FREQUENCY2_SINGLE] frequency2 expected:${frequency1} actual:${frequency2}`);
        assert(r2 === r1, `[E_R2_SINGLE] r2 expected:${r1} actual:${r2}`);
        assert(scale2 === scale1, `[E_SCALE2_SINGLE] scale2 expected:${scale1} actual:${scale2}`);
        assert(!isNaN(phase), `[E_PHASE_NAN] expected number:${phase}`);
        this.r = r1;
        assert(!isNaN(scale1), `[E_SCALE1_NAN] actual:${scale1}`);
        assert(!isNaN(frequency1), `[E_SCALE1_NAN] actual:${frequency1}`);
        let x0 = scale1 * Math.sin(2*Math.PI*frequency1*tStart/sampleRate+phase);
        samples[0] = this.step(x0);
        return samples;
      }
      assert(0 < nSamples, `[E_NSAMPLES] expected at least 1 nSamples:${nSamples}`);
      let tEnd = nSamples-1;
      for (let tSample = 0; tSample <= tEnd; tSample++) {
        let frequency = frequency1 === frequency2
          ? frequency1
          : ((tEnd - tSample)*frequency1 + tSample*frequency2)/tEnd;
        let scale = scale1 === scale2
          ? scale1
          : ((tEnd - tSample)*scale1 + tSample*scale2)/tEnd;
        let r = r1 === r2 
          ? r1
          : ((tEnd - tSample)*r1 + tSample*r2)/tEnd;
        let t= (tStart + tSample)/sampleRate;
        let v = scale2 * Math.sin(2*Math.PI*frequency2*t+phase);
        Object.assign(this, {frequency, r, scale});
        samples[tSample] = this.step(v);
      }
      return samples;
    }

    filter(iterable) {
      return this.createIterator(iterable);
    }

    *createIterator(iterable) {
      let iter = iterable[Symbol.iterator]();
      assert(iter != null && typeof iter.next === 'function', `[E_ITERABLE] Expected iterable)`);
      for(;;) {
        let { value, done } = iter.next();
        if (done) {
          break;
        }
        let y = this.step(value);
        yield y;
      }
    }

  }

  module.exports = exports.Resonator = Resonator;

})(typeof exports === "object" ? exports : (exports = {}));