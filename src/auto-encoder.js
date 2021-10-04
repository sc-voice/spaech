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
  const SCALE = 16384; // typical calm speaking voice amplitude (AN9.20_4.3.mp3)
  const AGG_MAP = {};

  class AutoEncoder {
    constructor(args={}) {
      logger.logInstance(this);
      let {
        model,
        outputSize,
        inputSize,
        codeActivation = 'snake',
        codeSize = 96,
        encoderUnits=0.8,
        decoderLayers,
        encoderLayers=N_LAYERS,
        encoderAlpha=1.61803398875, // Golden Ratio is least resonant
        decoderUnits,
        decoderAlpha,
        scale,
        scaleIn,
        scaleOut,
      } = args;

      scaleIn = scaleIn || scale || SCALE;
      scaleOut = scaleOut || scale || SCALE;

      outputSize = outputSize || inputSize;
      inputSize = inputSize || outputSize;
      assert(outputSize && inputSize, 
        `[E_INPUTSIZE_OUTPUTSIZE] outputSize and/or inputSize are required`);
      assert(!isNaN(inputSize), `[E_INPUTSIZE] expected number:${inputSize}`);
      assert(!isNaN(outputSize), `[E_OUPUTSIZE] expected number:${outputSize}`);
      decoderLayers = decoderLayers || encoderLayers;

      this.encoderUnits = AutoEncoder.coderUnits(encoderUnits, inputSize, encoderLayers);
      assert(Array.isArray(this.encoderUnits), "Expected Array for encoderUnits");
      this.encoderUnits = this.encoderUnits.map(v=>Math.round(v));
      if (decoderUnits == null) {
        if (inputSize === outputSize && decoderLayers === encoderLayers) {
          decoderUnits = [...this.encoderUnits].reverse();
        } else {
          let outputRatio = Math.pow(codeSize / outputSize, 1/decoderLayers);
          decoderUnits = AutoEncoder.coderUnits(outputRatio, outputSize, decoderLayers).reverse();
        }
      }
      assert(Array.isArray(decoderUnits), "Expected Array for decoderUnits");
      decoderUnits = decoderUnits.map(v=>Math.round(v));
      decoderAlpha = decoderAlpha || (typeof encoderAlpha  === 'number' 
        ? encoderAlpha 
        : [...encoderAlpha].reverse());
      Object.assign(this, {
        inputSize, outputSize, codeSize, codeActivation,
        decoderUnits,
        encoderAlpha, decoderAlpha,
        encoderLayers, decoderLayers,
        scaleIn, scaleOut,
      });
      Object.defineProperty(this, '_model', {
        writable: true,
        value: model,
      });
    }

    /*
     * A frame aggregate vector factory
     */
    static aggFrame(frameSize, scale=1, fAgg='cos') {
      if (fAgg === 'cos') {
        fAgg = Math.cos;
      } else if (fAgg === 'sin') {
        fAgg = Math.sin;
      } else {
        assert(false, `[E_AGG_FUN] expected aggregate function name:${fAgg}`); 
      }
      let key = `${fAgg}_${frameSize}_${scale}`;
      let aggFrame = AGG_MAP[key] = AGG_MAP[key] || [];
      if (aggFrame.length === 0) {
        for (let i = 0; i < frameSize; i++) {
          let t = i / frameSize;
          aggFrame.push(scale*fAgg(2*Math.PI*t));
        }
      }
      return aggFrame;
    }

    /**
     * Scale signal and split it up into frames for each detected word.
     */
    static frameSignal(signal, opts={}) {
      let { 
        frameSize,
        threshold = 2,    // minimum signal that starts word
        dampen,           // minium number of samples at or above threshold 
        scale = 16384,    // normalization to interval [0,1]
        aggregate = null, // extend each frame with given frame aggregate
      } = opts;
      assert(!isNaN(frameSize), `[E_FRAMESIZE] frameSize is required:${frameSize}`);
      assert(signal instanceof Signal, 'signal must be a Signal');
      if (aggregate) {
        assert(typeof scale === 'number' || typeof scale[frameSize] === 'number',
          `[E_SCALE] scale must have value for frame aggregate:${scale}`);
        if (typeof aggregate === 'string') {
          let aggVec = AutoEncoder.aggFrame(frameSize, 1, aggregate);
          aggregate = (a,v,i) => v*aggVec[i] + a;
        }
      }
      dampen = dampen == null 
        ? (threshold ? 36 : 0) 
        : dampen;

      // detect words
      let splits = signal.split({threshold, dampen}).map(split=>{
        let { start, length } = split;
        let nFrames = Math.ceil(length/frameSize);
        let end = start + nFrames*frameSize;
        return { start, length, nFrames, end };
      });

      let { data } = signal;
      let frames = [];
      let aggMax = 0;
      let aggMin = 0;
      for (let iSplit = 0; iSplit < splits.length; iSplit++) {
        let { start, length, nFrames, end } = splits[iSplit];
        for (let i = 0; i < nFrames; i++) {
          let dataStart = start + i*frameSize;
          let frame = [...data.slice(dataStart, dataStart+frameSize)]; // convert from TypedArray
          while (frame.length < frameSize) {
            frame.push(0);
          }
          frame = scale instanceof Array
            ? frame.map((v,i)=>v/scale[i])
            : frame.map((v,i)=>v/scale);
          if (aggregate) {
            let agg = frame.reduce(aggregate, 0);
            aggMax < agg && (aggMax = agg);
            agg < aggMin && (aggMin = agg);
            frame.push(frame.reduce(aggregate,0));
          }
          frames.push(frame); 
        }
      }
      if (aggregate) {
        let aggScale = 1 / Math.max(Math.abs(aggMin), Math.abs(aggMax));
        frames = frames.map(f=>{
          f[frameSize] *= aggScale;
          return f;
        });
      }

      return {splits, frames};
    }

    static modelConfiguration(model) {
      let { layers } = model;
      let inputSize;
      let outputSize;
      let encoderUnits = [];
      let encoderAlpha = [];
      let decoderAlpha = [];
      let decoderUnits = [];
      let iCode = Math.floor(layers.length/2);
      let codeActivation;
      layers.forEach((layer, i) => {
        let { units } = layer;
        let activation = layer.activation.constructor.name
          .toLowerCase()
          .replace(/activation/,'');
        if (units < layers[iCode].units) {
          iCode = i;
        }
        if (iCode === i) {
          codeActivation = activation;
        }
      });
      let codeSize = layers[iCode].units;
      layers.forEach((layer,i)=> {
        let { units, alpha } = layer;
        if (i === 0) {
          inputSize = units;
          encoderUnits.push(units);
          encoderAlpha.push(alpha);
        } else if (i < iCode) {
          encoderUnits.push(units);
          encoderAlpha.push(alpha);
        } else if (iCode < i) {
          outputSize = units;
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
        decoderLayers: decoderUnits.length,
        encoderUnits, 
        inputSize,
        outputSize,

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
          logger.info(`Epoch${epoch}: `, {mse:mse.toExponential(8)});
        }
      }
    }

    get frameSize() {
      throw this.error(`[E_FRAMESIZE]`,
        `frameSize is no longer supported. Use either inputSize or outputSize`);
    }

    get model() {
      let { _model: model, codeSize, } = this;
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
        outputSize=this.outputSize, 
        inputSize=this.inputSize,
        codeSize=this.codeSize, 
        encoderUnits=this.encoderUnits,
        decoderUnits=this.decoderUnits,
        codeActivation=this.codeActivation,
        encoderAlpha=this.encoderAlpha, 
        decoderAlpha=this.decoderAlpha,
      } = args;
      let inputShape = [inputSize];
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
          ? {units, name, alpha, outputSize}
          : {units, name, alpha, };
        return model.add(new Snake(opts));
      });

      return model;
    }

    async predict(inputs, opts={}) {
      assert(inputs, `[E_INPUTS_RQD] inputs required: ${inputs}`);
      try {
        let x = tf.tensor2d(inputs);
        let y = await this.model.predict(x);
        return y.data();
      } catch(e) {
        throw this.error(`[E_PREDICT]`, e.message);
      }
    }

    async validateSignal(signal, opts={}) {
      let { model=this.model, inputs, outputs} = opts;
      if (outputs == null) {
        assert(signal, `[E_SIGNAL_RQD] signal is required if no outputs are provided`);
        let framed = AutoEncoder.frameSignal(signal, opts);
        outputs = framed.frames;
      }

      try {
        let x = tf.tensor2d(inputs);
        let yExpected = tf.tensor2d(outputs);
        let y = await model.predict(x);
        let mse = tf.metrics.meanSquaredError(y, yExpected).dataSync();
        return Signal.stats(mse);
      } catch(e) {
        throw this.error(`[E_VALIDATE_SIGNAL]`, e.message);
      }
    }

    transform(signal, opts={}) {
      let { inputSize, outputSize, model } = this;
      let { data: dataIn } = signal;
      let { 
        threshold = 2,  // minimum signal that starts word
        dampen = 36,    // minium number of samples at or above threshold 
        scale,          // normalization to interval [-1,1]
        scaleIn,
        scaleOut,
        transform = 'model',
        typeOut = dataIn.constructor,
      } = opts;
      let splits = signal.split({threshold, dampen});
      let dataOut = Reflect.construct(typeOut, [ dataIn.length ]);
      let predict = transform === 'model' ? x=>model.predict(x) : x=>x;
      let that = this;
      scaleIn = scaleIn || scale || this.scaleIn;
      scaleOut = scaleOut || scale || this.scaleOut;
      assert(scaleIn, `[E_SCALE_IN] required array or number: scaleIn`);
      assert(scaleOut, `[E_SCALE_OUT] required array or number: scaleOut`);

      splits.forEach((split,i)=>{
        let { start, length } = split;
        let nFrames = Math.ceil(length/inputSize);
        let end = start + nFrames*inputSize;
        that.info(`transform word#${i+1}`, JSON.stringify({start, length}));
        for (let iFrame = start; iFrame < end; iFrame+=inputSize) {
          let frameIn = dataIn.subarray(iFrame,iFrame+inputSize);
          let x;
          if (scaleIn instanceof Array) {
            x = tf.tensor2d([[...frameIn].map((v,i)=>v/scaleIn[i])]);
          } else {
            x = tf.tensor2d([[...frameIn].map(v=>v/scaleIn)]);
          }
          let y = predict(x);
          let yData = y.dataSync();
          let floatOut = typeOut == Float32Array || typeOut === Float64Array || typeOut == Array;
          if (scaleOut instanceof Array) {
            yData = floatOut
              ? yData.map((v,i)=>v*scaleOut[i])
              : yData.map((v,i)=>Math.round(v*scaleOut[i]));
          } else {
            yData = floatOut
              ? yData.map(v=>v*scaleOut)
              : yData.map(v=>Math.round(v*scaleOut));
          }
          dataOut.set(yData, iFrame);
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
        inputs,
        loss = 'meanSquaredError',
        logEpoch = 10,
        metrics = ['mse'],
        noiseAmplitude = 0,
        optimizer = tf.train.adam(),
        outputs,
        shuffle = true,
        validationSplit = 0,
        verbose = 0,
     } = args;
     let that = this;

     if (callbacks == null) {
        callbacks = {
          onEpochEnd: AutoEncoder.onEpochEnd(logEpoch),
        }
      }
      assert(inputs, "[E_INPUTS] inputs is required");
      outputs = outputs || inputs;

      model.compile({optimizer, loss, metrics});

      let tx = tf.tensor2d(inputs);
      let ty;
      if (inputs === outputs) {
        ty = tx;
        shuffle && tf.util.shuffle(tx);
      } else {
        ty = tf.tensor2d(outputs);
        shuffle && tf.util.shuffleCombo(tx, ty);
      }
      if (noiseAmplitude) {
        let noise = tf.mul(noiseAmplitude, tf.randomNormal([inputs.length, inputSize]));
        tx = tf.add(tx, noise);
        tx = tf.clipByValue(tx, -1, 1);
        that.info(`train() randomNormal noiseAmplitude`, noiseAmplitude);
      }
      return model.fit(tx, ty, Object.assign({}, args, {
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
