(function(exports) {
  const isNode=new Function("try {return this===global;}catch(e){return false;}");
  const { logger } = require('log-instance');
  const tf = require(isNode() ? '@tensorflow/tfjs-node' : '@tensorflow/tfjs');
  const assert = require('assert');
  const Signal = require('./signal');
  const Snake = require('./snake');
  const Chart = require('./chart');

  class AutoEncoder {
    constructor(args={}) {
      logger.logInstance(this);
      let {
        model,
        frameSize = 192,
        codeSize = 96,
        scale = 16384,
        sampleRate = 22050,
        threshold = 2,
        dampen = 36,
      } = args;

      Object.assign(this, {
        scale, threshold, dampen, sampleRate, frameSize, codeSize,
      });
      Object.defineProperty(this, '_model', {
        writable: true,
        value: model,
      });
    }

    static onEpochEnd(epoch, log) {
      if ( (epoch+1) % 10 === 0) {
        let { val_mse, mse } = log;
        console.log(`Epoch${epoch}: `, JSON.stringify({val_mse, mse}));
      }
    }

    get model() {
      let { _model: model, frameSize, codeSize, } = this;
      if (model == null) {
        model = this._model = this.createModel();
      }
      return model;
    }

    createModel() {
      let { frameSize, codeSize, } = this;
      let inputShape = [frameSize];
      let  model = tf.sequential();
      let units0  = 0 ? Math.round(frameSize/1) : 0;
      let units1  = 1 ? Math.round(frameSize/1) : 0;
      let units1a = 1 ? Math.round(frameSize/1) : 0;
      let units2  = 1 ? Math.round(frameSize/2) : 0;
      let units2a = 0 ? Math.round(frameSize/2) : 0;
      let units3  = 1 ? Math.round(frameSize/3) : 0;
      let units4  = 0 ? Math.round(frameSize/4) : 0;
      let units5  = 1 ? Math.round(frameSize/5) : 0;
      let units6  = 0 ? Math.round(frameSize/6) : 0;
      let units8  = 0 ? Math.round(frameSize/8) : 0;
      let units10 = 0 ? Math.round(frameSize/10) : 0;
      let units13 = 0 ? Math.round(frameSize/13) : 0;
      let units16 = 0 ? Math.round(frameSize/16) : 0;

      model.add(tf.layers.dense({units:frameSize, inputShape, activation:'relu'}));

      // encoder
      units0 && model.add(tf.layers.dense({units:units0, activation:'elu'}));
      units1 && model.add(new Snake({units: units1}));
      units1a && model.add(new Snake({units: units1a}));
      units2 && model.add(new Snake({units: units2}));
      units2a && model.add(new Snake({units: units2a}));
      units3 && model.add(new Snake({units: units3}));
      units4 && model.add(new Snake({units: units4}));
      units5 && model.add(new Snake({units: units5}));
      units6 && model.add(new Snake({units: units6}));
      units8 && model.add(new Snake({units: units8}));
      units10 && model.add(new Snake({units: units10}));
      units13 && model.add(new Snake({units: units13}));
      units16 && model.add(new Snake({units: units16}));

      model.add(tf.layers.dense({units: codeSize, activation:'elu'}));

      // decoderer
      units16 && model.add(new Snake({units: units16}));
      units13 && model.add(new Snake({units: units13}));
      units8 && model.add(new Snake({units: units8}));
      units6 && model.add(new Snake({units: units6}));
      units5 && model.add(new Snake({units: units5}));
      units4 && model.add(new Snake({units: units4}));
      units3 && model.add(new Snake({units: units3}));
      units2a && model.add(new Snake({units: units2a}));
      units2 && model.add(new Snake({units: units2}));
      units1a && model.add(new Snake({units: units1a}));
      units1 && model.add(new Snake({units: units1}));
      units0 && model.add(tf.layers.dense({units:units0, activation:'elu'}));
      model.add(tf.layers.dense({units:frameSize, activation:'elu'}));

      return model;
    }

    /**
     * Scale signal and split it up into frames for each detected word.
     */
    frameSignal(signal, opts={}) {
      let { frameSize, scale, threshold, dampen } = this;
      assert(signal instanceof Signal, 'signal must be a Signal');

      // detect words
      let splits = signal.split({threshold, dampen}).map(split=>{
        let { start, length } = split;
        let nFrames = Math.ceil(length/frameSize);
        let end = start + nFrames*frameSize;
        return { start, length, nFrames, end };
      });

      let { data } = signal;
      let frames = [];
      for (let iSplit = 0; iSplit < splits.length; iSplit++) {
        let { start, length, nFrames, end } = splits[iSplit];
        for (let i = 0; i < nFrames; i++) {
          let dataStart = start + i*frameSize;
          let frame = [...data.slice(dataStart, dataStart+frameSize)].map(v=>v/scale);
          frames.push(frame);
        }
      }

      return {splits, frames};
    }

    async train(args={}) {
      let {
        batchSize = 128,
        callbacks = {
          onEpochEnd: AutoEncoder.onEpochEnd,
        },
        epochs = 1000,
        frames,
        loss = tf.losses.meanSquaredError,
        metrics = ['mse'],
        optimizer = tf.train.adam(),
        shuffle = true,
        signal,
        validationSplit = 0.1,
        verbose = 0,
      } = args;
      let { model, frameSize, } = this;
      if (signal) {
        assert(!frames, "frames must be omitted if signal is present");
        frames = this.frameSignal(signal).frames;
      }
      assert(frames, "Signal or frames are required");

      model.compile({optimizer, loss, metrics});

      let tx = tf.tensor2d(frames);
      model.summary();
      return model.fit(tx, tx, Object.assign({}, args, {
        batchSize, 
        epochs, 
        shuffle, 
        verbose, 
        callbacks,
        validationSplit,
      }));
    }

  }

  module.exports = exports.AutoEncoder = AutoEncoder;
})(typeof exports === "object" ? exports : (exports = {}));
