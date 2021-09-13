(function(exports) {
  const { logger } = require('log-instance');
  const Compander = require('./compander');
  const Int16Frames = require(`./int16-frames`);
  const Signal = require('./signal');

  class Mdct {
    constructor(opts={}) {
      // https://en.wikipedia.org/wiki/Modified_discrete_cosine_transform;

      let frameSize = opts.frameSize || 32;
      if (frameSize < 2) {
        throw new Error(`minimum frameSize is 2`);
      }

      let N  = frameSize / 2;
      let cos_kn = [];
      for (let k = 0; k < N; k++) {
        let cosk = cos_kn[k] = [];
        for (let n = 0; n < 2*N ; n++) {
          cosk[n] = Math.cos(
            (Math.PI / N) *
            (n + 1/2 + N/2) *
            (k + 1/2)
          )
        }
      }

      let window = this.window = opts.window || Mdct.WINDOW_RECT;
      this.window_n = [];
      for (let n=0; n<2*N; n++) {
        this.window_n[n] = window(n,N);
      }

      let scale = opts.scale;
      if (!scale) {
        let sum = 0;
        for (let n=0; n < frameSize; n++) {
          sum += -32768 * cos_kn[0][n];
        }
        scale = 2*sum / Compander.ALGORITHM_RANGE('a-int8');
      }

      let enc_kn = [];
      let dec_kn = [];
      let sqrt2 = Math.sqrt(2); // Princen-Bradley condition 
      //let sqrt05 = Math.sqrt(1/2); // Princen-Bradley condition 
      for (let k = 0; k < N; k++) {
        let enck = enc_kn[k] = [];
        let deck = dec_kn[k] = [];
        for (let n = 0; n < 2*N ; n++) {
          let coskn = Math.cos( (Math.PI / N) * (n + 1/2 + N/2) * (k + 1/2))
          let wn = this.window_n[n];
          enck[n] = wn * coskn / scale;
          deck[n] = (wn * coskn * scale)/N;
          enck[n] = sqrt2 * wn * coskn / scale;
          deck[n] = sqrt2 * wn * coskn * scale/N;
        }
      }


      this.frameSize = frameSize;
      this.enc_kn = enc_kn;
      this.dec_kn = dec_kn;
      this.coeffsPerFrame = N;
      this.scale = scale;
    }

    static WINDOW_RECT(n,N) {
      //return 1;
      return Math.sqrt(0.5);
    }

    static WINDOW_MP3(n,N) {
      return Math.sin( (Math.PI/(2*N)) * (n + 1/2));
    }

    static WINDOW_VORBIS(n,N) {
      let mp3 = Mdct.WINDOW_MP3(n,N);
      return Math.sin( (Math.PI/2) * mp3 * mp3);
    }

    static get WINDOWS() {
      return [
        Mdct.WINDOW_RECT,
        Mdct.WINDOW_MP3,
        Mdct.WINDOW_VORBIS,
      ];
    }

    encodeFrame(int16Frame, opts={}) {
      let { enc_kn, coeffsPerFrame, frameSize, scale } = this;
      let { type=Float64Array } = opts;
      let encoded = new type(coeffsPerFrame);
      for (let k = 0; k < coeffsPerFrame; k++) {
        let sum = 0;
        for (let n=0; n < frameSize; n++) {
          sum += int16Frame[n] * enc_kn[k][n];
        }
        encoded[k] = sum; ///scale;
      }
      return encoded;
    }

    decodeFrame(int16Codes) {
      let { frameSize, dec_kn, coeffsPerFrame, scale } = this;
      let frame = [];
      for (let n=0; n < frameSize; n++) {
        let sum = 0;
        for (let k=0; k < coeffsPerFrame; k++) {
          sum += int16Codes[k] * dec_kn[k][n];
        }
        frame.push(Math.round(sum));
      }
      return frame;
    }

    encodeFrames(itInt16, opts={}) {
      let { coeffsPerFrame, frameSize } = this;
      let { verbose, type } = opts;
      let zeros = new Int16Array(coeffsPerFrame);
      let that = this;
      let frameGenerator = function*() {
        let itSignal = new Int16Frames(itInt16, frameSize).frames();
        let prevFrame = zeros;
        for (let frame; prevFrame.length; yield that.encodeFrame(frame, opts)){
          if (prevFrame.length === coeffsPerFrame) {
            let { value, done } = itSignal.next();
            if (done) {  
              frame = new Int16Array([...prevFrame, ...zeros]);
              prevFrame = [];
              verbose && console.log(`mdct.encodeFrames#3`, frame.join(','));
            } else {
              frame = new Int16Array([...prevFrame, ...value.slice(0, coeffsPerFrame)]);
              prevFrame = value;
              verbose && console.log(`mdct.encodeFrames#1`, frame.join(','));
            }
          } else if (prevFrame.length === frameSize) {
            frame = prevFrame;
            verbose && console.log(`mdct.encodeFrames#2`, frame.join(','));
            prevFrame = prevFrame.slice(coeffsPerFrame, frameSize);
          }
        }
      };
      return frameGenerator();
    }

    decodeFrames(itCoeffs, opts={}) { 
      let { coeffsPerFrame, frameSize, scale } = this;
      itCoeffs = Signal.toIterator(itCoeffs);
      let { verbose } = opts;
      let zeros = new Int16Array(coeffsPerFrame);
      let that = this;
      let curFrame = [];
      let assertCoeffs = coeffs=>{
        if (coeffs.length) {
          let msg = [
            `Mdct.decodeFrames() expected groups of ${coeffsPerFrame} coefficients.`,
            `Found: ${coeffs.length}`
          ].join(' ');
          throw new Error(msg);
        }
        return true;
      }
      let frames = function*() {
        let nFrames = 0;
        for (let nFrames=0;;) {
          let { value:coeffs, done } = itCoeffs.next();
          if (done) { return; }
          let nextFrame = that.decodeFrame(coeffs, opts);
          nFrames++;
          verbose && console.log(`mdct.decodeFrames`, 
            [...coeffs].map(v=>v.toFixed(2)).join(', '), 
            '=>',
            nextFrame.join(', '));
          if (curFrame.length === frameSize) {
            for (let i=0; i<coeffsPerFrame; i++) {
              curFrame[i+coeffsPerFrame] += nextFrame[i];
            }
            if (nFrames%2) {
              yield curFrame;
            }
            curFrame = [
              ...curFrame.slice(-coeffsPerFrame), 
              ...nextFrame.slice(-coeffsPerFrame)];
          } else {
            curFrame = nextFrame;
          }
        }
      };

      return frames();
    } /* decodeFrames */

    toCoefficients(itInt16, opts={}) { // slow
      let that = this;
      let { coeffsPerFrame, frameSize } = this;
      let coeffGenerator = function*() {
        let coeffs;
        let itLappedFrames = that.encodeFrames(itInt16, opts);
        for (let iCoeff=coeffsPerFrame; ; iCoeff++) {
          if (iCoeff >= coeffsPerFrame) {
            let { value, done } = itLappedFrames.next();
            if ( done ) { return; }
            coeffs = value;
            iCoeff = 0;
          }
          yield coeffs[iCoeff];
        }
      };

      return coeffGenerator(); 
    }

    fromCoefficients(itCoeffs, opts={}) { // slow
      let { coeffsPerFrame, frameSize, scale } = this;
      itCoeffs = Signal.toIterator(itCoeffs);
      let { verbose } = opts;
      let zeros = new Int16Array(coeffsPerFrame);
      let that = this;
      let curFrame = [];
      let assertCoeffs = coeffs=>{
        if (coeffs.length) {
          let msg = [
            `Mdct.fromCoefficients() expected groups of ${coeffsPerFrame} coefficients.`,
            `Found: ${coeffs.length}`
          ].join(' ');
          throw new Error(msg);
        }
        return true;
      }
      let frames = function*() {
        let nFrames = 0;
        for (let nFrames=0;;) {
          let coeffs = [];
          for (let i=0; i< coeffsPerFrame; i++) {
            let { value, done } = itCoeffs.next();
            if (done && assertCoeffs(coeffs)) { return; }
            coeffs.push(value);
          }
          let nextFrame = that.decodeFrame(coeffs, opts);
          nFrames++;
          verbose && console.log(`decode`, 
            [...coeffs].map(v=>v.toFixed(2)).join(', '), 
            '=>',
            nextFrame.join(', '));
          if (curFrame.length === frameSize) {
            for (let i=0; i<coeffsPerFrame; i++) {
              curFrame[i+coeffsPerFrame] += nextFrame[i];
            }
            if (nFrames%2) {
              yield curFrame;
            }
            curFrame = [
              ...curFrame.slice(-coeffsPerFrame), 
              ...nextFrame.slice(-coeffsPerFrame)];
          } else {
            curFrame = nextFrame;
          }
        }
      };

      return function*() {
        let itFrames = frames();
        let frame;
        let iFrame = 0;
        for (;;) {
          if (!frame || iFrame >= frameSize) {
            let { value, done } = itFrames.next();
            if (done) { return; }
            frame = value;
            iFrame = 0;
          }
          yield frame[iFrame++];
        }
      }();
    } /* fromCoefficients */

    encode(signalInt16, opts={}) {
      let { coeffsPerFrame, frameSize } = this;
      let { verbose, type=Float64Array } = opts;
      let nCoeffs = coeffsPerFrame + 
        frameSize * Math.round((signalInt16.length+frameSize-1)/frameSize);
      let coeffs = new type(nCoeffs);
      let iCoeff = 0;
      for (let frame of this.encodeFrames(signalInt16)) {
        for (let i = 0; i < frame.length; i++) {
          coeffs[iCoeff + i] = frame[i];
        }
        verbose && console.log(`encode${iCoeff}`, 
          JSON.stringify([...frame]), JSON.stringify([...coeffs]) );
        iCoeff += frame.length;
      };
      return coeffs;
    }

    decode(coeffs, opts={}) { 
      let { coeffsPerFrame, frameSize, scale } = this;
      let { 
        signalLength=coeffs.length,
        verbose, 
        type=Int16Array,
      } = opts;
      let signal = new type(signalLength);
      let zeros = new Int16Array(coeffsPerFrame);
      let that = this;
      let curFrame = [];
      let assertCoeffs = frameCoeffs=>{
        if (frameCoeffs.length) {
          let msg = [
            `Mdct.decode() expected groups of ${coeffsPerFrame} coefficients.`,
            `Found: ${frameCoeffs.length}`
          ].join(' ');
          throw new Error(msg);
        }
        return true;
      }
      let frames = function*() {
        let nFrames = 0;
        let itCoeffs = coeffs[Symbol.iterator]();
        for (let nFrames=0;;) {
          let frameCoeffs = [];
          for (let i=0; i< coeffsPerFrame; i++) {
            let { value, done } = itCoeffs.next();
            verbose && console.log(`itCoeffs`, {value, done});
            if (done && assertCoeffs(frameCoeffs)) { return; }
            frameCoeffs.push(value);
          }
          let nextFrame = that.decodeFrame(frameCoeffs, opts);
          nFrames++;
          verbose && console.log(`decode`, 
            [...frameCoeffs].map(v=>v.toFixed(2)).join(', '), 
            '=>',
            nextFrame.join(', '));
          if (curFrame.length === frameSize) {
            for (let i=0; i<coeffsPerFrame; i++) {
              curFrame[i+coeffsPerFrame] += nextFrame[i];
            }
            if (nFrames%2) {
              yield curFrame;
            }
            curFrame = [
              ...curFrame.slice(-coeffsPerFrame), 
              ...nextFrame.slice(-coeffsPerFrame)];
          } else {
            curFrame = nextFrame;
          }
        }
      };

      let itFrames = frames();
      for (let iSignal=0; iSignal < signalLength; ) {
        let { value:frame, done } = itFrames.next();
        if (done) { break; }
        verbose && console.log(`decoded ${iSignal} frame`, JSON.stringify(frame));
        for (let i = 0; iSignal<signal.length && i < frame.length;) {
          signal[iSignal++] = frame[i++];
        }
      }

      return signal;
    } /* decode */
  }

  module.exports = exports.Mdct = Mdct;

})(typeof exports === "object" ? exports : (exports = {}));
