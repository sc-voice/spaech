(function(exports) {
  const { logger } = require('log-instance');
  const { WaveFile } = require('wavefile');
  const assert = require('assert');

  class Signal {
    constructor(data, opts={}) {
      logger.logInstance(this);
      let {
        sampleRate,
      } = opts;
      if (data == null) {
        throw this.error('E_SIGNAL_ARRAY', 'Audio data signal array is required');
      }

      Object.assign(this, {
        data,
        sampleRate,
      });
    }

    static fromWav(buf) {
      let wf = new WaveFile(buf);
      let data = wf.getSamples(false, Int16Array);
      let { sampleRate } = wf.fmt;
      return new Signal(data, {sampleRate});
    }

    static toInt16Array(data) {
      if (data.constructor.name === 'Int16Array') {
        return data;
      } else if (data.constructor.name === 'ArrayBuffer') {
        return new Int16Array(data);
      } else if (data.constructor.name === 'Buffer') {
        throw this.error('E_SIG_NODEJS_BUF', `NodeJS Buffer is not supported`);
      } else if (data.buffer && data.buffer.constructor.name === 'ArrayBuffer') {
        return new Int16Array(data);
      } else if (data instanceof Array) {
        return new Int16Array(data);
      } else {
        throw logger.error('E_SIG_INT16', 'cannot convert to Int16Array');
      }
    }

    static toIterator(data) {
      if (typeof data[Symbol.iterator] === 'function') {
        return data[Symbol.iterator]();
      } else if (typeof data.next === 'function') {
        return data;
      } else if (data instanceof ArrayBuffer) {
        return new Uint8Array(data)[Symbol.iterator]();
      } else {
        throw this.error('E_SIG_ITER', 'Expected number iterable or iterator');
      }
    }

    static stats(data) {
      let sorted = [...data];
      let count = data.length;
      sorted.sort((a,b) => a-b); // Default comparator compares strings
      let iMin = 0;
      let min = data[iMin];
      let iMax = 0;
      let max = data[iMax];
      let sum = data.reduce((a,n)=>a+n,0);
      let avg = sum/count;
      let iHalf = Math.ceil(count/2);
      let median = iHalf == 0
        ? sorted[iHalf]
        : (count %2
          ? sorted[iHalf-1]
          : (sorted[iHalf]+sorted[iHalf-1])/2
        );
      let sqDev = 0;
      for (let i=0; i<count; i++) {
        let d = data[i];
        let dev = d-avg;
        sqDev += dev*dev;
        if (d < min) {
          min = d;
          iMin = i;
        }
        if (max < d) {
          max = d;
          iMax = i;
        }
      }
      let stdDev = Math.sqrt(sqDev/count);

      return { 
        count, 
        min, 
        max, 
        iMin,
        iMax,
        sum, 
        avg, 
        median, 
        stdDev,
      }
    }

    static rmsErr(a,b) {
      let sum = 0;
      let itA = Signal.toIterator(a);
      let itB = Signal.toIterator(b);
     
      for (var n=0; ;n++) {
        let { value:av, done:adone } = itA.next();
        let { value:bv, done:bdone } = itB.next();
        if (adone || bdone) { break; }
        let dv = av-bv;
        sum += dv*dv;
      }

      return n ? Math.sqrt(sum / n) : 0;
    }

    toWav(args={}) {
      let {
        numChannels = 1,
        sampleRate = 22050,
        bitDepth = '16',
      } = args;
      let wav = new WaveFile();
      let { data:samples } = this;
      wav.fromScratch(numChannels, sampleRate, bitDepth, samples);
      return wav.toBuffer();
    }

    stats() {
      let { data } = this;
      return  Signal.stats(data);
    }

    rmsErr(thatData) {
      let { data } = this;
      return Signal.rmsErr(data, thatData);
    }

    split(opts={}) {
      let { data } = this;
      let { threshold=1, dampen=0, verbose, blockSize=1 } = opts;
      let groups = [];
      let sigStart;
      let zeroStart;
      const ZERO = '0';
      const SIG_MAYBE = '1?';
      const SIGNAL = '1';
      const ZERO_MAYBE = '0?';
      let state = ZERO;
      for (let i = 0; i < data.length; i++) {
        let v = data[i];
        switch (state) {
        case ZERO: 
          if (threshold <= Math.abs(v)) {
            sigStart = i;
            state = dampen ? SIG_MAYBE : SIGNAL;
          }
          break;
        case SIG_MAYBE:
          if (Math.abs(v) < threshold) {
            state = ZERO;
          } else if (dampen <= i - sigStart) {
            state = SIGNAL;
          }
          break;
        case SIGNAL: 
          if (Math.abs(v) < threshold) {
            zeroStart = i;
            if (dampen) {
              state = ZERO_MAYBE;
            } else {
              let firstBlock = Math.floor(sigStart/blockSize);
              let endBlock = Math.ceil(zeroStart/blockSize);
              groups.push({
                start: firstBlock,
                length: endBlock - firstBlock,
              });
              state = ZERO;
            }
          }
          break;
        case ZERO_MAYBE: 
          if (threshold <= Math.abs(v)) {
            state = SIGNAL;
          } else if (dampen <= i - zeroStart) {
              let firstBlock = Math.floor(sigStart/blockSize);
              let endBlock = Math.ceil(zeroStart/blockSize);
            groups.push({
              start: firstBlock,
              length: endBlock - firstBlock,
            });
            state = ZERO;
            i = zeroStart;
          }
          break;
        }
        verbose && console.log(`split`, {v, i, state, sigStart, zeroStart});
      }
      if (state === SIGNAL) {
        let firstBlock = Math.floor(sigStart/blockSize);
        groups.push({
          start: firstBlock,
          length: Math.ceil(data.length/blockSize) - firstBlock,
        });
      }
      verbose && console.log(`split end`); 
      return groups;
    }

  }

  module.exports = exports.Signal = Signal;

})(typeof exports === "object" ? exports : (exports = {}));
