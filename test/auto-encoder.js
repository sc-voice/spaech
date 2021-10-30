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
  const EVAM_ME_SUTTAM_IDENTITY_WAV = path.join(__dirname, 'data/evam-me-suttam-identity.wav');
  const KATAME_PANCA_WAV = path.join(__dirname, 'data/katame-panca.wav');
  const EVAM_ME_SUTTAM_TXT = path.join(__dirname, 'data/evam-me-suttam.txt');
  const AN9_20_4_3_WAV = path.join(__dirname, 'data/an9.20_4.3.wav');

  async function wavSignal(fnam=EVAM_ME_SUTTAM_WAV) {
    let buf = await fs.promises.readFile(fnam);
    return Signal.fromWav(buf);
  }

  it("default ctor", async()=>{
    let inputSize = 192;
    let coder = new AutoEncoder({inputSize});
    let encoderLayers = 3;
    should(coder.encoderAlpha).equal(1.61803398875);
    should(coder.encoderLayers).equal(encoderLayers);
    should(coder.decoderLayers).equal(encoderLayers);
    should(coder.inputSize).equal(192);
    should(coder.outputSize).equal(192);
    should(coder.encoderUnits.length).equal(encoderLayers);
    should(coder.decoderUnits.length).equal(encoderLayers);
    should(coder.scaleIn).equal(16384);
    should(coder.scaleOut).equal(16384);
  });
  it("Int16Array", ()=>{
    let i16a = new Int16Array([1,10,100]);

    // map preserves data type
    should.deepEqual(i16a.map(v=>v/10), new Int16Array([0,1,10]));
    should.deepEqual([...i16a].map(v=>v/10), [0.1,1,10]);
  });
  it("modelConfiguration", async()=>{
    let frameSize = 96;
    let inputSize = 3*frameSize/2;
    let outputSize = frameSize;
    let codeSize = 6;
    let encoderLayers = 3;
    let decoderLayers = 2;
    let alpha = 1.61803398875;  // Golden Ratio
    let alpha2 = alpha*alpha;
    let alpha3 = alpha*alpha*alpha;
    let encoderAlpha = alpha;
    let encoderUnits = 0.7;
    let codeActivation = 'elu'; // code layer activation function
    let coder = new AutoEncoder({
      inputSize, outputSize, codeSize, encoderUnits, encoderAlpha, encoderLayers, decoderLayers,
      codeActivation,
    });
    let { model } = coder;
    let config = AutoEncoder.modelConfiguration(coder.model);
    should.deepEqual(config, {
      codeSize,
      codeActivation,
      inputSize,
      outputSize,
      encoderUnits: [ 144, 101, 71 ],
      decoderUnits: [ 24, 96 ],
      encoderAlpha: [ alpha, alpha2, alpha3],
      decoderAlpha: [ alpha2, alpha],
      encoderLayers,
      decoderLayers,
    });
  });
  it("frameSignal() ", async()=>{
    let verbose = 0;
    let frameSize = 4;
    let scale = 0.1;
    let data = [1,2,3,4,5,6,7];
    let signal = new Signal(data);
    let threshold = 0;
    let dampen = 0;
    let length = data.length;
    let nFrames = Math.ceil(length / frameSize);
    let opts = {frameSize, threshold, dampen, scale};
    let {splits, frames} = await AutoEncoder.frameSignal(signal, opts);

    should.deepEqual(splits, [
      { start:  0, length, nFrames, end:nFrames*frameSize }, // evam
    ]);
    should.deepEqual(frames, [[10,20,30,40], [50,60,70,0]]);
  });
  it("frameSignal()", async()=>{
    let verbose = 0;
    let signal = await wavSignal(EVAM_ME_SUTTAM_WAV);
    let scale = 16384;
    let inputSize = 10;
    let frameSize = inputSize;
    let coder = new AutoEncoder({inputSize, scale});
    let { splits, frames } = await AutoEncoder.frameSignal(signal, {scale, frameSize:inputSize});

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
        let frame = frames[iFrame+i];
        let datai = data.slice(iData, iData+inputSize);
        while (datai.length < frameSize) { datai.push(0); }
        should.deepEqual(frame, datai);
        iData += inputSize;
        nFrames++;
      }
      iFrame += split.nFrames;
    });
    should(frames.length).equal(nFrames);
  });
  it("transform datatype", async()=>{
    let tf32 = Float32Array;
    let ti16 = Int16Array;
    let arg1 = [1,2,3];
    let f32 = Reflect.construct(tf32, [ arg1 ]);
    let i16 = Reflect.construct(ti16, [ arg1 ]);
    should.deepEqual(f32, new Float32Array(arg1));
    should.deepEqual(f32.constructor, Float32Array);
    should.deepEqual(i16, new Int16Array(arg1));
    should.deepEqual(i16.constructor, Int16Array);
    should.deepEqual([...f32.map(v=>v/3)], [0.3333333432674408, 0.6666666865348816, 1]);
    should.deepEqual([...i16.map(v=>v/3)], [0, 0, 1]);  // Trunc
  });
  it("transform(...)", async()=>{
    let verbose = 0;
    let sigIn = await wavSignal(EVAM_ME_SUTTAM_WAV);
    const SCALE = 2;
    let scaleIn = 2;
    let scaleOut = scaleIn * SCALE;   // output amplitude is twice input
    let inputSize = 192;
    let threshold = 2;
    let dampen = 36;
    let coder = new AutoEncoder({inputSize, scaleIn, scaleOut});
    let transform = 'identity';
    let sigOut = await coder.transform(sigIn, {transform});
    let splits = sigIn.split({threshold, dampen});
    for (let i = 0; i < splits.length; i++) {
      let {start,length} = splits[i];
      let end = start+length;
      should.deepEqual(
        sigIn.data.slice(start,end), 
        sigOut.data.slice(start,end).map(v=>v/SCALE));
    }
    await fs.writeFileSync(EVAM_ME_SUTTAM_IDENTITY_WAV, sigOut.toWav());
  });
  it("train() AN9_20_4_3_WAV", async()=>{
    let inputSize = 96;         // signal compression unit
    let frameSize = inputSize;
    let batchSize = 512;
    let codeSize = 6;           // units in code layer
    let encoderLayers = 3;      // encoder/decoder layers
    let encoderUnits = 0.8;     // decay
    let encoderAlpha = 1.61803398875; // Golden ratio
    let scale = 16384;          // signal normalization
    let codeActivation = 'elu'; // code layer activation function

    // Train on one set of sounds from a speaker
    let coder = new AutoEncoder({
      inputSize, scale, codeSize, encoderUnits, encoderAlpha, encoderLayers, codeActivation,
    });
    let epochs = 5;            // more epochs will train better
    //let signal = await wavSignal(EVAM_ME_SUTTAM_WAV); // longer samples will improve training
    let signal = await wavSignal(AN9_20_4_3_WAV); // longer samples will improve training
    let { splits, frames } = AutoEncoder.frameSignal(signal, {frameSize});
    let res = await coder.train({inputs:frames, batchSize, epochs});

    // Test using completely different sound from same speaker
    let signalTest = await wavSignal(KATAME_PANCA_WAV);
    let { frames:framesTest } = AutoEncoder.frameSignal(signalTest, {frameSize});
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
    let inputSize = 96;
    let frameSize = inputSize;
    let codeSize = 6;           // units in code layer
    let encoderLayers = 3;            // encoder/decoder layers
    //let encoderAlpha = 0.10;    // snake harmonic alpha. I.e., [0.1, 0.2, 0.3, ...]
    //encoderAlpha = [.1,.1,.1]; // constant alpha doesn't work as well as harmonic
    let encoderAlpha = 1.61803398875; // Golden ratio
    let encoderUnits = 0.7;
    let scale = 16384;          // signal normalization
    let codeActivation = 'elu'; // code layer activation function
    let coder = new AutoEncoder({
      inputSize, scale, codeSize, encoderUnits, encoderAlpha, encoderLayers, codeActivation,
    });
    let initialEpoch = 1;       // for continued training
    let validationSplit = 0.5;  // 
    let epochs = 50;            // more epochs will train better
    let signal = await wavSignal(EVAM_ME_SUTTAM_WAV); // longer samples will improve training
    let opts = {frameSize, threshold:0, dampen:0, scale};
    let { splits, frames } = AutoEncoder.frameSignal(signal, opts);
    let inputs = frames;
    let outputs = frames;
    let iTest = 32; // arbitrary frame from middle of the signal
    let xdata = frames.slice(iTest,iTest+1);
    let xtest = tf.tensor2d(xdata);
    // console.log(xtest.dataSync());

    let res = await coder.train({inputs, outputs, epochs, initialEpoch, validationSplit});

    // Reconstruct AutoEncoder from model
    let { model } = coder;
    let model2 = coder.createModel();
    let cfg2 = AutoEncoder.modelConfiguration(model);
    cfg2.model = model2;
    let coder2 = new AutoEncoder(cfg2);
    let layers2 = model2.layers;
    for (let i = 0; i < layers2.length; i++) { // copy layer weights
      let layer2 = layers2[i];
      let layer1 = model.layers[i];
      let weights = layer1.getWeights();
      layer2.setWeights(weights);
    }
    let ydata = await coder.predict(xdata);
    let ydata2 = await coder2.predict(xdata);
    let chart = new Chart();
    chart.plot({
      data: [[...xtest.dataSync()],[...ydata2]], 
      title:`Model2 signals 1:original 2:decoded`,
    });
    model.summary(undefined, undefined, x=> !/___/.test(x) && console.log('Model', x));
    model2.summary(undefined, undefined, x=> !/___/.test(x) && console.log('Model', x));
    let mse = tf.metrics.meanSquaredError(xtest, tf.tensor2d(ydata, [1,inputSize]));
    let mse2 = tf.metrics.meanSquaredError(xtest, tf.tensor2d(ydata2, [1,inputSize]));
    console.log(`mse`, mse.dataSync());
    should.deepEqual(mse2.dataSync(), mse.dataSync());
  });

})
