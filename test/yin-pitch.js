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
  const POLLY_AMPLITUDE = 16384;  // AWS Polly MP3 maximum speech amplitude
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
    verbose && (phase = 4.417692299369458);
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
    try {
      should(pitch).above(0, `could not detect pitch for phase:${phase}`);
      should(error).below(0.41); // error rate goes down as sustain approaches 1
    } catch(e) {
      console.warn(`ERROR`, {phase, error});
      throw e;
    }
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
    should(pitch).equal(170);
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
    should(pitch).equal(170.2); // different than E1
  });
  it("pitch() changing frequencies", ()=>{
    let verbose = 0;
    let freqNominal = 200;
    let dFreq = freqNominal * Math.random();
    let freqInitial = freqNominal + (Math.random() < 0.5 ? -dFreq : dFreq);
    let phase1 = Math.PI*Math.random();
    let phase2 = Math.PI*Math.random();
    let yp = new YinPitch();
    let nSamples = 840;
    let halfLifeSamples = 8;
    let hr = new Resonator({frequency:freqInitial, initialScale:1, phase:phase1, halfLifeSamples});
    let samples = hr.sample({frequency:freqNominal, phase:phase2, nSamples});
    let { pitch, pitchEst, tau, tauEst, acf, } = yp.pitch(samples);
    let xInterval = 10;
    let lines = 5;
    let error = Math.abs(pitch-freqNominal);
    verbose && console.log(`YIN`, {
      freqNominal, freqInitial, phase1, phase2, pitch, pitchEst, error, tau, tauEst, nSamples, 
      window: yp.window,
      tauMin: yp.tauMin,
      tauMax: yp.tauMax,
    });
    verbose && (new Chart({title:'samples',data:[samples],xInterval,lines})).plot();
    try {
      should(pitch).above(0);
      should(pitch).equal(freqNominal);  // pitch is determined from mid-sample
    } catch(e) {
      console.warn(`ERROR`, {pitch, dFreq, freqInitial, freqNominal});
      throw e;
    }
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
    let verbose = 1;
    let frequency = FREQ_CHILD;
    let phase = Math.random()*2*Math.PI; 
    verbose && (phase = 2.3490385761277);
    let sustain = 0.999;
    let type = Int16Array;
    let scale = 16384;
    let pitchPrecision = 1;
    let yp = new YinPitch({pitchPrecision});
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
    try {
      should(error).below(0.11); // error rate decreases with frequency
    } catch(e){
      console.warn('ERROR', {phase, error});
      throw e;
    }
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
})
