(function(exports) {
  const { logger } = require('log-instance');
  const assert = require('assert');
  const Compander = require('./compander');
  const Int16Frames = require(`./int16-frames`);
  const Signal = require('./signal');

  class Mdct {
    constructor(opts={}) {
      // https://en.wikipedia.org/wiki/Modified_discrete_cosine_transform;

      logger.logInstance(this);
      let frameSize = opts.frameSize || 32;
      assert(frameSize % 2 === 0, `[E_FRAMESIZE_ODD] frameSize must be even: ${frameSize}`);
      assert(0 < frameSize, `[E_FRAMESIZE_PLUS] frameSize must be positive: ${frameSize}`);

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
      let { type=Float32Array } = opts;
      let encoded = new type(coeffsPerFrame);
      for (let k = 0; k < coeffsPerFrame; k++) {
        let sum = 0;
        for (let n=0; n < frameSize; n++) {
          sum += int16Frame[n] * enc_kn[k][n];
        }
        encoded[k] = sum; 
      }
      return encoded;
    }

    decodeFrame(coeffBlock) {
      let { frameSize, dec_kn, coeffsPerFrame, scale } = this;
      let frame = [];
      for (let n=0; n < frameSize; n++) {
        let sum = 0;
        for (let k=0; k < coeffsPerFrame; k++) {
          sum += coeffBlock[k] * dec_kn[k][n];
        }
        frame.push(Math.round(sum));
      }
      return frame;
    }

    encodeFrames(itInt16, opts={}) {
      let { coeffsPerFrame, frameSize } = this;
      let { verbose, } = opts;
      let zeros = new Int16Array(coeffsPerFrame);
      let that = this;
      let frameGenerator = function*() {
        let itSignal = new Int16Frames(itInt16, frameSize).frames();
        let frameBuf = zeros;
        for (let frame; frameBuf.length; ) {
          if (frameBuf.length === coeffsPerFrame) {
            let { value, done } = itSignal.next();
            if (done) {  
              frame = new Int16Array([...frameBuf, ...zeros]);
              verbose && that.info(`encodeFrames#3`, frame.join(','));
              let nonZeros = frame.slice(0).filter(v=>v).length;
              if (nonZeros < frameSize) {
                that.info(
                  `Emitting extra coefficient block for final signal frame with`,
                  `${nonZeros}/${frameSize} non-zero samples.`,
                  );
                let coeffs = that.encodeFrame(frame, opts);
                verbose && that.info(`encodeFrames#1`, frame.join(','), '=>', 
                  [...coeffs].map(v=>v.toFixed(2)).join(','));
                if (isNaN(coeffs[0])) { throw logger.error('NanPanic'); }
                yield coeffs;
              }
              frameBuf = [];
              break;
            } else { // frameBuf is half-full
              assert(frameBuf.length === coeffsPerFrame, 
                `[E_FRAMELENGTH1] Unexpected frame length:${frameBuf.length}`);
              frame = new Int16Array([...frameBuf, ...value.slice(0, coeffsPerFrame)]);
              frameBuf = value;
              let coeffs = that.encodeFrame(frame, opts);
              verbose && that.info(`encodeFrames#1`, frame.join(','), '=>', 
                [...coeffs].map(v=>v.toFixed(2)).join(','));
              yield coeffs;
            }
          } else {
            assert(frameBuf.length === frameSize, 
              `[E_FRAMELENGTH2] Unexpected frame length:${frameBuf.length}`);
            frame = frameBuf;
            frameBuf = frameBuf.slice(coeffsPerFrame, frameSize);
            let coeffs = that.encodeFrame(frame, opts);
            verbose && that.info(`encodeFrames#2`, frame.join(','), '=>',
              [...coeffs].map(v=>v.toFixed(2)).join(','));
            yield coeffs;
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
          throw that.error(
            `Mdct.decodeFrames() expected blocks of ${coeffsPerFrame} coefficients.`,
            `Found: ${coeffs.length}`);
        }
        return true;
      }
      let frames = function*() {
        let nBlocks = 0;
        for (let nBlocks=0;;) {
          let { value:coeffs, done } = itCoeffs.next();
          nBlocks++;
          if (done) { 
            verbose && that.info(`mdct.decodeFrames#3@${nBlocks} flush zero block`); 
            if (nBlocks%2) {
              yield curFrame;
            }
            return; 
          }
          let nextFrame = that.decodeFrame(coeffs, opts);
          if (curFrame.length === frameSize) {
            verbose && that.info(`mdct.decodeFrames#2@${nBlocks}`, 
              [...coeffs].map(v=>v.toFixed(2)).join(','), 
              '=>',
              nextFrame.join(','));
            for (let i=0; i<coeffsPerFrame; i++) {
              curFrame[i+coeffsPerFrame] += nextFrame[i];
            }
            if (nBlocks%2) {
              yield curFrame;
            }
            curFrame = [
              ...curFrame.slice(-coeffsPerFrame), 
              ...nextFrame.slice(-coeffsPerFrame)];
          } else {
            verbose && that.info(`mdct.decodeFrames#1@${nBlocks}`, 
              [...coeffs].map(v=>v.toFixed(2)).join(','), 
              '=>',
              nextFrame.join(','));
            curFrame = nextFrame;
          }
        }
      };

      return frames();
    } /* decodeFrames */

    encode(signalInt16, opts={}) {
      let { coeffsPerFrame, frameSize } = this;
      let { verbose, type=Float64Array } = opts;
      //let nCoeffs = coeffsPerFrame + 
        //frameSize * Math.round((signalInt16.length+frameSize-1)/frameSize);
      let nCoeffs = frameSize * Math.floor((signalInt16.length+frameSize-1)/frameSize);
      let coeffs = new type(nCoeffs);
      let iCoeff = 0;
      for (let block of this.encodeFrames(signalInt16, opts)) {
        for (let i = 0; i < block.length; i++) {
          coeffs[iCoeff + i] = block[i];
        }
        verbose && this.info(`encode@${iCoeff}`, 
          [...coeffs].slice(iCoeff,iCoeff+block.length).map(v=>v.toFixed(2)).join(','));
        iCoeff += block.length;
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
            `[E_MDCT_DECODE_GROUPS]`,
            `Expected groups of ${coeffsPerFrame} coefficients.`,
            `Found: ${frameCoeffs.length}`
          ].join(' ');
          throw that.error(msg);
        }
        return true;
      }
      let frames = function*() {
        let nBlocks = 0;
        let itCoeffs = coeffs[Symbol.iterator]();
        for (let nBlocks=0;;) {
          let frameCoeffs = [];
          for (let i=0; i< coeffsPerFrame; i++) {
            let { value, done } = itCoeffs.next();
            if (done && assertCoeffs(frameCoeffs)) { 
              nBlocks++;
              assert(curFrame.length === frameSize,
                `[E_FRAMESIZE] Expected frameSize:${frameSize} actual:${curFrame.length}`);
              for (let i=0; i<coeffsPerFrame; i++) {
                curFrame[i+coeffsPerFrame] += zeros[i];
              }
              if (nBlocks%2) {
                verbose && that.info(`decode#1@${nBlocks} zeros =>`,
                  [...curFrame].map(v=>v&&v.toFixed(2)||v).join(',') );
                yield curFrame;
              }
              return; 
            }
            frameCoeffs.push(value);
          }
          let nextFrame = that.decodeFrame(frameCoeffs, opts);
          nBlocks++;
          if (curFrame.length === frameSize) {
            for (let i=0; i<coeffsPerFrame; i++) {
              curFrame[i+coeffsPerFrame] += nextFrame[i];
            }
            verbose && that.info(`decode#1@${nBlocks}`, 
              [...frameCoeffs].map(v=>v.toFixed(2)).join(','), 
              '=>',
              curFrame.join(','));
            if (nBlocks%2) {
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
