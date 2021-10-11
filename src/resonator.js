(function(exports) {
  const { logger } = require('log-instance');
  const assert = require('assert');

  class Resonator { // second order Helmholz resonator
    constructor(opts={}) {
      this.clear();
      let {
        sampleRate = 22050, // Common sample rate for speech MP3
        frequency = 200,    // Median adult woman speech frequency
        r=1,                // pole radius [0,1]
        y1=this.y1,         // output at t-1
        y2=this.y2,         // output at t-2
        x1=this.x1,         // input at t-1
        x2=this.x2,         // input at t-2
      } = opts;

      let samplePeriod = 1/sampleRate;

      Object.assign(this, { r, frequency, sampleRate, samplePeriod, x1, x2, y1, y2, });
    }

    clear() {
      this.y1 = 0;
      this.y2 = 0;
      this.x1 = 0;
      this.x2 = 0;
    }

    step(x0) {
      // https://www.music.mcgill.ca/~gary/307/week10/node4.html
      let { y1, y2, x1, x2, r, frequency, samplePeriod } = this;
      let a1 = -2 * r * Math.cos(2*Math.PI*frequency*samplePeriod);
      let r2 = r * r;
      let a2 = r2;
      let b0 = (1 - r2)/2;
      //let b1 = 0;
      let b2 = -b0;
      //let y0 = -a1*y1 - a2*y2 + b0*x0 + b1*x1 + b2*x2;
      let y0 = -a1*y1 - a2*y2 + b0*x0 + b2*x2;
      //console.log(JSON.stringify({a1,a2,b0,b2,x0,x1,x2,y0,y1,y2,a1y1:a1*y1,a2y2:a2*y2,b0x0:b0*x0, b2x2:b2*x2}));
      this.x1 = x0;
      this.x2 = x1;
      this.y1 = y0;
      this.y2 = y1;
      return y0;
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
