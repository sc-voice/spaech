(function(exports) {
  const { logger } = require('log-instance');
  const assert = require('assert');
  const Compander = require('./compander');
  const Int16Frames = require(`./int16-frames`);
  const Signal = require('./signal');
  const FREQ_CHILD = 300;
  const FREQ_WOMAN = 255;     // adult woman speech 165-255Hz
  const FREQ_MAN = 85;        // adult male speech 85-155Hz
  const FMAX = 1.1*FREQ_CHILD;
  const FMIN = 0.9*FREQ_MAN;
  const SAMPLE_RATE = 22050;  // 2 * 3**2 * 5**2 * 7**2
  const TAU_MIN = Math.round(SAMPLE_RATE/FREQ_CHILD);       // 74
  const TAU_MIN_ADULT = Math.round(SAMPLE_RATE/FREQ_WOMAN); // 86
  const TAU_MAX = Math.round(SAMPLE_RATE/FREQ_MAN);         // 259
  const WINDOW_25MS = Math.round(SAMPLE_RATE * 0.025);      // 551
  const POLLY_AMPLITUDE = 16384;  // AWS Polly MP3 maximum speech amplitude
  const Chart = require('./chart');

  // http://audition.ens.fr/adc/pdf/2002_JASA_YIN.pdf
  // E1 is Equation (1) with pitch sampleIndex of 0
  // EA3 is Equation (A1) with pitch sampleIndex at mid-sample

  class YinPitch {
    constructor(args={}) {
      logger.logInstance(this);
      let {
        diffMax = 0.1,
        fMax = FMAX,
        fMin = FMIN,
        minAmplitude = POLLY_AMPLITUDE * .005,  // noise rejection
        maxAmplitude = POLLY_AMPLITUDE,         // speaking voice
        sampleRate = 22050,
        pitchPrecision = 1,                     // MP3 digitization assumption
        tSample,
        window = WINDOW_25MS,
      } = args;
      assert(Number.isInteger(window) && 0<window, 
        `[E_WINDOW] window size must be positive integer:${window}`);

      let tauMax = Math.round(sampleRate/fMin)+1; // allow for interpolation

      Object.assign(this, {
        diffMax,
        fMax,
        fMin,
        minAmplitude,
        maxAmplitude,
        pitchPrecision,
        sampleRate,
        tauMax,
        tauMin: Math.round(sampleRate/fMax)-1, // allow for interpolation
        window,
      });

      this.tSample = tSample == null ? Math.round(this.minSamples/2) : tSample;
    }

    static interpolateParabolic(x,y) {
      let x10 = x[1] - x[0];
      let x12 = x[1] - x[2];
      let y10 = y[1] - y[0];
      let y12 = y[1] - y[2];
      let numerator = x10**2 * y12 - x12**2 * y10;
      let denominator = x10*y12 - x12*y10;
      if (denominator === 0) {
        logger.warn(`zero denominator`, {x,y, x10,y12, x12, y10});
        return (x[0]+x[1]+x[2])/3;
      }
      return x[1] - 0.5 * numerator / denominator;
    }

    get minSamples() {
      let { window, tauMax, } = this;
      return tauMax + window;
    }

    autoCorrelate(samples, t1, tau, w=this.window) {
      let sum = 0;
      for (let i = t1; i < t1+w; i++) {
        sum += samples[i] * samples[i+tau];
      }
      return sum;
    }

    acfDifference(samples, tau) {
      let { window, tauMax, tSample } = this;
      let t1 = tSample ? Math.round(tSample - tau/2 - window/2) : 0;
      let tw = t1 + window -1;
      let nSamples = samples.length;
      try {
        assert(0 <= t1, `[E_T1_LOW]`);
        assert(tw < nSamples, `[E_T1_HIGH]`);

        let acft0 = this.autoCorrelate(samples, t1, 0, window);
        let acftau0 = this.autoCorrelate(samples, t1+tau, 0, window); 
        let acfttau = this.autoCorrelate(samples, t1, tau, window);
        let v =  acft0 + acftau0 - 2*acfttau;
        assert(!isNaN(v), `[E_NAN_ACFDIFF] t1:${t1} tau:${tau}`);
        return v;
      } catch(e) {
        console.warn(`Error: ${e.message}`, 
          JSON.stringify({t1, tw, nSamples, tau, window, tauMax, tSample}));
        throw e;
      }
    }

    pitch(samples) {
      let { 
        minSamples, window, tauMin, tauMax, sampleRate, diffMax, fMin, fMax, tSample, pitchPrecision,
      } = this;
      assert(Array.isArray(samples) || ArrayBuffer.isView(samples),
        `[E_SAMPLES] expected signal samples`);
      let nSamples = samples.length;
      assert(minSamples<=nSamples, `[E_NSAMPLES] expected:${minSamples} actual:${nSamples}`);
      let acf = [...new Int8Array(tauMin)].fill(diffMax+1); // ignore tau below tauMin
      let result = { pitch:0, pitchEst:0, tau:0, tauEst:0, tSample, tauMax, tauMin};
      Object.defineProperty(result, 'acf', {value:acf});

      let tauEst = undefined;
      for (let tau = tauMin; ; tau++) {
        let v = this.acfDifference(samples, tau, window);
        acf.push(v);
        if (tau >= tauMax) {
          break;
        }
        if (tauEst==null) {
          tauEst = tauMin < tau ? tau : undefined;
        } else if (acf[tau] < acf[tauEst]) {
          tauEst = tau || undefined;
        } else if (acf[tauEst] <= diffMax && acf[tau-1] <= diffMax) {
          break;
        }
      }

      let x = [ tauEst-1, tauEst, tauEst+1 ];
      let y = x.map(x=>acf[x]);
      assert(!isNaN(y[0]), `[E_NAN_ACF] x:${tauEst-1} tauMin:${tauMin} tauMax:${tauMax}`);
      assert(!isNaN(y[2]), `[E_NAN_ACF] x:${tauEst+1} tauMin:${tauMin} tauMax:${tauMax}`);
      let tau = YinPitch.interpolateParabolic(x,y);
      if (tau > 0) {
        let pitch = sampleRate / tau;
        pitch = Number(pitch.toFixed(pitchPrecision));
        if (fMin <= pitch && pitch <= fMax) {
          result.tau = tau;
          result.tauEst = tauEst;
          result.pitch = pitch;
          result.pitchEst = sampleRate/tauEst;
        }
      }
      return result;
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
      let chart = new Chart();
      let phase = Math.atan2(imaginary, real) + Math.PI/2;
      if (Math.PI <= phase) { phase -= 2*Math.PI; }
      else if (phase <= -Math.PI) { phase += 2*Math.PI; }
      return { phase, amplitude, phasor:{real, imaginary}, t1, tEnd, }
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

  }

  module.exports = exports.YinPitch = YinPitch;

})(typeof exports === "object" ? exports : (exports = {}));
