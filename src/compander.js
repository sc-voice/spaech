(function(exports) {
  const { logger } = require('log-instance');
  const Signal = require('./signal');
  var ALAW_CODE_MAP;

  class Compander {
    constructor(opts={}) {
      this.name = opts.name || this.constructor.name;
      this.scale = opts.scale;
      this.algorithm = opts.algorithm || "a-law";
      this.range = opts.range || Compander.ALGORITHM_RANGE(this.algorithm);
    }

    static get ALGORITHMS() { return [
        'a-law',  // A-Law standard
        'a-int8', // A-Law for int8 with zero support
    ]}

    static ALGORITHM_RANGE(algorithm) {
      if (algorithm === 'a-int8') {
        return 2*3904;
      } 
      if (algorithm === 'a-law') {
        return 2*4032;
      }

      throw new Error(`unknown algorithm:${this.algorithm}`);
    }

    valueToALawCode(value) {
      let { scale } = this;
      scale && (value /= scale);
      let sgn = 1;
      let mag = value;
      if (value < 0) {
        sgn = -1;
        mag = -value;
      }
      let aval = value;
      if (mag > 0xFFF) {
        aval = 0x7F;
      } else if (mag >= 0x800) {
        aval = ((mag >> 7) & 0x0F) | 0x70;
      } else if (mag >= 0x400) {
        aval = ((mag >> 6) & 0x0F) | 0x60;
      } else if (mag >= 0x200) {
        aval = ((mag >> 5) & 0x0F) | 0x50;
      } else if (mag >= 0x100) {
        aval = ((mag >> 4) & 0xf) | 0x40;
      } else if (mag >= 0x080) {
        aval = ((mag >> 3) & 0xf) | 0x30;
      } else if (mag >= 0x040) {
        aval = ((mag >> 2) & 0xf) | 0x20;
      } else if (mag >= 0x020) {
        aval = ((mag >> 1) & 0xf) | 0x10;
      } else {
        aval = mag >> 1;
      }
      if (sgn < 0) {
        aval |= 0x0080;
      }
      return aval;
    }

    aLawCodeToValue(code) {
      if (!ALAW_CODE_MAP) {
        ALAW_CODE_MAP = {};
        for (let c=0; c<=0x0F; c++) {
          let v = ((c&0xf) << 1) | 1;
          ALAW_CODE_MAP[c] = v;
          ALAW_CODE_MAP[c|0x80] = -v;
        }
        for (let c=0x10; c<=0x1F; c++) {
          let v = ((c&0xf) << 1) | 0x21;
          ALAW_CODE_MAP[c] = v;
          ALAW_CODE_MAP[c|0x80] = -v;
        }
        for (let c=0x20; c<=0x2F; c++) {
          let v = ((c&0xf) << 2) | 0x42;
          ALAW_CODE_MAP[c] = v;
          ALAW_CODE_MAP[c|0x80] = -v;
        }
        for (let c=0x30; c<=0x3F; c++) {
          let v = ((c&0xf) << 3) | 0x84;
          ALAW_CODE_MAP[c] = v;
          ALAW_CODE_MAP[c|0x80] = -v;
        }
        for (let c=0x40; c<=0x4F; c++) {
          let v = ((c & 0xf) << 4) | 0x108;
          ALAW_CODE_MAP[c] = v;
          ALAW_CODE_MAP[c|0x80] = -v;
        }
        for (let c=0x50; c<=0x5F; c++) {
          let v = ((c&0xf) << 5) | 0x210;
          ALAW_CODE_MAP[c] = v;
          ALAW_CODE_MAP[c|0x80] = -v;
        }
        for (let c=0x60; c<=0x6F; c++) {
          let v = ((c&0xf) << 6) | 0x420;
          ALAW_CODE_MAP[c] = v;
          ALAW_CODE_MAP[c|0x80] = -v;
        }
        for (let c=0x70; c<=0x7F; c++) {
          let v = ((c&0xf) << 7) | 0x840;
          ALAW_CODE_MAP[c] = v;
          ALAW_CODE_MAP[c|0x80] = -v;
        }
        //console.log(ALAW_CODE_MAP);
      }

      let { scale } = this;
      let value =  ALAW_CODE_MAP[code];
      return scale ? value * scale : value;
    }

    valueToAInt8Code(value) {
      let { scale=1 } = this;
      let code = 0;
      let alaw;
      if (value < -scale/2) {
        alaw = this.valueToALawCode(-value);
        code = -(1+alaw);
      } else if (scale/2 < value) {
        alaw = this.valueToALawCode(value);
        code = Math.min(0x7f,1+alaw);
      }

      return code;
    }

    aInt8CodeToValue(code) {
      if (code > 0) {
        return this.aLawCodeToValue(code-1);
      }
      if (code < 0) {
        return -this.aLawCodeToValue(-(code+1));
      }
      return 0;
    }

    codeToValue(code) {
      let { algorithm } = this;
      if (algorithm === "a-law") {
        return this.aLawCodeToValue(code);
      } else if (algorithm === "a-int8") {
        return this.aInt8CodeToValue(code);
      }
      throw new Error(`cannot encode algorithm:${algorithm}`);
    }

    valueToCode(value) {
      let { algorithm } = this;
      if (algorithm === "a-law") {
        return this.valueToALawCode(value);
      } else if (algorithm === "a-int8") {
        return this.valueToAInt8Code(value);
      }
      throw new Error(`cannot encode algorithm:${algorithm}`);
    }

    encodeALaw(data) {
      let ab = new ArrayBuffer(data.length);
      let encoded = new Uint8Array(ab);
      for (let i = 0; i < data.length; i++) {
        encoded[i] = this.valueToALawCode(data[i]);
      }
      return ab;
    }

    decodeALaw(codeArrayBuffer) {
      let codes = new Uint8Array(codeArrayBuffer);
      let that = this;
      let length = codeArrayBuffer.byteLength;
      return codes.reduce((a,code,i)=>{
        a[i] = that.aLawCodeToValue(code);
        return a;
      }, new Int16Array(length));
    }

    encodeAInt8(data) {
      let ab = new ArrayBuffer(data.length);
      let encoded = new Int8Array(ab);
      for (let i = 0; i < data.length; i++) {
        encoded[i] = this.valueToAInt8Code(data[i]);
      }
      return ab;
    }

    decodeAInt8(codeArrayBuffer) {
      let codes = new Int8Array(codeArrayBuffer);
      let that = this;
      let length = codeArrayBuffer.byteLength;
      return codes.reduce((a,code,i)=>{
        a[i] = that.aInt8CodeToValue(code);
        return a;
      }, new Int16Array(length));
    }

    encode(data) {
      let { algorithm } = this;
      if (algorithm === "a-law") {
        return this.encodeALaw(data);
      } else if (algorithm === "a-int8") {
        return this.encodeAInt8(data);
      }
      throw new Error(`cannot encode algorithm:${algorithm}`);
    }

    decode(codeArrayBuffer) {
      let {algorithm } = this;
      if (algorithm === "a-law") {
        return this.decodeALaw(codeArrayBuffer);
      } else if (algorithm === "a-int8") {
        return this.decodeAInt8(codeArrayBuffer);
      }
      throw new Error(`cannot decode algorithm:${algorithm}`);
    }

  }

  module.exports = exports.Compander = Compander;

})(typeof exports === "object" ? exports : (exports = {}));
