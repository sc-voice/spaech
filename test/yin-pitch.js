(typeof describe === 'function') && describe("yin-pitch", function() {
  const should = require("should");
  const fs = require('fs');
  const path = require('path');
  const { WaveFile } = require('wavefile');
  let {
    Chart,
  } = require('../index');

  let {
    Signal,
    YinPitch,
  } = require('../index');

  const FREQ_CHILD = 300;
  const FREQ_WOMAN = 255;     // adult woman speech 165-255Hz
  const FREQ_MAN = 85;        // adult male speech 85-155Hz
  const FREQ_ADULT = (FREQ_MAN+FREQ_WOMAN)/2;
  const SAMPLE_RATE = 22050;  // 2 * 3**2 * 5**2 * 7**2
  const TAU_MIN = Math.round(SAMPLE_RATE/FREQ_CHILD)-1;     // 72
  const TAU_MIN_ADULT = Math.round(SAMPLE_RATE/FREQ_WOMAN); // 86
  const TAU_MAX = Math.round(SAMPLE_RATE/FREQ_MAN)+1;       // 260
  const WINDOW_25MS = Math.round(SAMPLE_RATE * 0.025);      // 551
  const MIN_SAMPLES = TAU_MAX+WINDOW_25MS+50;               // 316 

  this.timeout(10*1000);

  function sineWave(frequency,nSamples, phase=0, sampleRate=22050) {
    return YinPitch.sineWave({frequency, nSamples, phase, sampleRate});
  }

  function zeros(n) {
    return [...new Int8Array(n)];
  }

  it("TESTTESTdefault ctor()", ()=>{
    let verbose = 0;
    let window = WINDOW_25MS;
    let sampleRate = 22050; // default
    let fMin = FREQ_MAN;
    let fMax = FREQ_CHILD;
    let tauMin = TAU_MIN;
    let tauMax = TAU_MAX;
    let diffMax = 0.1; // acceptable ACF difference
    let yp = new YinPitch();

    should(yp).properties({ window, sampleRate, fMin, fMax, diffMax, tauMin, tauMax});
  });
  it("autoCorrelate()", ()=>{
    let verbose = 0;
    let n = 100;
    let samples = sineWave(700, n);
    let ypa = [
      new YinPitch({window: 8}),
      new YinPitch({window: 9}),
      new YinPitch({window: 10}),
      new YinPitch({window: 11}),
      new YinPitch({window: 12}),
    ];
    let t = 0; // pitch at time t
    let acva = ypa.map(yp=>zeros(n-yp.window)
      .map((v,tau)=>yp.autoCorrelate(samples, t,tau)));
    let stats = acva.map(acv=>Signal.stats(acv));
    verbose && (new Chart({data:acva})).plot();

    // peaks depend on window size
    should.deepEqual(stats.map(s=>s.iMax), [ 34, 2, 33, 64, 32 ]);
  });
  it("acfDifference()", ()=>{
    let verbose = 0;
    let n = 100;
    let Q = 40; // determines arbitrary frequency to be detected
    let f = SAMPLE_RATE / Q;
    let phase = Math.PI/3; // arbitrary phase
    let samples = sineWave(f, n, phase);
    let ypa = [
      new YinPitch({samples, window: 8}),
      new YinPitch({samples, window: 9}),
      new YinPitch({samples, window: 10}),
      new YinPitch({samples, window: 11}),
      new YinPitch({samples, window: 12}),
    ];
    let t = 0; // pitch at time t
    let da = ypa.map(yp=>zeros(n-yp.window)
      .map((v,tau)=>yp.acfDifference(samples, t,tau)));
    let daz = da.map(d=>
      d.reduce(((a,v,i) => a==null || (d[i] < d[a]) ? (i || undefined) : a),undefined)
    );

    // The computed Q will be an integer multiple of the original Q
    should.deepEqual(daz, [Q, 2*Q, 2*Q, 2*Q, Q]);
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
    let nSamples = MIN_SAMPLES;
    let sustain = 0.999;
    let samples = YinPitch.sineWave({ frequency, nSamples, phase, sustain });
    let yp = new YinPitch();
    let { pitch, pitchEst, tau, tauEst, acf, } = yp.pitch(samples);
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
    should(error).below(0.33); // error rate goes down as sustain approaches 1
  });
  it("pitch() sin FREQ_ADULT", ()=>{
    let verbose = 0;
    let frequency = FREQ_ADULT;
    let phase = Math.random()*2*Math.PI; 
    let nSamples = MIN_SAMPLES;
    let sustain = 0.999;
    let samples = YinPitch.sineWave({ frequency, nSamples, phase, sustain });
    let yp = new YinPitch();
    let { pitch, pitchEst, tau, tauEst, acf, } = yp.pitch(samples);
    let xInterval = 10;
    verbose && (new Chart({title:'samples',data:[samples],xInterval})).plot();
    verbose && (new Chart({title:'ACFdifference',data:[acf],xInterval})).plot();
    let error = Math.abs(pitch-frequency);
    verbose && console.log(`YIN`, {
      frequency, phase, pitch, pitchEst, error, tau, tauEst, nSamples, 
      window: yp.window,
      tauMin: yp.tauMin,
      tauMax: yp.tauMax,
    });
    should(error).below(0.21); // error rate decreases with frequency
  });
  it("pitch() sin FREQ_WOMAN", ()=>{
    let verbose = 0;
    let frequency = FREQ_WOMAN;
    let phase = Math.random()*2*Math.PI; 
    let nSamples = MIN_SAMPLES;
    let sustain = 0.999;
    let samples = YinPitch.sineWave({ frequency, nSamples, phase, sustain });
    let yp = new YinPitch();
    let { pitch, pitchEst, tau, tauEst, acf, } = yp.pitch(samples);
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
  it("TESTTESTpitch() sin FREQ_CHILD (scale, typedarray)", ()=>{
    let verbose = 0;
    let frequency = FREQ_CHILD;
    let phase = Math.random()*2*Math.PI; 
    let nSamples = MIN_SAMPLES;
    let sustain = 0.999;
    let type = Int16Array;
    let scale = 16384;
    let samples = YinPitch.sineWave({ frequency, nSamples, phase, sustain, scale, type });
    let yp = new YinPitch({});
    let { pitch, pitchEst, acf, tau, tauEst, } = yp.pitch(samples);
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

})
