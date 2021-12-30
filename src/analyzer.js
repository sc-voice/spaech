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
        phasePrecision = 3,                     // digitized phase
      } = args;

      Object.assign(this, {
        minAmplitude,
        maxAmplitude,
        phasePrecision,
      });
    }

    phaseAmplitude({samples, frequency, verbose}) {
      let { sampleRate, tSample, phasePrecision} = this;
      assert(Array.isArray(samples) || ArrayBuffer.isView(samples),
        `[E_SAMPLES] expected signal samples`);
      assert(!isNaN(frequency) && 0 < frequency, `[E_FREQUENCY] must be positive number:${frequency}`);
      let samplesPerCycle = sampleRate/frequency;

      // If possible, sample two cycles for best accuracy (i.e. accuracy 1e-15 vs 4e-3)
      let nCycles = Math.floor((samples.length-2)/samplesPerCycle); 
      let cycleSamples = Math.round(samplesPerCycle * nCycles);
      assert(0<cycleSamples, 
        `[E_SAMPLES_LENGTH] frequency:${frequency} minimum:${cycleSamples} actual:${samples.length}`);

      let tStart = -tSample;
      let nSamples = samples.length;
      let cosine = Signal.sineWave({frequency, nSamples, phase:Math.PI/2, tStart});
      let sine = Signal.sineWave({frequency, nSamples, tStart});
      let real = 0;
      let imaginary = 0;
      let t1 = Math.round((nSamples-cycleSamples)/2);
      let tEnd = t1+cycleSamples;
      verbose && console.log(`phaseAmplitude`, {
        frequency, tStart, t1, tEnd, nSamples, samplesPerCycle, cycleSamples, nCycles, 
        slength:samples.length, tSample});
      assert(tEnd < nSamples,   
        `expected ${tEnd+1} samples for frequency:${frequency} nSamples:${nSamples}`);
      for (let t = t1; t < tEnd; t++) {
        let st = samples[t];
        real += st * cosine[t];
        let s = JSON.stringify({real, st, t, cosine: cosine[t]});
        imaginary -= st * sine[t];
      }
      let amplitude = 2*Math.sqrt(real*real + imaginary*imaginary)/cycleSamples;
      let phase = Math.atan2(imaginary, real) + Math.PI/2;
      if (Math.PI <= phase) { phase -= 2*Math.PI; }
      else if (phase <= -Math.PI) { phase += 2*Math.PI; }
      phase = Number(phase.toFixed(phasePrecision));
      return { frequency, phase, amplitude, phasor:{real, imaginary}, t1, tEnd, nCycles }
    }

    harmonics(samples, opts={}) {
      let { 
        nHarmonics = 21,
        sampleRate = this.sampleRate,
        minAmplitude = this.minAmplitude,
        maxAmplitude = this.maxAmplitude,
        tSample = this.tSample,
        verbose,
      } = opts;
      let f0Pitch = this.pitch(samples);
      let { pitch:f0, } = f0Pitch;
      if (f0 === 0) { return []; }
      let nSamples = samples.length;
      let samplesPerCycle = sampleRate/f0;
      let f0Samples = Math.round(Math.floor(nSamples/samplesPerCycle) * samplesPerCycle);
      let tStart = -tSample;

      // estimate harmonic amplitudes
      let sbuf = samples.slice(); 
      let harmonics = [];
      for (let i=0; i < nHarmonics; i++) {
        let frequency = (i+1)*f0;
        let pa = this.phaseAmplitude({samples:sbuf, frequency});
        if (minAmplitude < pa.amplitude) {
          let { phase, amplitude } = pa;
          harmonics.push({ frequency, phase, amplitude, order:i});
          sbuf = Signal.sineWave({nSamples, frequency, phase, scale:amplitude, tStart})
            .map((v,j)=>(sbuf[j]-v)); // subtract analyzed harmonic from signal
        } else {
          verbose && console.log(`harmonics rejected`, {frequency, minAmplitude, pa, f0Samples});
        }
      }

      // In general, f0 is not a factor of sampleRate, so we
      // subtract higher amplitude harmonics from the signal
      // to get a finer resolution for lower amplitude harmonics.
      let orders = harmonics.map(h=>h.order)
        .sort((a,b)=>harmonics[b].amplitude - harmonics[a].amplitude);
      //verbose && orders.forEach(i=>console.log(harmonics[i].amplitude));

      sbuf = samples.slice(); 
      for (let i=0; i < nHarmonics; i++) {
        let order = orders[i];
        let harmonic = harmonics[order];
        let { frequency } = harmonic;
        let pa = this.phaseAmplitude({samples:sbuf, frequency});
        if (minAmplitude < pa.amplitude) {
          let { phase, amplitude } = pa;
          harmonic.phase = pa.phase;
          harmonic.amplitude = pa.amplitude;
          sbuf = Signal.sineWave({nSamples, frequency, phase, scale:amplitude, tStart})
            .map((v,j)=>(sbuf[j]-v)); // subtract analyzed harmonic from signal
        } else {
          verbose && console.log(`harmonics rejected`, {frequency, minAmplitude, pa, f0Samples});
        }
      }

      return harmonics;
    }

    analyze(samples, opts={}) {
      let harmonics = this.harmonics(samples, opts);
      return {
        harmonics,
      }
    }

  }

  module.exports = exports.Analyzer = Analyzer;

})(typeof exports === "object" ? exports : (exports = {}));
