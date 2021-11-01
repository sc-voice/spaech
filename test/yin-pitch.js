(typeof describe === 'function') && describe("yin-pitch", function() {
  const should = require("should");
  const fs = require('fs');
  const path = require('path');
  const { WaveFile } = require('wavefile');
  let {
    Chart,
  } = require('../index');

  let {
    Mdct,
    Resonator,
    Signal,
    YinPitch,
  } = require('../index');

  const FREQ_CHILD = 300;
  const FREQ_WOMAN = 255;     // adult woman speech 165-255Hz
  const FREQ_MAN = 85;        // adult male speech 85-155Hz
  const FREQ_ADULT = (FREQ_MAN+FREQ_WOMAN)/2;
  const FMAX = 1.1*FREQ_CHILD;
  const FMIN = 0.9*FREQ_MAN;
  const SAMPLE_RATE = 22050;  // 2 * 3**2 * 5**2 * 7**2
  const TAU_MIN = Math.round(SAMPLE_RATE/FMAX)-1;     // 72
  const TAU_MIN_ADULT = Math.round(SAMPLE_RATE/FREQ_WOMAN); // 86
  const TAU_MAX = Math.round(SAMPLE_RATE/FMIN)+1;       // 260
  const WINDOW_25MS = Math.round(SAMPLE_RATE * 0.025);      // 551
  const MIN_SAMPLES = TAU_MAX+WINDOW_25MS+50;               // 841 

  this.timeout(10*1000);

  function zeros(n) {
    return new Array(n).fill(0);
  }

  it("default ctor()", ()=>{
    let verbose = 0;
    let window = WINDOW_25MS;
    let sampleRate = 22050; // default
    let fMin = FMIN;
    let fMax = FMAX;
    let tauMin = TAU_MIN;
    let tauMax = TAU_MAX;
    let minSamples = window + tauMax;
    let tSample = minSamples/2;
    let diffMax = 0.1; // acceptable ACF difference
    let yp = new YinPitch();

    should(yp).properties({ 
      window, sampleRate, fMin, fMax, diffMax, tauMin, tauMax, minSamples, tSample,
    });
  });
  it("autoCorrelate()", ()=>{
    let verbose = 0;
    let nSamples = 100;
    let frequency = 700;
    let samples = Signal.sineWave({frequency, nSamples});
    let ypa = [
      new YinPitch({window: 8}),
      new YinPitch({window: 9}),
      new YinPitch({window: 10}),
      new YinPitch({window: 11}),
      new YinPitch({window: 12}),
    ];
    let t = 0; // pitch at time t
    let acva = ypa.map(yp=>zeros(nSamples-yp.window)
      .map((v,tau)=>yp.autoCorrelate(samples, t,tau)));
    let stats = acva.map(acv=>Signal.stats(acv));
    verbose && (new Chart({data:acva})).plot();

    // peaks depend on window size
    should.deepEqual(stats.map(s=>s.iMax), [ 66, 34, 2, 33, 64 ]);
  });
  it("acfDifference()", ()=>{
    let verbose = 0;
    let nSamples = 100;
    let Q = 40; // determines arbitrary frequency to be detected
    let frequency = SAMPLE_RATE / Q;
    let phase = Math.PI/3; // arbitrary phase
    let samples = Signal.sineWave({frequency, nSamples, phase});
    let tSample = 0;
    let ypa = [
      new YinPitch({tSample, samples, window: 8}),
      new YinPitch({tSample, samples, window: 9}),
      new YinPitch({tSample, samples, window: 10}),
      new YinPitch({tSample, samples, window: 11}),
      new YinPitch({tSample, samples, window: 12}),
    ];
    let t = 0; // pitch at time t
    let da = ypa.map(yp=>zeros(nSamples-yp.window)
      .map((v,tau)=>yp.acfDifference(samples, tau)));
    let daz = da.map(d=>
      d.reduce(((a,v,i) => a==null || (d[i] < d[a]) ? (i || undefined) : a),undefined)
    );

    // The computed Q will be an integer multiple of the original Q
    should.deepEqual(daz, [Q, Q, Q, Q, Q]);
    let title=`LEGEND: 1:samples, 2:ACFdifference/10`;
    verbose && (new Chart({title,data:[samples, da[2].map(v=>v/10)]})).plot();
  });
  it("interpolateParabolic()", ()=>{
    let a = 2;
    let b = 3;
    let c = 4;
    let fx = x => a*x**2 + b*x + c;
    let xMin = - b/(2*a);
    let x = [ xMin-1, xMin+1, xMin+2 ];
    let y = x.map(x=>fx(x));
    let xInterp = YinPitch.interpolateParabolic(x,y);
    should(xInterp).equal(xMin);
  });
  it("pitch() sin FREQ_MAN", ()=>{
    let verbose = 0;
    let frequency = FREQ_MAN;
    let phase = Math.random()*2*Math.PI; 
    let yp = new YinPitch();
    let nSamples = yp.minSamples;
    let sustain = 0.999;
    let samples = Signal.sineWave({ frequency, nSamples, phase, sustain });
    let { pitch, pitchEst, tau, tauEst, acf, tSample, equation } = yp.pitch(samples);
    should(tSample).equal(nSamples/2);
    let title=`LEGEND: 1:samples, 2:ACFdifference`;
    let xInterval = 4;
    verbose && (new Chart({title:'samples',data:[samples],xInterval})).plot();
    verbose && (new Chart({title:'ACFdifference',data:[acf],xInterval})).plot();
    let error = Math.abs(pitch-frequency);
    verbose && console.log(`YIN`, {
      frequency, phase, pitch, pitchEst, error, tau, tauEst, nSamples, 
      window: yp.window,
      tauMin: yp.tauMin,
      tauMax: yp.tauMax,
    });
    should(pitch).above(0, `could not detect pitch for phase:${phase}`);
    should(error).below(0.39); // error rate goes down as sustain approaches 1
  });
  it("pitch() FREQ_ADULT (E1)", ()=>{
    let verbose = 0;
    let frequency = FREQ_ADULT;
    let phase = 3.602657466317041;
    let sustain = 0.999;
    let tSample = 0; // equation (1)
    let yp = new YinPitch({tSample});
    should(yp).properties({tSample});
    let nSamples = yp.minSamples;
    let samples = Signal.sineWave({ frequency, nSamples, phase, sustain });
    let { pitch, pitchEst, tau, tauEst, acf, } = yp.pitch(samples);
    let xInterval = 10;
    let lines = 7;
    verbose && (new Chart({title:'samples',data:[samples],xInterval,lines})).plot();
    verbose && (new Chart({title:'ACFdifference',data:[acf],xInterval,lines})).plot();
    let error = Math.abs(pitch-frequency);
    verbose && console.log(`YIN`, {
      frequency, phase, pitch, pitchEst, error, tau, tauEst, nSamples, 
      window: yp.window,
      tauMin: yp.tauMin,
      tauMax: yp.tauMax,
    });
    should(pitch).above(0, `could not detect pitch for phase:${phase}`);
    should(error).below(0.21); // error rate decreases with frequency
    should(pitch).equal(169.97871589219946);
  });
  it("pitch() FREQ_ADULT (EA1)", ()=>{
    let verbose = 0;
    let frequency = FREQ_ADULT;
    let phase = 3.602657466317041;
    let sustain = 0.999;
    let tSample = 420;  // equation (A1)
    let yp = new YinPitch({tSample});
    let nSamples = yp.minSamples; 
    should(nSamples).equal(840);
    let samples = Signal.sineWave({ frequency, nSamples, phase, sustain });
    let { pitch, pitchEst, tau, tauEst, acf, } = yp.pitch(samples);
    let xInterval = 10;
    let lines = 7;
    verbose && (new Chart({title:'samples',data:[samples],xInterval,lines})).plot();
    verbose && (new Chart({title:'ACFdifference',data:[acf],xInterval,lines})).plot();
    let error = Math.abs(pitch-frequency);
    verbose && console.log(`YIN`, {
      frequency, phase, pitch, pitchEst, error, tau, tauEst, nSamples, 
      window: yp.window,
      tauMin: yp.tauMin,
      tauMax: yp.tauMax,
    });
    should(pitch).above(0, `could not detect pitch for phase:${phase}`);
    should(error).below(0.21); // error rate decreases with frequency
    should(pitch).equal(170.16646563135347); // different than E1
  });
  it("pitch() changing frequencies", ()=>{
    let verbose = 0;
    let frequency = 200;
    let dFreq = -2;
    let frequency1 = frequency - dFreq;
    let frequency2 = frequency + dFreq;
    let phase = 3.602657466317041;
    let yp = new YinPitch();
    let tSample = 1000;
    let nSamples = 2000;
    let hr = new Resonator({frequency:frequency1, phase});
    let samples = hr.oscillate({frequency:frequency2, tween:1, nSamples});
    let { pitch, pitchEst, tau, tauEst, acf, } = yp.pitch(samples);
    let xInterval = 10;
    let lines = 7;
    verbose && (new Chart({title:'samples',data:[samples],xInterval,lines})).plot();
    verbose && (new Chart({title:'ACFdifference',data:[acf],xInterval,lines})).plot();
    let error = Math.abs(pitch-frequency);
    verbose && console.log(`YIN`, {
      frequency, phase, pitch, pitchEst, error, tau, tauEst, nSamples, 
      window: yp.window,
      tauMin: yp.tauMin,
      tauMax: yp.tauMax,
    });
    should(pitch).above(0, `could not detect pitch for phase:${phase}`);
    should(pitch).equal(200.35726481680805);  // pitch is determined from mid-sample
  });
  it("pitch() FREQ_WOMAN", ()=>{
    let verbose = 0;
    let frequency = FREQ_WOMAN;
    let phase = Math.random()*2*Math.PI; 
    let sustain = 0.999;
    let yp = new YinPitch();
    let nSamples = yp.minSamples;
    let samples = Signal.sineWave({ frequency, nSamples, phase, sustain });
    let { pitch, pitchEst, tau, tauEst, acf, } = yp.pitch(samples);
    should(pitch).above(0, `could not detect pitch for phase:${phase}`);
    let xInterval = 4;
    verbose && (new Chart({title:'samples',data:[samples],xInterval})).plot();
    verbose && (new Chart({title:'ACFdifference',data:[acf],xInterval})).plot();
    let error = Math.abs(pitch-frequency);
    verbose && console.log(`YIN`, {
      frequency, phase, pitch, pitchEst, error, tau, tauEst, nSamples, 
      window: yp.window, tauMin: yp.tauMin, tauMax: yp.tauMax, });
    let e = 0.13; // error rate goes down as sustain approaches 1
    should(pitch).above(frequency-e).below(frequency+e);
    should(pitch).above(frequency-e).below(frequency+e);
  });
  it("pitch() FREQ_CHILD (scale, typedarray)", ()=>{
    let verbose = 0;
    let frequency = FREQ_CHILD;
    let phase = Math.random()*2*Math.PI; 
    let sustain = 0.999;
    let type = Int16Array;
    let scale = 16384;
    let yp = new YinPitch();
    let nSamples = yp.minSamples;
    let samples = Signal.sineWave({ frequency, nSamples, phase, sustain, scale, type });
    let { pitch, pitchEst, acf, tau, tauEst, } = yp.pitch(samples);
    should(pitch).above(0, `could not detect pitch for phase:${phase}`);
    let title=`LEGEND: 1:samples, 2:ACFdifference`;
    let error = Math.abs(pitch-frequency);
    let xInterval = 10;
    verbose && (new Chart({title:'samples',data:[samples],xInterval})).plot();
    verbose && (new Chart({title:'ACFdifference',data:[acf],xInterval})).plot();
    verbose && console.log(`YIN`, {
      frequency, phase, pitch, pitchEst, error, tau, tauEst, nSamples, 
      window: yp.window, tauMin: yp.tauMin, tauMax: yp.tauMax, });
    should(error).below(0.08); // error rate decreases with frequency
  });
  it("TESTTESTphaseAmplitude() sin 140Hz", ()=>{
    let verbose = 1;
    let scale = 10000;
    let sampleRate = 22050;
    let frequency = 140; // not a factor of sampleRate
    let nCycles = 2.5;
    let samplesPerCycle = sampleRate/frequency;
    let nSamples = Math.round(samplesPerCycle*nCycles);
    let tSample = Math.round(nSamples/2);
    let yp = new YinPitch({tSample});
    let tStart = -tSample;
    let chart = new Chart({xInterval:1,lines:15});
    let n = 50; // test 50 samples from [0, 2*Math.PI]
    let phase = 0;
    let samples = Signal.sineWave({ frequency, nSamples, phase, scale, sampleRate, tStart });
    let pa = yp.phaseAmplitude({samples, frequency, });
    let phaseError = Math.abs(phase - pa.phase);
    let amplitudeError = Math.abs(scale - pa.amplitude);
    let precision = 4;
    let title = `samples phase:0 tSample:${tSample}\n`;
    verbose && chart.plot({title, data:[samples], xInterval:5, yAxis:tSample});

    let data = new Array(n).fill(0).map((v,i)=>{
      phase = i*2*Math.PI / n;
      samples = Signal.sineWave({ frequency, nSamples, phase, scale, sampleRate, tStart });
      pa = yp.phaseAmplitude({samples, frequency, });
      let phaseError = Math.abs(phase - pa.phase);
      if (Math.PI<phaseError) { phaseError = Math.abs(phaseError - 2*Math.PI); }
      //should(phaseError).below(7.1e-2, [
      should(phaseError).below(9.1e-2, [
        `phaseError:${phaseError.toFixed(precision)}`,
        `i:${i}`,
        `phase expected:${phase.toFixed(precision)} actual:${pa.phase.toFixed(precision)}`,
      ].join(' '));
      let amplitudeError = Math.abs(scale - pa.amplitude);
      0 && should(amplitudeError).below(7.1e-2, [
        `amplitudeError:${amplitudeError}`,
        JSON.stringify(pa),
      ].join(' '));
      return { phase, phaseError, amplitudeError, pa }
    });
    let phaseErrors = data.map(v=>v.phaseError);
    let amplitudeErrors = data.map(v=>v.amplitudeError);
    title = `x:phase[0, 2*Math.PI] 1:phaseError 2:amplitudeError`;
    verbose && chart.plot({title, data:[phaseErrors, amplitudeErrors]});
    return;
  });
  it("TESTTESTharmonics() detects f0,f1,...", ()=>{
    let verbose = 0;
    let sampleRate = 22050;
    let samplePeriod = 1/sampleRate;
    let nSamples = MIN_SAMPLES;
    let f0 = 140;
    let scale0 = 16384;
    let phase = -Math.random()*Math.PI;
    let harmonicsIn = [
      { frequency: f0, phase: phase, scale: scale0 * 1, },
      { frequency: 2*f0, phase: phase + 0.2*Math.PI, scale: scale0 * 0.5, },
      { frequency: 3*f0, phase: phase + 0.1*Math.PI, scale: scale0 * 0.3, },
    ];
    harmonicsIn.forEach(harmonic=>{
      let {frequency, scale, phase} = harmonic;
      harmonic.samples = Signal.sineWave({
        frequency, nSamples, phase, scale, sampleRate
      });
      harmonic.samplesPerCycle = sampleRate/frequency;
    });
    let samples = harmonicsIn.reduce((a,harmonic)=>{
      let { samples } = harmonic;
      return a == null
        ? samples
        : samples.map((v,i) => v + a[i]);
    }, null);

    let tSample = 0; // TODO: mid-samples harmonics
    let yp = new YinPitch({tSample});
    let chart = new Chart();
    let data = [...harmonicsIn.map(h=>h.samples), samples];
    verbose && chart.plot({data, xInterval:2});

    let nHarmonics = harmonicsIn.length;
    let minAmplitude = scale0 * 0.003;
    let harmonicsOut = yp.harmonics(samples, {nHarmonics, minAmplitude});
    verbose && harmonicsOut.forEach(h=>console.log(`harmonicsOut`, JSON.stringify(h)));
    should(harmonicsOut.length).equal(3);
    harmonicsIn.forEach((hIn,i)=>{
      let { frequency, phase, scale } = hIn;
      let period = 1/frequency;
      let hOut = harmonicsOut[i];
      try {
        if (scale) {
          let dPhase = Math.abs(phase - hOut.phase);
          let dAmplitude = Math.abs(scale - hOut.amplitude);
          should(dPhase).below(2.6e-1); // eg., phase = -1.8254097836389889 
          should(dAmplitude/scale0).below(2);
        } else {
          should(hOut).equal(undefined);
        }
      } catch(e) {
        console.error(`ERROR`, hOut, e.message);
        throw e;
      }
    });
  });
  it('pitch() negative frequency', async()=>{
    let verbose = 0;
    let ferr = path.join(__dirname, 'data/yin-pitch-err1.json');
    let error = JSON.parse(await fs.promises.readFile(ferr));
    let { samples } = error;
    let yp = new YinPitch();
    let chart = new Chart({lines: 7});
    verbose && chart.plot({data:samples});
    let resPitch = yp.pitch(samples);
    verbose && console.log(resPitch);
    should(resPitch.pitch).not.below(0);
  });
  it('pitch() no samples', async()=>{
    let verbose = 0;
    let ferr = path.join(__dirname, 'data/yin-pitch-err2.json');
    let error = JSON.parse(await fs.promises.readFile(ferr));
    let { samples } = error;
    let yp = new YinPitch();
    let chart = new Chart({lines: 7});
    verbose && chart.plot({data:samples});
    let ypRes = yp.harmonics(samples);
    should.deepEqual(ypRes, []); // no signal
  });

})
