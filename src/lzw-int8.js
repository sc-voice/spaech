(function(exports) {
  const { logger } = require('log-instance');
  const SRCNAME = __filename.split('/').pop().toUpperCase().replace(/\.js$/i, '');

  class LzwInt8 { // LZW => Lempel-Ziv-Voice
    constructor(opts={}) {
      let { 
        glossary = LzwInt8.GLOSSARY_INT8,
        dict = new Map(),
      } = opts;

      logger.logInstance(this);
      this.dict = dict;
      this.glossary = glossary instanceof Int8Array
        ? glossary
        : new Int8Array(glossary);

      this.compress(glossary, {isGlossary: true});
    }

    static get GLOSSARY_INT8() {
      let glossary = new Int8Array(256);
      for (let i=0; i<256; i++) {
        glossary[i] = i < 128 ? i : (127 - i);
      }
      return glossary;
    }

    compress(int8Iterable, opts={}) {
      // LZW algorithm:
      // 1. Initialize the dictionary with a glossary
      // 2. Find the longest string W in the dictionary that matches the current input.
      // 3. Emit the dictionary index for W to output and remove W from the input.
      // 4. Add W followed by the next symbol in the input to the dictionary.
      // 5. Go to Step 2.
      let { glossary } = this;
      let { verbose, dict, isGlossary=false} = opts;
      dict = dict || (isGlossary ? this.dict : new Map(this.dict));
      let data = int8Iterable instanceof Int8Array
        ? int8Iterable
        : new Int8Array(int8Iterable);
      let dataEnd = data.length;
      let compressed = [];

      // find longest match W
      for (let peekPos=0; peekPos+1 <= dataEnd;) {
        let w, key, peek, peekLen;
        for (peekLen=1; peekPos+peekLen <= dataEnd; peekLen++) {
          peek = data.slice(peekPos, peekPos+peekLen);
          key = peek.join(',');
          let value = dict.get(key);
          if (!value) { break; }
          w = value;
        }

        // Emit the dictionary index for W
        let entry = { code: dict.size, pos:peekPos, len: peekLen};
        isGlossary && (entry.isGlossary = true);
        if (w) {
          !isGlossary && (w.uses = (w.uses||0)+1);
        } else if (!isGlossary) {
          for (let kv of dict) { console.log(`w:${w}`, JSON.stringify(kv));}
          console.log(`${peek}`, {key, peekPos, peek, dataEnd}, dict.get(key));
          throw new Error(`new symbol found in message:${key} peekPos:${peekPos}`);
        }
        let code = w ? w.code : entry.code;
        compressed.push(code);

        if (dict.get(key) == null) {
          verbose && console.log(`compress=>${code} add`, 
            JSON.stringify({key, entry}));
          dict.set(key, entry);
        } else {
          verbose && console.log(`compress=>${code} hit`, 
            JSON.stringify({key, entry}));
        }
        //if (!w || peekPos+peekLen <= dataEnd) {
          //dict.set(key, entry);
        //}

        peekPos += w && w.len || 1;
      }

      //for (let kv of dict) console.log(`compress`, kv); }

      return compressed;
    }

    expand(int16Iterable, opts={}) {
      // The full dictionary is rebuilt during the decoding process 
      // the following way: after decoding a value and outputting a string, 
      // the decoder concatenates it with the first character of the next 
      // decoded string (or the first character of current string, if the 
      // next one can't be decoded; since if the next value is unknown, then it 
      // must be the value added to the dictionary in this iteration, and so its 
      // first character is the same as the first character of the current string),
      // and updates the dictionary with the new string. The decoder then 
      // proceeds to the next input (which was already read in the previous 
      // iteration) and processes it as before, and so on until it has exhausted 
      // the input stream.

      let { glossary, } = this;
      let { dict } = opts;
      dict = dict || new Map(this.dict.entries());
      let prevValue = [];
      let { verbose } = opts;
      if (verbose) { for (let kv of dict) console.log(`expand dict:`, kv); }
      let codes = [...this.dict].map(e=>e[1]);
      let expanded = int16Iterable.reduce((data,code,i)=>{
        let codeEntry = codes[code];
        let value;
        if (codeEntry) {
          let { isGlossary, pos, len } = codeEntry;
          value = !!isGlossary
            ? glossary.slice(pos, pos+len)
            : codeEntry.value;
        } else {
          value = [...prevValue, prevValue[0]];
        }
        let entryValue = [...prevValue, value[0]];
        let key = entryValue.join(',');
        data.push(...value);
        if (dict.get(key)) { 
          verbose && console.log(`expand[${i}]:${code} hit key:${key}=>`,
            JSON.stringify({value:value.join(',')}));
        } else {
          let newEntry = {code:dict.size, value:entryValue};
          verbose && console.log(`expand[${i}]:${code} add key:${key}=>`, 
            JSON.stringify({newEntry, value:value.join(',')}));
          dict.set(key, newEntry);
          codes.push(newEntry);
          // for (let kv of dict) console.log(`expand${i}:${code}`, kv); 
        }

        prevValue = value;

        return data;
      },[]);

      return expanded;
    }

    train(int8Iterable, opts={}) {
      let { glossary } = this;
      let { minUses=0 } = opts;
      let data = [...int8Iterable];
      let dict = new Map(this.dict);
      let compressed = this.compress(data, {dict});
      let trained = [];
      let done = false;
      for (let curLen=1; !done; curLen++) {
        // emit shorter codes before longer codes
        done = true;
        for (let kv of dict) {
          // emit codes by uses
          let [key,entry] = kv;
          let { isGlossary, pos, len, uses=0 } = entry;
          let value = isGlossary
            ? glossary.slice(pos, pos+len)
            : data.slice(pos, pos+len);
          if (isGlossary || uses >= minUses) {
            if (curLen === len) {
              done = false;
              trained.push(...value);
            }
          }
        }
      }

      return new LzwInt8({glossary:new Int8Array(trained)});
    }

  }

  module.exports = exports.LzwInt8 = LzwInt8;

})(typeof exports === "object" ? exports : (exports = {}));
