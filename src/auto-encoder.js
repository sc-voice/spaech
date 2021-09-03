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
        codeActivation = 'snake',
        codeSize = 96,
        scale = 16384,
        sampleRate = 22050,
        threshold = 2,
        dampen = 36,
        encoderUnits,
        decoderUnits,
      } = args;

      encoderUnits = encoderUnits || [1,1,1/2,1/3,1/5].map(v=>frameSize*v);
      assert(Array.isArray(encoderUnits), "Expected Array for encoderUnits");
      encoderUnits = encoderUnits.map(v=>Math.round(v));
      decoderUnits = decoderUnits || [...encoderUnits].reverse();
      assert(Array.isArray(decoderUnits), "Expected Array for decoderUnits");
      decoderUnits = decoderUnits.map(v=>Math.round(v));
      Object.assign(this, {
        scale, threshold, dampen, sampleRate, 
        frameSize, codeSize, codeActivation,
        encoderUnits, decoderUnits,
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

    getWeights() {
      let { model } = this;
      let { layers } = model;

      return layers.map(layer => layer.getWeights());
    }

    createModel() {
      let { frameSize, codeSize, encoderUnits, decoderUnits, codeActivation} = this;
      let inputShape = [frameSize];
      let  model = tf.sequential();

      encoderUnits.forEach((units,i)=> i==0
        ? model.add(new Snake({units, inputShape}))
        : model.add(new Snake({units}))
      );

      if (codeActivation === 'snake') {
        model.add(new Snake({
          units: codeSize,
          name: `code_${codeActivation}`,
        }))
      } else {
        model.add(tf.layers.dense({
          units: codeSize, activation:codeActivation,
          name: `code_${codeActivation}`,
        }));
      }

      decoderUnits.forEach((units,i)=> i === decoderUnits.length-1
        ? model.add(new Snake({units: frameSize}))
        : model.add(new Snake({units})) 
      );

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
