(typeof describe === 'function') && describe("int16-frames", function() {
  const should = require("should");
  const fs = require('fs');
  const path = require('path');
  const { WaveFile } = require('wavefile');
  let {
    Int16Frames,
    Series,
  } = require('../index');

  const EVAM_ME_SUTTAM = path.join(__dirname, 'data/evam-me-suttam.wav');
  const AN9_20_4_3 = path.join(__dirname, 'data/an9.20_4.3.wav');

  it("default ctor()", async()=>{
    should.throws(()=>new Int16Frames());
  });
  it("custom ctor()", async()=>{
    let frameSize = 2;

    should.deepEqual([...new Int16Frames([], frameSize)],      [ ]);
    should.deepEqual([...new Int16Frames([1], frameSize)],     [ 
      new Int16Array([1,0]) ]);
    should.deepEqual([...new Int16Frames([1,2], frameSize)],   [ 
      new Int16Array([1,2]) ]);
    should.deepEqual([...new Int16Frames([1.1,2.2,3.9], frameSize)], [ 
      new Int16Array([1,2]), 
      new Int16Array([3,0]),
    ]); // floor(floating point numbers)

    let ia = new Int16Array([-1,-2,-3,-4]);
    should.deepEqual([...new Int16Frames(ia, frameSize)], [ 
      new Int16Array([-1,-2]), 
      new Int16Array([-3,-4]),
    ]);

    let iab = new Int16Array([-1,-2,-3,-4]).buffer;
    should.deepEqual([...new Int16Frames(iab, frameSize)], [ 
      new Int16Array([-1,-2]), 
      new Int16Array([-3,-4]),
    ]);
  });
  it("time to scan 2.6MB", async()=>{
    let verbose = 0;
    let buf = await fs.promises.readFile(AN9_20_4_3);
    let wf = new WaveFile(buf);
    let samples = wf.getSamples(false, Int16Array);
    let frameSize = 512;

    let msStart = Date.now();
    let frames = new Int16Frames(samples, frameSize);
    let itFrames = frames[Symbol.iterator]();
    let frameFirst;
    let frameLast;
    let remainder = samples.length % frameSize;
    for (var iFrames=0;; iFrames++) {
      let {value, done} = itFrames.next();
      if (done) { break; }
      if (iFrames === 0){ 
        frameFirst = value;
      }
      frameLast = value;
      //should(frameLast.length).equal(frameSize);
    }
    let elapsed1 = Date.now() - msStart;
    verbose && console.log(`iterated ${iFrames} frames@${frameSize} in ${elapsed1}ms:`);

    // first frame
    should.deepEqual(frameFirst.slice(0,frameSize), samples.slice(0,frameSize));

    // last frame is zero-fill
    should.deepEqual(frameLast.slice(0,remainder), 
      samples.slice(samples.length-remainder)); 
    should.deepEqual(frameLast.slice(remainder), 
      new Int16Array(frameSize-remainder));
  });
})
