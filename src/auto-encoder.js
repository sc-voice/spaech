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
        inputSize,
        codeActivation = 'snake',
        codeSize = 96,
        encoderUnits=0.8,
        encoderLayers=N_LAYERS,
        encoderAlpha=1.61803398875, // Golden Ratio is least resonant
        decoderUnits,
        decoderAlpha,
      } = args;

      inputSize = inputSize || frameSize;

      encoderUnits = AutoEncoder.coderUnits(encoderUnits, inputSize, encoderLayers);
      assert(Array.isArray(encoderUnits), "Expected Array for encoderUnits");
      encoderUnits = encoderUnits.map(v=>Math.round(v));
      decoderUnits = decoderUnits || [...encoderUnits].reverse();
      assert(Array.isArray(decoderUnits), "Expected Array for decoderUnits");
      decoderUnits = decoderUnits.map(v=>Math.round(v));
      decoderAlpha = decoderAlpha || (typeof encoderAlpha  === 'number' 
        ? encoderAlpha 
        : [...encoderAlpha].reverse());
      Object.assign(this, {
        frameSize, inputSize, codeSize, codeActivation,
        encoderUnits, decoderUnits,
        encoderAlpha, decoderAlpha,
        encoderLayers,
      });
      Object.defineProperty(this, '_model', {
        writable: true,
        value: model,
      });
    }

    static modelConfiguration(model) {
      let { layers } = model;
      let frameSize;
      let encoderUnits = [];
      let encoderAlpha = [];
      let decoderAlpha = [];
      let decoderUnits = [];
      let codeSize;
      let codeActivation;
      layers.forEach((layer,i)=> {
        let { units, alpha } = layer;
        let activation = layer.activation.constructor.name
          .toLowerCase()
          .replace(/activation/,'');
        if (i === 0) {
          frameSize = units;
          encoderUnits.push(units);
          encoderAlpha.push(alpha);
        } else if (units < layers[i-1].units) {
          if (units < layers[i+1].units) {
            codeSize = units;
            codeActivation = activation;
          } else {
            encoderUnits.push(units);
            encoderAlpha.push(alpha);
          }
        } else if (units > layers[i-1].units) {
          decoderUnits.push(units);
          decoderAlpha.push(alpha);
        }
      });

      return {
        //threshold = 2,
        codeActivation,
        codeSize, 
        decoderAlpha,
        decoderUnits,
        encoderAlpha, 
        encoderLayers: encoderUnits.length, 
        encoderUnits, 
        frameSize, 

      };
    }

    static coderUnits(units, inputSize=FRAME_SIZE, nLayers=N_LAYERS) {
      if (Array.isArray(units)) {
        return units;
      }
      let n = Number(units);
      assert(!isNaN(n), `[E_AE_UNITS] Expected number or array of numbers for units:${units}`);
      let result = [];
      for (let i = 0; i < nLayers; i++) {
        let v = i ? result[i-1]*units : inputSize;
        result.push(Math.round(v));
      }
      return result;
    }

    static onEpochEnd(logEpoch) {
      return (epoch, log)=>{
        if (logEpoch && (epoch % logEpoch === 9)) {
          let { val_mse, mse } = log;
          logger.info(`Epoch${epoch}: `, JSON.stringify({val_mse, mse}));
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
          ? Math.pow(decoderAlpha, decoderUnits.length-i)
          : decoderAlpha[i];
        let name = `decoder${i+1}_a${alpha.toFixed(2)}`;
        let opts = i === decoderUnits.length-1
          ? {units, name, alpha, frameSize}
          : {units, name, alpha, };
        return model.add(new Snake(opts));
      });

      return model;
    }

    async validateSignal(signal, opts={}) {
      let { model=this.model, } = opts;
      let { frames } = this.frameSignal(signal, opts);
      let x = tf.tensor2d(frames);
      let y = await model.predict(x);
      let mse = tf.metrics.meanSquaredError(x, y).dataSync();
      return Signal.stats(mse);
    }

    /**
     * Scale signal and split it up into frames for each detected word.
     */
    frameSignal(signal, opts={}) {
      let { frameSize, } = this;
      let { 
        threshold = 2,  // minimum signal that starts word
        dampen = 36,    // minium number of samples at or above threshold 
        scale = 16384,  // normalization to interval [0,1]
      } = opts;
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
          let frame = [...data.slice(dataStart, dataStart+frameSize)];
          frame = scale instanceof Array
            ? frame.map((v,i)=>v/scale[i])
            : frame.map((v,i)=>v/scale);
          frames.push(frame);
        }
      }

      return {splits, frames};
    }

    transform(signal, opts={}) {
      let { frameSize, model } = this;
      let { data: dataIn } = signal;
      let { 
        threshold = 2,  // minimum signal that starts word
        dampen = 36,    // minium number of samples at or above threshold 
        scale = 16384,  // normalization to interval [-1,1]
        transform = 'model',
        typeOut = dataIn.constructor,
      } = opts;
      let splits = signal.split({threshold, dampen});
      let dataOut = Reflect.construct(typeOut, [ dataIn.length ]);
      let predict = transform === 'model' ? x=>model.predict(x) : x=>x;
      let that = this;

      splits.forEach((split,i)=>{
        let { start, length } = split;
        let nFrames = Math.ceil(length/frameSize);
        let end = start + nFrames*frameSize;
        that.info(`transform word#${i+1}`, JSON.stringify({start, length}));
        for (let iFrame = start; iFrame < end; iFrame+=frameSize) {
          let frameIn = dataIn.subarray(iFrame,iFrame+frameSize);
          let y;
          if (scale instanceof Array) {
            let x = tf.tensor2d([[...frameIn].map((v,i)=>v/scale[i])]);
            y = typeOut === Float32Array
              ? predict(x).dataSync().map((v,i)=>v*scale[i])
              : predict(x).dataSync().map((v,i)=>Math.round(v*scale[i]));
          } else {
            let x = tf.tensor2d([[...frameIn].map(v=>v/scale)]);
            y = typeOut === Float32Array
              ? predict(x).dataSync().map(v=>v*scale)
              : predict(x).dataSync().map(v=>Math.round(v*scale));
          }
          dataOut.set(y, iFrame);
        }
      });
    
      return new Signal(dataOut);
    }


    async train(args={}) {
      let { model, inputSize} = this;
      let {
        batchSize = 128,
        callbacks,
        epochs = 100,
        frames,
        inputs,
        loss = 'meanSquaredError',
        logEpoch = 10,
        metrics = ['mse'],
        noiseAmplitude = 0,
        optimizer = tf.train.adam(),
        shuffle = true,
        signal,
        validationSplit = 0,
        verbose = 0,
     } = args;
     let that = this;

     if (callbacks == null) {
        callbacks = {
          onEpochEnd: AutoEncoder.onEpochEnd(logEpoch),
        }
      }
      if (inputs) {
        assert(!frames, "frames must be omitted if inputs are provided");
        assert(!signal, "signal must be omitted if inputs are provided");
      }
      if (signal) {
        assert(!frames, "frames must be omitted if signal is provided");
        assert(!inputs, "inputs must be omitted if signal is provided");
        inputs = this.frameSignal(signal).frames;
      }
      inputs = inputs || frames;
      assert(inputs, "One of signal, frames, or inputs is required");

      model.compile({optimizer, loss, metrics});

      let tx = tf.tensor2d(inputs);
      shuffle && tf.util.shuffle(tx);
      if (noiseAmplitude) {
        let noise = tf.mul(noiseAmplitude, tf.randomNormal([inputs.length, inputSize]));
        tx = tf.add(tx, noise);
        tx = tf.clipByValue(tx, -1, 1);
        that.info(`noiseAmplitude`, noiseAmplitude);
      }
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
