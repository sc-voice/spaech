(function(exports) {
  const { logger } = require('log-instance');
  const Signal = require('./signal');

  class Int16Frames {
    constructor(data, frameSize, increment=frameSize) {
      if (!frameSize || frameSize < 0) {
        throw new Error(`Expected positive frameSize:${frameSize}`);
      }
      this.frameSize = frameSize;
      this.int16s = Signal.toInt16Array(data);
    }

    [Symbol.iterator]() {
      return this.frames();
    }

    * frames() {
      let { int16s, frameSize } = this;
      let iEnd = frameSize * Math.floor(int16s.length / frameSize);
      for (var iFrame=0; iFrame < iEnd; iFrame += frameSize) {
        yield int16s.slice(iFrame, iFrame+frameSize);
      }
      if (int16s.length !== iEnd) { // partial frame
        let frame = new Int16Array(frameSize);
        for (let i = 0; i<frameSize; i++) {
          frame[i] = int16s[i+iEnd];
        }
        yield frame;
      }
      return;
    }

  }

  module.exports = exports.Int16Frames = Int16Frames;

})(typeof exports === "object" ? exports : (exports = {}));
