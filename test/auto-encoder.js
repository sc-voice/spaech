(typeof describe === 'function') && describe("auto-encoder", function() {
  const should = require("should");
  const fs = require('fs');
  const path = require('path');
  const tf = require('@tensorflow/tfjs-node');
  const { WaveFile } = require('wavefile');
  const {
    Chart,
    AutoEncoder,
    Signal,
    TextToSpeech,
    WordWindow,
  } = require('../index');
  this.timeout(120*1000);

  const EVAM_ME_SUTTAM_WAV = path.join(__dirname, 'data/evam-me-suttam.wav');
  const EVAM_ME_SUTTAM_TXT = path.join(__dirname, 'data/evam-me-suttam.txt');
  const AN9_20_4_3_WAV = path.join(__dirname, 'data/an9.20_4.3.wav');

  async function wavSignal(fnam=EVAM_ME_SUTTAM_WAV) {
    let buf = await fs.promises.readFile(fnam);
    let wf = new WaveFile(buf);
    return new Signal(wf.getSamples(false, Int16Array));
  }

  it("TESTTESTdefault ctor", async()=>{
    let coder = new AutoEncoder();
    should(coder.threshold).equal(2);
    should(coder.sampleRate).equal(22050);
    should(coder.codeSize).equal(96);
    should(coder.dampen).equal(36);
    should(coder.frameSize).equal(192);
    should(coder.scale).equal(16384);
  });
  it("frameSignal()", async()=>{
    let verbose = 1;
    let signal = await wavSignal(EVAM_ME_SUTTAM_WAV);
    let scale = 10;
    let frameSize = 10;
    let coder = new AutoEncoder({frameSize, scale});
    let { splits, frames } = await coder.frameSignal(signal);

    should.deepEqual(splits, [
      { start:  1293, length: 12855, nFrames: 1286, end: 14153 }, // evam
      { start: 18096, length:  9220, nFrames:  922, end: 27316 }, // me
      { start: 31361, length: 20251, nFrames: 2026, end: 51621 }, // suttam
    ]);

    // Signal is normalized and split up into frames by word
    let data = [...signal.data].map(v=>v/scale);
    let iFrame = 0;
    let nFrames = 0;
    splits.forEach(split=>{
      let iData = split.start;
      for (let i=0; i < split.nFrames; i++) {
        should.deepEqual(frames[iFrame+i], data.slice(iData, iData+frameSize));
        iData += frameSize;
        nFrames++;
      }
      iFrame += split.nFrames;
    });
    should(frames.length).equal(nFrames);
  });
  it("TESTTESTtrain()", async()=>{
    let verbose = 1;
    let frameSize = 192;
    let codeSize = Math.round(frameSize/32);
    let scale = 16384;
    let coder = new AutoEncoder({frameSize, scale, codeSize});
    let epochs = 100;
    //let signal = await wavSignal(AN9_20_4_3_WAV);
    let signal = await wavSignal(EVAM_ME_SUTTAM_WAV);

    let { splits, frames } = coder.frameSignal(signal);
    let res = await coder.train({frames, epochs});

    let iTest = 10;
    let signalTest = await wavSignal(EVAM_ME_SUTTAM_WAV);
    let { frames:framesTest } = coder.frameSignal(signalTest);
    let xtest = tf.tensor2d(framesTest.slice(iTest,iTest+1));
    let { model } = coder;
    let ytest;
    let msStart = Date.now();
    let reps = 100;
    for (let i = 0; i < reps; i++) {
      ytest = await model.predict(xtest);
    }
    let msElapsed = Date.now() - msStart;
    let chart = new Chart();
    chart.plot({
      data: [[...xtest.dataSync()],[...ytest.dataSync()]], 
      title:`Signals 1:original 2:decoded in ${msElapsed/reps}ms`,
      lines: 4*5+5,
    });


  });

})
