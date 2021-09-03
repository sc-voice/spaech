(typeof describe === 'function') && describe("snake", function() {
  const should = require("should");
  const fs = require('fs');
  const path = require('path');
  const fetch = require('node-fetch');
  const tf = require('@tensorflow/tfjs-node');
  const { WaveFile } = require('wavefile');
  const {
    Chart,
    Snake,
  } = require('../index');

  const EVAM_ME_SUTTAM = path.join(__dirname, 'data/evam-me-suttam.wav');
  const AN9_20_4_3 = path.join(__dirname, 'data/an9.20_4.3.wav');
  this.timeout(50*1000);

  function sineSignal({fSamp = 22050, fSig = 200, nSamp = 80, phase=0}) {
    let signal = [];

    for (let iSamp = 0; iSamp < nSamp; iSamp++) {
      let t = iSamp / fSamp;
      let sigi = Math.sin(2*Math.PI * (fSig * t + phase/360));
      signal.push(sigi);
    }

    return signal;
  }

  it("isNode", ()=>{
    should(Snake.isNode).equal(true);
  });
  it("Activation", async()=>{
    let verbose = 1;
    let act = new Snake.Activation();
    let n = 20;
    let v = new Float32Array(n+1).map((v,i)=>i/10);
    let x = tf.tensor1d(v);
    let y = act.apply(x);
    let yd = await y.data();
    should.deepEqual(await x.data(), v);
    verbose && console.log(`snake activation`, { input:[...v], output:[...yd] });
    should(yd.length).equal(v.length);
    for (let i = 1; i < yd.length; i++) {
      should(yd[i]).above(yd[i-1]); // Snake is monotonic increasing
    }
  });
  it("snake sine", async()=>{
    let TRAIN = 1;
    if (!TRAIN) { return; }
    let nSamp = 192;  // MDCT frameSize
    let groundTruth = [];
    let batchSize = 128;
    let nExamples = 5*batchSize;
    let learningRate = 0.001; //0.001
    let beta1 = 0.9; // 0.9
    let beta2; // 0.999
    let epsilon; // 1e-7
    let epochs = 100; // 1000;
    for (let i = 0; i < nExamples; i++) {
      let fSig = 100*Math.random() + 150;
      let phase = 360*Math.random();
      groundTruth.push({fSig, phase, nSamp});
    }
    let signals = groundTruth.map(gt=>sineSignal(gt));

    let chart = new Chart({title:`Signals`});

    const model = tf.sequential();
    let inputShape = [nSamp];
    model.add(tf.layers.dense({units: nSamp, inputShape, activation:'relu'}));
    model.add(new Snake({units: Math.round(nSamp*2), }));
    model.add(tf.layers.dense({units: 2, activation:'elu'}));

    // Compiling the model
    const adam = tf.train.adam(learningRate, beta1, beta2, epsilon);
    //console.log(`adam`, adam);
    model.compile({
        optimizer: adam,
        loss: 'meanSquaredError',
        metrics: ['accuracy']
    });

    let x = tf.tensor2d(signals);
    let y = tf.tensor2d(groundTruth.map(gt => [gt.fSig, gt.phase]));

    // Fitting the model
    let history = await model.fit(x, y, {
        batchSize,
        epochs,
        verbose: 0, // nodejs is too chatty
        validationSplit: 0.5,
        callbacks: {
          onEpochEnd: (epoch, log) => 
            ((epoch+1) % 10===0) && console.log(`Epoch${epoch}: `, JSON.stringify(log))
        },
    });

    // printing loss and predictions
    console.log(`history loss:`, history.history.loss.slice(-1));
    let testTruth = [100,200,300].map(fSig=>({fSig, nSamp}));
    let testSignals = testTruth.map(tt=>sineSignal(tt));
    chart.plot({data: testSignals, title:"Test Signals"});
    let testX = tf.tensor2d(testSignals);
    let predict = model.predict(testX).arraySync();
    testTruth.forEach((tt,i)=>{
      let { fSig, phase } = tt;
      let [ fSigPredict, phasePredict ] = predict[i];
      console.log(`predict${i}`, JSON.stringify({fSig, fSigPredict, phase, phasePredict}));
    });
    model.summary();
    console.log(Math.random());
    return;
    snake && console.log(`snake`, {
      activation: snake.activation, 
      bias: typeof snake.bias,
      kernel: typeof snake.kernel,
      weights: snake.getWeights(),
    });
  });
  it("TESTTESTserialize", async()=>{
    let nSamp = 192;  
    let groundTruth = [];
    let nExamples = 500;
    let epochs = 50; 
    for (let i = 0; i < nExamples; i++) {
      let fSig = 20*Math.random() + 90;
      groundTruth.push({fSig, nSamp});
    }
    let signals = groundTruth.map(gt=>sineSignal(gt));

    const model = tf.sequential();
    let inputShape = [nSamp];
    model.add(new Snake({units: nSamp, inputShape}));
    model.add(new Snake({units: nSamp}));
    model.add(tf.layers.dense({units: 1, activation:'elu'}));

    model.compile({ optimizer: 'adam', loss: 'meanSquaredError', metrics: ['accuracy'] });

    let x = tf.tensor2d(signals);
    let y = tf.tensor2d(groundTruth.map(gt => [gt.fSig]));

    // Fitting the model
    let history = await model.fit(x, y, {
        epochs,
        batchSize: 64,
        verbose: 0, // nodejs is too chatty
        validationSplit: 0.5,
        callbacks: {
          onEpochEnd: (epoch, log) => 
            ((epoch+1) % 10===0) && console.log(`Epoch${epoch}: `, JSON.stringify(log))
        },
    });

    let saveUrl = `file:////${__dirname}/models/snake`;
    await model.save(saveUrl);

    // create copy of saved model
    let model2 = await tf.loadLayersModel(`${saveUrl}/model.json`);
    let testTruth = [95,100,105].map(fSig=>({fSig, nSamp}));
    let testSignals = testTruth.map(tt=>sineSignal(tt));
    let testX = tf.tensor2d(testSignals);
    let predict2 = model2.predict(testX).arraySync();

    // loaded model is same as saved model
    let predict = model.predict(testX).arraySync();
    should.deepEqual(predict2, predict);
    return;
  });

})
