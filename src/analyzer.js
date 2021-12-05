(function(exports) {
  const assert = require('assert');
  const Signal = require('./signal');
  const POLLY_AMPLITUDE = 16384;  // AWS Polly MP3 maximum speech amplitude
  const YinPitch = require('./yin-pitch');

  class Analyzer extends YinPitch {
    constructor(args={}) {
      super(args);
      let {
        minAmplitude = POLLY_AMPLITUDE * .005,  // noise rejection
        maxAmplitude = POLLY_AMPLITUDE,         // speaking voice
      } = args;

      Object.assign(this, {
        minAmplitude,
        maxAmplitude,
      });
    }

    phaseAmplitude({samples, frequency, verbose}) {
      let { sampleRate, tSample, } = this;
      assert(Array.isArray(samples) || ArrayBuffer.isView(samples),
        `[E_SAMPLES] expected signal samples`);
      assert(!isNaN(frequency) && 0 < frequency, `[E_FREQUENCY] must be positive number:${frequency}`);
      let samplesPerCycle = sampleRate/frequency;

      // If possible, sample two cycles for best accuracy (i.e. accuracy 1e-15 vs 4e-3)
      let nCycles = Math.floor(samples.length/samplesPerCycle); 
      let cycleSamples = Math.round(samplesPerCycle * nCycles);
      assert(0<cycleSamples, `[E_SAMPLES_LENGTH] minimum:${cycleSamples} actual:${samples.length}`);

      let tStart = -tSample;
      let nSamples = samples.length;
      let cosine = Signal.sineWave({frequency, nSamples, phase:Math.PI/2, tStart});
      let sine = Signal.sineWave({frequency, nSamples, tStart});
      let real = 0;
      let imaginary = 0;
      let t1 = Math.max(0,Math.round(tSample-cycleSamples/2));
      let tEnd = t1+cycleSamples;
      verbose && console.log(`phaseAmplitude`, {
        tStart, t1, tEnd, nSamples, samplesPerCycle, cycleSamples, nCycles, 
        slength:samples.length, tSample});
      for (let t = t1; t < tEnd; t++) {
        let st = samples[t];
        real += st * cosine[t];
        imaginary -= st * sine[t];
      }
      let amplitude = 2*Math.sqrt(real*real + imaginary*imaginary)/cycleSamples;
      let phase = Math.atan2(imaginary, real) + Math.PI/2;
      if (Math.PI <= phase) { phase -= 2*Math.PI; }
      else if (phase <= -Math.PI) { phase += 2*Math.PI; }
      return { phase, amplitude, phasor:{real, imaginary}, t1, tEnd, nCycles }
    }

    harmonics(samples, opts={}) {
      let { 
        nHarmonics = 21,
        sampleRate = this.sampleRate,
        minAmplitude = this.minAmplitude,
        maxAmplitude = this.maxAmplitude,
        verbose,
      } = opts;
      let f0Pitch = this.pitch(samples);
      let { pitch:f0, } = f0Pitch;
      let harmonics = [];
      if (f0) {
        let samplesPerCycle = sampleRate/f0;
        let f0Samples = Math.round(Math.floor(samples.length/samplesPerCycle) * samplesPerCycle);
        for (let i=0; i < nHarmonics; i++) {
          let frequency = (i+1)*f0;
          let pa = this.phaseAmplitude({samples, frequency});
          if (minAmplitude < pa.amplitude) {
            harmonics.push({ frequency, phase:pa.phase, amplitude:pa.amplitude, order:i});
          } else {
            verbose && console.log(`harmonics rejected`, {frequency, minAmplitude, pa, f0Samples});
          }
        }
      }

      return harmonics;
    }

    analyzeBlock(samples, opts={}) {
      let harmonics = this.harmonics(samples, opts);
      return {
        harmonics,
      }
    }

  }

  module.exports = exports.Analyzer = Analyzer;

})(typeof exports === "object" ? exports : (exports = {}));
