(typeof describe === 'function') && describe("lzv", function() {
    const should = require("should");
    const { WaveFile } = require('wavefile');
    const fs = require('fs');
    const path = require('path');
    let {
      LzwInt8,
    } = require('../index');

    it("Map", ()=>{
      let m = new Map();
      let a123 = [1,2,3];
      let b123 = [1,2,3];
      m.set(a123.join(','), 'a123');
      m.set(a123,a123);
      m.set(b123,b123);

      // Can't use arrays as keys
      should(m.get(a123)).equal(a123);
      should(m.get(b123)).equal(b123);

      // Must use strings as keys
      should(m.get(a123.join(','))).equal('a123');
      should(m.get(b123.join(','))).equal('a123');

      // Maps are iterable
      should.deepEqual([...m],[
        ['1,2,3','a123'],
        [a123, a123],
        [b123, b123],
      ]);
    });
    it("default ctor()", ()=>{
      let lzw = new LzwInt8();
      let { glossary, dict } = lzw;
      should(glossary.length).equal(256);
      should(glossary[0]).equal(0);
      should(glossary[1]).equal(1);
      should(glossary[128]).equal(-1);

      should([...dict].length).equal(256);
      should.deepEqual(dict.get('0'), { code: 0, isGlossary: true, len: 1, pos: 0});
      should.deepEqual(dict.get('1'), { code: 1, isGlossary: true, len: 1, pos: 1});
      should.deepEqual(dict.get('-1'), { code: 128, isGlossary: true, len: 1, pos: 128});
    });
    it("compress(Array)", ()=>{
      let verbose = 0;
      let glossary = [0,1,2,3]; 
      let lzw = new LzwInt8({glossary});
      let iterable = [0,1,0,1,2,0,1,2,3,0,1];  
      verbose && console.log(`compress data:`, iterable.join(','));
      let compressed = lzw.compress(iterable);
      verbose && console.log(`compressed:`, compressed.join(', '));
      verbose && console.log(`dict:`, lzw.dict);
      should.deepEqual(compressed, [0,1,4,2,6,3,4]);
    });
    it("compress(Int8Array)", ()=>{
      let glossary = new Int8Array([0,1,2,3]); 
      let lzw = new LzwInt8({glossary});
      let iterable = new Int8Array([0,1,0,1,2,0,1,2,3,0,1]);
      let compressed = lzw.compress(iterable);
      should.deepEqual(compressed, [0,1,4,2,6,3,4]);
    });
    it("compress() is invocation invariant", ()=>{
      let glossary = [0,1,2,3]; 
      let lzw1 = new LzwInt8({glossary});
      let a = [1,2,3,1,2,3,1,2,3];
      should.deepEqual(lzw1.compress(a), [1,2,3,4,6,5]);
      let lzw2 = new LzwInt8({glossary});
      let b = [3,2,1,3,2,1,3,2,1];
      should.deepEqual(lzw2.compress(b), [3,2,1,4,6,5]);
      //console.log(lzw2.dict.entries());

      // successive compressions are invariant 
      should.deepEqual(lzw1.compress(a), [1,2,3,4,6,5]);
      should.deepEqual(lzw2.compress(b), [3,2,1,4,6,5]);
      should.deepEqual(lzw2.compress(a), [1,2,3,4,6,5]);
      should.deepEqual(lzw1.compress(b), [3,2,1,4,6,5]);
    });
    it("expand() negative numbers", ()=>{
      let verbose = 0;
      let glossary = [0,-1,-2,-128];
      let message = [0,-1,0,-1,-128];
      should.deepEqual([...new Int8Array(glossary)], glossary);

      let lzw = new LzwInt8({glossary});
      let dict = new Map(lzw.dict);
      let compressed = lzw.compress(message, {dict});
      for (let kv of dict) { verbose && console.log(`negative`, JSON.stringify(kv)); }
      should.deepEqual(compressed, [0,1,4,3]);

      // Expand with original compressor, which was altered by compression
      let expanded = lzw.expand(compressed);
      should.deepEqual(expanded, message);
    });
    it("expand(Int16Array)", ()=>{
      let glossary = [0,1,2,3,0,1,0,1,2]; 
      let message = [0,1,0,1,2,0,1,2,3,0,1];

      let lzw1 = new LzwInt8({glossary});
      let compressed = lzw1.compress(message);
      should.deepEqual(compressed, [4,6,6,3,4]);

      // Expand with original compressor, which was altered by compression
      let expanded1 = lzw1.expand(compressed);
      should.deepEqual(expanded1, message);

      // Expand with separate compressor, which was unaltered by compression
      let lzw2 = new LzwInt8({glossary});
      let expanded2 = lzw2.expand(compressed);
      should.deepEqual(expanded2, message);
    });
    it("train(...) => glossary",()=>{
      let glossary = [0,1,2,3,0,1];
      let lzw = new LzwInt8({glossary});
      let opts = {verbose:false};

      //for (let kv of lzw.dict) { console.log(`lzw`, kv); }
      should.deepEqual(lzw.glossary, new Int8Array([0,1,2,3,0,1]));

      should.deepEqual(lzw.compress([0,1,2,0,1,2,0,1,3], opts), [4,2,5,4,3]);

      let expanded = lzw.expand([4,2,5,4,3], opts);
      should.deepEqual(expanded,[0,1,2,0,1,2,0,1,3]);
    });
    it("train(...) => glossary",()=>{
      let glossary = [0,1,2,3];
      let lzw = new LzwInt8({glossary});
      let opts = {verbose:true};

      let lzwTrained = lzw.train([0,1,0,1]);
      //for (let kv of lzw.dict) { console.log(`trained1`, kv); }
      should.deepEqual(lzwTrained.glossary, new Int8Array([0,1,2,3,0,1,1,0]));

      should.deepEqual(lzwTrained.compress([0,1,2,0,1,2], opts), [4,2,7]);

      let expanded = lzwTrained.expand([4,2,7], opts);
      should.deepEqual(expanded,[0,1,2,0,1,2]);
    });
    it("train(...) minUses tunes training size",()=>{
      let glossary = [0,1,2];
      let minUses = 0; // lowering minUses increases trained glossary
      let lzw = new LzwInt8({glossary});
      let lzwTrained = lzw.train([0,1,2,0,1,2], {minUses});
      should.deepEqual(lzwTrained.glossary, new Int8Array([0,1,2,0,1,1,2,2,0,0,1,2]));
      should(lzwTrained).instanceOf(LzwInt8);
      should.deepEqual(lzwTrained.compress([0,1,2,0,1,2]), [9,9]);
      should.deepEqual(lzwTrained.expand([9,9]), [0,1,2,0,1,2]);
    });
    it("compress() zeroes", ()=>{
      let verbose = 0;
      let glossary = [0,1]; 
      let testZeroes = (data, lzw)=>{
        let compressed = lzw.compress(data, {verbose:0});
        let expanded = lzw.expand(compressed, {verbose:0});
        verbose && console.log(`zeroes`, JSON.stringify({compressed,data}));
        should.deepEqual(expanded, data);
      };
       
      let lzw1 = new LzwInt8({glossary});
      let data = [0,1];
      for (let i = 0; i < 20; i++) {
        testZeroes(data, lzw1);
        data = [0, ...data];
      }

      let lzw2 = lzw1.train([0,0,0,0,0,0,0,0,0,0,0,0,1]);
      data = [0,1];
      for (let i = 0; i < 20; i++) {
        testZeroes(data, lzw2);
        data = [0, ...data];
      }
    });
})
