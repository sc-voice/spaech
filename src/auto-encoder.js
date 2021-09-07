(function(exports) {
  const isNode=new Function("try {return this===global;}catch(e){return false;}");
  const { logger } = require('log-instance');
  const tf = require(isNode() ? '@tensorflow/tfjs-node' : '@tensorflow/tfjs');
  const assert = require('assert');
  const Signal = require('./signal');
  const Snake = require('./snake');
  const Chart = require('./chart');
  const FRAME_SIZE = 192;
  const N_LAYERS = 3;

  class AutoEncoder {
    constructor(args={}) {
      logger.logInstance(this);
      let {
        model,
        frameSize = FRAME_SIZE,
        codeActivation = 'snake',
        codeSize = 96,
        scale = 16384,
        sampleRate = 22050,
        threshold = 2,
        dampen = 36,
        logEpoch = 10,
        encoderUnits=0.8,
        encoderLayers=N_LAYERS,
        encoderAlpha=1.61803398875, // Golden Ratio is least resonant
        decoderUnits,
        decoderAlpha,
      } = args;

      encoderUnits = AutoEncoder.coderUnits(encoderUnits, frameSize, encoderLayers);
      assert(Array.isArray(encoderUnits), "Expected Array for encoderUnits");
      encoderUnits = encoderUnits.map(v=>Math.round(v));
      decoderUnits = decoderUnits || [...encoderUnits].reverse();
      assert(Array.isArray(decoderUnits), "Expected Array for decoderUnits");
      decoderUnits = decoderUnits.map(v=>Math.round(v));
      decoderAlpha = decoderAlpha || (typeof encoderAlpha  === 'number' 
        ? encoderAlpha 
        : [...encoderAlpha].reverse());
      Object.assign(this, {
        scale, threshold, dampen, sampleRate, logEpoch,
        frameSize, codeSize, codeActivation,
        encoderUnits, decoderUnits,
        encoderAlpha, decoderAlpha,
        encoderLayers,
      });
      Object.defineProperty(this, '_model', {
        writable: true,
        value: model,
      });
    }

    static coderUnits(units, frameSize=FRAME_SIZE, nLayers=N_LAYERS) {
      if (Array.isArray(units)) {
        return units;
      }
      let n = Number(units);
      if (isNaN(n)) {
        throw this.error('E_AE_UNITS', `Expected number or array of numbers for units:${units}`);
      }
      let result = [];
      for (let i = 0; i < nLayers; i++) {
        let v = i ? result[i-1]*units : frameSize;
        result.push(Math.round(v));
      }
      return result;
    }

    static onEpochEnd(logEpoch) {
      return (epoch, log)=>{
        if (logEpoch && (epoch % logEpoch === 9)) {
          let { val_mse, mse } = log;
          console.log(`Epoch${epoch}: `, JSON.stringify({val_mse, mse}));
        }
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

    createModel(args={}) {
      let { 
        frameSize=this.frameSize, 
        codeSize=this.codeSize, 
        encoderUnits=this.encoderUnits,
        decoderUnits=this.decoderUnits,
        codeActivation=this.codeActivation,
        encoderAlpha=this.encoderAlpha, 
        decoderAlpha=this.decoderAlpha,
      } = args;
      let inputShape = [frameSize];
      let model = tf.sequential();

      encoderUnits.forEach((units,i)=>{
        let alpha = typeof encoderAlpha === 'number'
          ? Math.pow(encoderAlpha, i+1)
          : encoderAlpha[i];
        let name = `encoder${i+1}_a${alpha.toFixed(2)}`;
        let opts = i == 0
          ? {units, name, alpha, inputShape}
          : {units, name, alpha, };
        return model.add(new Snake(opts));
      });

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

      decoderUnits.forEach((units,i)=> {
        let alpha = typeof decoderAlpha === 'number'
          ? decoderAlpha * (decoderUnits.length - i)
          : decoderAlpha[i];
        let name = `decoder${i+1}_a${alpha.toFixed(2)}`;
        let opts = i === decoderUnits.length-1
          ? {units, name, alpha, frameSize}
          : {units, name, alpha, };
        return model.add(new Snake(opts));
      });

      console.trace(`created model`);

      return model;
    }

    async validateSignal(signal, model=this.model) {
      let { frames } = this.frameSignal(signal);
      let x = tf.tensor2d(frames);
      let y = await model.predict(x);
      let mse = tf.metrics.meanSquaredError(x, y).dataSync();
      return Signal.stats(mse);
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
      let { model, frameSize, } = this;
      let {
        batchSize = 128,
        callbacks,
        epochs = 100,
        frames,
        loss = 'meanSquaredError',
        logEpoch = this.logEpoch,
        metrics = ['mse'],
        optimizer = tf.train.adam(),
        shuffle = true,
        signal,
        validationSplit = 0,
        verbose = 0,
      } = args;
     if (callbacks == null) {
        callbacks = {
          onEpochEnd: AutoEncoder.onEpochEnd(logEpoch),
        }
      }
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
