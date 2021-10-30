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
      let {
        diffMax = 0.1,
        fMax = FMAX,
        fMin = FMIN,
        rFun = YinPitch.yinEA1,
        minPower = 0,
        minAmplitude = POLLY_AMPLITUDE * .005,  // noise rejection
        maxAmplitude = POLLY_AMPLITUDE,         // speaking voice
        sampleRate = 22050,
        tSample = 0,
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
        minPower,
        rFun,
        sampleRate,
        tauMax,
        tauMin: Math.round(sampleRate/fMax)-1, // allow for interpolation
        tSample,
        window,
      });
    }

    // Equation (1) with window left-aligned to time (i.e., t=0)
    static yinE1(samples, t, tau, w) {  
      assert(0<=t && t+w+tau<=samples.length, 
        `[E_E1_BOUNDS] yinE1 bounds violation [${t}, ${t+w+tau}] `+
        `samples:${samples.length}`);

      let sum = 0;
      for (let i = t; i < t+w; i++) {
        sum += samples[i] * samples[i+tau];
      }
      return sum;
    }

    // Equation (A1) with window centered on time (i.e., t≈window/2)
    static yinEA1(samples, t, tau, w) {
      let sum = 0;
      let nSamples = samples.length;
      let iStart = Math.round(t - tau/2 - w/2);
      let iEnd = iStart + w - 1;
      //console.log(`yinEA1`, iEnd-iStart);
      assert(0<=iStart && iStart<nSamples,
        `[E_EA1_START] yinEA1 bounds violation:\n`+
        JSON.stringify({iStart, iEnd, t, tau, nSamples}));
      assert(0<=iEnd && iEnd<nSamples, 
        `[E_EA1_END] yinEA1 bounds violation:\n`+
        JSON.stringify({iStart, iEnd, t, tau, nSamples, w}));

      for (let i = iStart; i <= iEnd; i++) {
        sum += samples[i] * samples[i+tau];
      }
      return sum;
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
      let { rFun, window, tauMax, tauMin, tSample, } = this;
      return tauMax + window;
      if (rFun === YinPitch.yinE1) {
        return tauMax + window + 1;
      }
      return 2*tauMax - tauMin + window;
    }

    autoCorrelate(samples, t, tau) {
      return YinPitch.yinE1(samples, t, tau, this.window);
    }

    acfDifference(samples, t, tau) {
      let acft0 = this.autoCorrelate(samples, t, 0);
      let acftau0 = this.autoCorrelate(samples, t+tau, 0); 
      let acfttau = this.autoCorrelate(samples, t, tau);
      return acft0 + acftau0 - 2*acfttau;
    }

    pitch(samples, tSample = this.tSample) {
      let { 
        rFun, minPower, minSamples, window, tauMin, tauMax, sampleRate, diffMax, fMin, fMax, 
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
        let t1 = tSample ? Math.round(tSample - tau/2) : 0;
        let tw = t1 + window -1;
        try {
          let rt0 = rFun(samples, t1, 0, window);
          assert(0 <= t1, `[E_T1_LOW] t1:${t1} tSample:${tSample} tau:${tau} nSamples:${nSamples}`);
          assert(tw<nSamples, 
            `[E_T1_HIGH] tw:${tw} tSample:${tSample} tau:${tau} nSamples:${nSamples}`);
          if (rt0/window < minPower) {
            return result;
          }
          // let v = acfDifference(samples, t1, tau); 
          // INLINE OPTIMIZATION (START)
          var rtau0 = rFun(samples, t1+tau, 0, window); 
          var rttau = rFun(samples, t1, tau, window);
          var v = rt0 + rtau0 - 2*rttau;
          // INLINE OPTIMIZATION (END)
        } catch(e) {
          console.warn(`Error: ${e.message}`, JSON.stringify({t1, tau, window, tauMax}));
          throw e;
        }

        assert(!isNaN(v), `[E_NAN_ACFDIFF] t1:${t1} tau:${tau}`);
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
        if (fMin <= pitch && pitch <= fMax) {
          result.tau = tau;
          result.tauEst = tauEst;
          result.pitch = pitch;
          result.pitchEst = sampleRate/tauEst;
        }
      }
      return result;
    }

    phaseAmplitude({samples, frequency}) {
      let { sampleRate } = this;
      assert(Array.isArray(samples) || ArrayBuffer.isView(samples),
        `[E_SAMPLES] expected signal samples`);
      assert(!isNaN(frequency) && 0 < frequency, `[E_FREQUENCY] must be positive number:${frequency}`);
      let samplesPerCycle = sampleRate/frequency;
      let nSamples = Math.round(Math.floor(samples.length/samplesPerCycle) * samplesPerCycle);
      assert(0<nSamples, `[E_SAMPLES_LENGTH] minimum:${samplesPerCycle} actual:${samples.length}`);
      let cosine = Signal.sineWave({frequency, nSamples, phase:Math.PI/2});
      let sine = Signal.sineWave({frequency, nSamples});
      let real = 0;
      let imaginary = 0;
      for (let t = 0; t < nSamples; t++) {
        let st = samples[t];
        real += st * cosine[t];
        imaginary += st * sine[t];
      }
      let amplitude = 2*Math.sqrt(real*real + imaginary*imaginary)/nSamples;
      let chart = new Chart();
      0 && chart.plot({data:[samples, cosine, sine]});
      let phase = Math.atan2(-imaginary, real) + Math.PI/2;
      if (Math.PI <= phase) { phase -= 2*Math.PI; }
      return { phase, amplitude, phasor:{real, imaginary}, nSamples, samplesPerCycle, }
    }

    harmonics(samples, opts={}) {
      let { 
        nHarmonics = 21,
        sampleRate = this.sampleRate,
        minAmplitude = this.minAmplitude,
        maxAmplitude = this.maxAmplitude,
      } = opts;
      let { pitch:f0 } = this.pitch(samples);
      let noHarmonic = { frequency:0, amplitude:0, phase:0 };
      let harmonics = [];
      if (f0) {
        let samplesPerCycle = sampleRate/f0;
        let nSamples = Math.round(Math.floor(samples.length/samplesPerCycle) * samplesPerCycle);
        let f0Samples = samples.slice(0, nSamples); // Discard partial cycles
        for (let i=0; i < nHarmonics; i++) {
          let frequency = (i+1)*f0;
          let pa = this.phaseAmplitude({samples:f0Samples, frequency});
          if (minAmplitude < pa.amplitude) {
            harmonics.push({ frequency, phase:pa.phase, amplitude:pa.amplitude, order:i});
          }
        }
      }

      return harmonics;
    }

  }

  module.exports = exports.YinPitch = YinPitch;

})(typeof exports === "object" ? exports : (exports = {}));
