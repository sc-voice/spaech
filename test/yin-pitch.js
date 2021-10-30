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

  it("TESTTESTdefault ctor()", ()=>{
    let verbose = 0;
    let window = WINDOW_25MS;
    let sampleRate = 22050; // default
    let fMin = FMIN;
    let fMax = FMAX;
    let tauMin = TAU_MIN;
    let tauMax = TAU_MAX;
    let minSamples = window + tauMax;
    let tSample = 0;
    let rFun = YinPitch.yinEA1;
    let diffMax = 0.1; // acceptable ACF difference
    let yp = new YinPitch();

    should(yp).properties({ 
      window, sampleRate, fMin, fMax, diffMax, tauMin, tauMax, minSamples, tSample,
    });
  });
  it("yinE1 ctor()", ()=>{
    let verbose = 0;
    let window = WINDOW_25MS;
    let sampleRate = 22050; // default
    let fMin = FMIN;
    let fMax = FMAX;
    let tauMin = TAU_MIN;
    let tauMax = TAU_MAX;
    let minSamples = window + tauMax;
    let rFun = YinPitch.yinE1;
    let diffMax = 0.1; // acceptable ACF difference
    let yp = new YinPitch({rFun});

    should(yp).properties({ window, sampleRate, fMin, fMax, diffMax, tauMin, tauMax, minSamples});
  });
  it("yinE1()", ()=>{
    let verbose = 0;
    let nSamples = 100;
    let frequency = 700;
    let rFun = YinPitch.yinE1;
    let samples = Signal.sineWave({frequency, nSamples});
    let ypa = [
      new YinPitch({window: 8, rFun}),
      new YinPitch({window: 9, rFun}),
      new YinPitch({window: 10, rFun}),
      new YinPitch({window: 11, rFun}),
      new YinPitch({window: 12, rFun}),
    ];
    let t = 0; // pitch at time t
    let acva = ypa.map(yp=>{
      let w = yp.window;
      return zeros(nSamples-w).map((v,tau)=>rFun(samples, t,tau, w))
    });
    let stats = acva.map(acv=>Signal.stats(acv));
    verbose && (new Chart({title:`yinE1 t:${t}`, data:acva})).plot();

    // peaks depend on window size
    should.deepEqual(stats.map(s=>s.iMax), [ 66, 34, 2, 33, 64, ]);
  });
  it("yinEA1()", ()=>{
    let verbose = 0;
    let nSamples = 100;
    let frequency = 700;
    let samples = Signal.sineWave({frequency, nSamples});
    let rFun = YinPitch.yinEA1;
    let ypa = [
      new YinPitch({window: 8, rFun}),
      new YinPitch({window: 9, rFun}),
      new YinPitch({window: 10, rFun}),
      new YinPitch({window: 11, rFun}),
      new YinPitch({window: 12, rFun}),
    ];
    let t = Math.floor((nSamples-1)/2); // pitch at time t
    let acva = ypa.map(yp=>{
      let w = yp.window;
      return zeros(nSamples-w).map((v,tau)=>rFun(samples, t,tau, w))
    });
    let stats = acva.map(acv=>Signal.stats(acv));
    verbose && (new Chart({title:`yinEA1 t:${t}`, data:acva})).plot();

    // peaks depend on window size
    should.deepEqual(stats.map(s=>s.iMax), [ 63, 0, 63, 0, 63 ]);
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
    let ypa = [
      new YinPitch({samples, window: 8}),
      new YinPitch({samples, window: 9}),
      new YinPitch({samples, window: 10}),
      new YinPitch({samples, window: 11}),
      new YinPitch({samples, window: 12}),
    ];
    let t = 0; // pitch at time t
    let da = ypa.map(yp=>zeros(nSamples-yp.window)
      .map((v,tau)=>yp.acfDifference(samples, t,tau)));
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
  it("TESTTESTpitch() yinE1 vs yinEA1", ()=>{
    return; // TODO
    let verbose = 1;
    let frequency = 200 + 10*Math.random();
    verbose && (frequency = 203.3714002714288); // throws
    let dFreq = 0;
    let frequency1 = frequency+dFreq;
    let frequency2 = frequency-dFreq;
    let phase = Math.random()*2*Math.PI; 
    let rFun = YinPitch.yinEA1;
    let hr = new Resonator({frequency:frequency1});
    let yp = new YinPitch({rFun});
    let nSamples = yp.minSamples;
    let samples = hr.oscillate({ frequency:frequency2, nSamples, tween:1});
    let { tauMin, tauMax, window } = yp;
    verbose && console.log({tauMin, tauMax, nSamples});
    try {
      let ypRes = yp.pitch(samples);
      verbose && console.log(`ypRes`, JSON.stringify(ypRes));
      let { pitch, pitchEst, tau, tauEst, acf, tSample, } = ypRes;
      let title=`LEGEND: 1:samples, 2:ACFdifference`;
      let xInterval = 4;
      verbose && (new Chart({title:'samples',data:[samples],xInterval,lines:5})).plot();
      //verbose && (new Chart({title:'ACFdifference',data:[acf],xInterval})).plot();
      let error = Math.abs(pitch-frequency);
      verbose && console.log(`YIN`, {
        frequency, phase, pitch, pitchEst, error, tau, tauEst, nSamples, 
        window: yp.window,
        tauMin: yp.tauMin,
        tauMax: yp.tauMax,
      });
      should(pitch).above(0, `could not detect pitch for phase:${phase}`);
      should(error).below(0.33); // error rate goes down as sustain approaches 1
      should(tSample).equal(Math.floor(nSamples/2));
    } catch(e) {
      console.warn(`[ERROR] ${e.message}`, { frequency, });
      throw e;
    }
  });
  it("pitch() sin FREQ_MAN", ()=>{
    let verbose = 0;
    let frequency = FREQ_MAN;
    let phase = Math.random()*2*Math.PI; 
    let rFun = YinPitch.yinE1;
    let yp = new YinPitch({rFun});
    let nSamples = yp.minSamples;
    let sustain = 0.999;
    let samples = Signal.sineWave({ frequency, nSamples, phase, sustain });
    let { pitch, pitchEst, tau, tauEst, acf, tSample, equation } = yp.pitch(samples);
    should(tSample).equal(0);
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
    should(error).below(0.33); // error rate goes down as sustain approaches 1
  });
  it("TESTTESTpitch() sin FREQ_ADULT", ()=>{
    let verbose = 1;
    let frequency = FREQ_ADULT;
    let phase = Math.random()*2*Math.PI; 
    verbose && (phase = 3.602657466317041);
    let sustain = 0.999;
    let rFun = YinPitch.yinE1;
    let yp = new YinPitch({rFun});
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
    verbose && should(pitch).equal(169.97871589219946);
  });
  it("pitch() sin FREQ_WOMAN", ()=>{
    let verbose = 0;
    let frequency = FREQ_WOMAN;
    let phase = Math.random()*2*Math.PI; 
    let sustain = 0.999;
    let rFun = YinPitch.yinE1;
    let yp = new YinPitch({rFun});
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
  it("pitch() sin FREQ_CHILD (scale, typedarray)", ()=>{
    let verbose = 0;
    let frequency = FREQ_CHILD;
    let phase = Math.random()*2*Math.PI; 
    let sustain = 0.999;
    let type = Int16Array;
    let scale = 16384;
    let rFun = YinPitch.yinE1;
    let yp = new YinPitch({rFun});
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
  it("frequencies", async()=>{
    // TODO: delete after 2021.10.11
    let verbose = 0;
    let frequency = 7*160;
    let phase = 2*Math.PI*0.25;
    let nSamples = MIN_SAMPLES;
    let sustain = 1;
    let scale = 16384;
    let samples = Signal.sineWave({ frequency, nSamples, phase, sustain, scale, type:Int16Array });

    let frameSize = 192;
    let nFrames = Math.floor((samples.length + frameSize-1)/frameSize);
    should(nFrames).equal(5);
    let FINAL_ENCODING_BLOCK = 1; // required if signal ends with less than frameSize/2 zeros
    let nCoeffBlocks = 2*nFrames + FINAL_ENCODING_BLOCK;
    let type = Float32Array;
    let mdct = new Mdct({frameSize});
    let encodedGen = mdct.encodeFrames(samples, {type:Float32Array});
    let encoded = [...encodedGen];
    console.log(`encoded`, {length:encoded.length, first:encoded[0].slice(0,50)});
    let chart = new Chart();
    chart.plot({data:[encoded[0]]});
    chart.plot({data:[samples.slice(-96)], xInterval:1});
  });
  it("phaseAmplitude() sin 140Hz", ()=>{
    let verbose = 0;
    let sampleRate = 22050;
    let samplePeriod = 1/sampleRate;
    let frequency = 140; // not a factor of sampleRate
    let period = 1/frequency;
    let phase = Math.random()*2*Math.PI - Math.PI; 
    let samplesPerCycle = sampleRate/frequency;
    phase = 0.9*Math.PI/2;
    let scale = 16384;
    let nSamples = samplesPerCycle*1;
    let samples = Signal.sineWave({ 
      frequency, nSamples, phase, scale, sampleRate,
    });
    let yp = new YinPitch();
    let pa = yp.phaseAmplitude({samples, frequency});
    let { real, imaginary } = pa.phasor;
    console.log(`DEBUG`, {
      pa, samplesPerCycle, nSamples, sampleRate, samplePeriod, 
      frequency, period, phase, scale, 
      pi2: Math.PI/2});
    let chart = new Chart();
    verbose && chart.plot({data:samples});

    // Accuracy is worst when frequency is not a factor of sampleRate
    should(Math.abs(phase - pa.phase)).below(2e-3);
    should(Math.abs(scale - pa.amplitude)/scale).below(3e-3);
  });
  it("harmonics() detects f0,f1,...", ()=>{
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

    let rFun = YinPitch.yinE1;
    let yp = new YinPitch({rFun});
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
    let rFun = YinPitch.yinE1;
    let yp = new YinPitch({rFun});
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
    let rFun = YinPitch.yinE1;
    let yp = new YinPitch({rFun});
    let chart = new Chart({lines: 7});
    verbose && chart.plot({data:samples});
    let ypRes = yp.harmonics(samples);
    should.deepEqual(ypRes, []); // no signal
  });

})
