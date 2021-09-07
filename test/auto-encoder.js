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
  } = require('../index');
  this.timeout(120*1000);

  const EVAM_ME_SUTTAM_WAV = path.join(__dirname, 'data/evam-me-suttam.wav');
  const KATAME_PANCA_WAV = path.join(__dirname, 'data/katame-panca.wav');
  const EVAM_ME_SUTTAM_TXT = path.join(__dirname, 'data/evam-me-suttam.txt');
  const AN9_20_4_3_WAV = path.join(__dirname, 'data/an9.20_4.3.wav');

  async function wavSignal(fnam=EVAM_ME_SUTTAM_WAV) {
    let buf = await fs.promises.readFile(fnam);
    let wf = new WaveFile(buf);
    return new Signal(wf.getSamples(false, Int16Array));
  }

  it("default ctor", async()=>{
    let coder = new AutoEncoder();
    let encoderLayers = 3;
    should(coder.codeSize).equal(96);
    should(coder.dampen).equal(36);
    should(coder.encoderAlpha).equal(1.61803398875);
    should(coder.encoderLayers).equal(encoderLayers);
    should(coder.frameSize).equal(192);
    should(coder.sampleRate).equal(22050);
    should(coder.scale).equal(16384);
    should(coder.threshold).equal(2);
    should(coder.encoderUnits.length).equal(encoderLayers);
    should(coder.decoderUnits.length).equal(encoderLayers);
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
  it("train() AN9_20_4_3_WAV", async()=>{
    let frameSize = 96;         // signal compression unit
    let batchSize = 512;
    let codeSize = 6;           // units in code layer
    let encoderLayers = 3;      // encoder/decoder layers
    let encoderUnits = 0.8;     // decay
    let encoderAlpha = 1.61803398875; // Golden ratio
    let scale = 16384;          // signal normalization
    let codeActivation = 'elu'; // code layer activation function

    // Train on one set of sounds from a speaker
    let coder = new AutoEncoder({
      frameSize, scale, codeSize, encoderUnits, encoderAlpha, encoderLayers, codeActivation,
    });
    let epochs = 5;            // more epochs will train better
    //let signal = await wavSignal(EVAM_ME_SUTTAM_WAV); // longer samples will improve training
    let signal = await wavSignal(AN9_20_4_3_WAV); // longer samples will improve training
    let { splits, frames } = coder.frameSignal(signal);
    let res = await coder.train({frames, batchSize, epochs});

    // Test using completely different sound from same speaker
    let signalTest = await wavSignal(KATAME_PANCA_WAV);
    let { frames:framesTest } = coder.frameSignal(signalTest);
    let iTest = 32; // arbitrary frame from middle of the signal
    let xtest = tf.tensor2d(framesTest.slice(iTest,iTest+1));
    let { model } = coder;
    let msStart = Date.now();
    for (var reps=0; reps < 100; reps++){ var ytest = await model.predict(xtest); }
    let msElapsed = Date.now() - msStart;
    let chart = new Chart();
    chart.plot({
      data: [[...xtest.dataSync()],[...ytest.dataSync()]], 
      title:`Signals 1:original 2:decoded in ${msElapsed/reps}ms`,
    });
    model.summary(undefined, undefined, x=> !/___/.test(x) && console.log('Model', x));
  });
  it("coderUnits()", async()=>{
    let units842 = [8,4,2];
    should.deepEqual(AutoEncoder.coderUnits(units842), units842);
    should.deepEqual(AutoEncoder.coderUnits(2), [192,2*192,2*2*192]);
    should.deepEqual(AutoEncoder.coderUnits(.8, 100, 5 ), [100, 80, 64, 51, 41]);
    should.deepEqual(AutoEncoder.coderUnits(1, 100, 5 ), [100, 100, 100, 100, 100]);
  });
  it("getWeights()", async()=>{
    let frameSize = 96;         // signal compression unit
    let codeSize = 6;           // units in code layer
    let encoderLayers = 3;            // encoder/decoder layers
    //let encoderAlpha = 0.10;    // snake harmonic alpha. I.e., [0.1, 0.2, 0.3, ...]
    //encoderAlpha = [.1,.1,.1]; // constant alpha doesn't work as well as harmonic
    let encoderAlpha = 1.61803398875; // Golden ratio
    let encoderUnits = 0.7;
    let scale = 16384;          // signal normalization
    let codeActivation = 'elu'; // code layer activation function
    let coder = new AutoEncoder({
      frameSize, scale, codeSize, encoderUnits, encoderAlpha, encoderLayers, codeActivation,
    });
    let initialEpoch = 1;       // for continued training
    let validationSplit = 0.5;  // 
    let epochs = 50;            // more epochs will train better
    let signal = await wavSignal(EVAM_ME_SUTTAM_WAV); // longer samples will improve training
    let { splits, frames } = coder.frameSignal(signal);
    let res = await coder.train({frames, epochs, initialEpoch, validationSplit});

    let { model } = coder;
    let model2 = coder.createModel();
    let layers2 = model2.layers;

    // we can assign weights layer by layer
    for (let i = 0; i < layers2.length; i++) {
      let layer2 = layers2[i];
      let layer1 = model.layers[i];
      let weights = layer1.getWeights();
      layer2.setWeights(weights);
    }

    // copied model is encodes/decodes signal
    let iTest = 32; // arbitrary frame from middle of the signal
    let xtest = tf.tensor2d(frames.slice(iTest,iTest+1));
    let ytest = await model2.predict(xtest);
    let chart = new Chart();
    chart.plot({
      data: [[...xtest.dataSync()],[...ytest.dataSync()]], 
      title:`Model2 signals 1:original 2:decoded`,
    });
    model2.summary(undefined, undefined, x=> !/___/.test(x) && console.log('Model', x));
    let mse = tf.metrics.meanSquaredError(xtest, ytest);
    console.log(`mse`, mse.dataSync());
    
  });

})
