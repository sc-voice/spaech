(typeof describe === 'function') && describe("analyzer", function() {
  const should = require("should");
  const fs = require('fs');
  const path = require('path');
  let {
    Analyzer,
    Chart,
    Signal,
    Synthesizer,
    YinPitch,
  } = require('../index');

  const FREQ_CHILD = 300;
  const FREQ_WOMAN = 255;     // adult woman speech 165-255Hz
  const FREQ_MAN = 85;        // adult male speech 85-155Hz
  const FREQ_ADULT = (FREQ_MAN+FREQ_WOMAN)/2;
  const FMAX = 1.1*FREQ_CHILD;
  const FMIN = 0.9*FREQ_MAN;
  const SAMPLE_RATE = 22050;  // 2 * 3**2 * 5**2 * 7**2
  const TAU_MAX = Math.round(SAMPLE_RATE/FMIN)+1;       // 260
  const WINDOW_25MS = Math.round(SAMPLE_RATE * 0.025);  // 551
  const MIN_SAMPLES = TAU_MAX+WINDOW_25MS+50;           // 841 
  const POLLY_AMPLITUDE = 16384;  // AWS Polly MP3 maximum speech amplitude

  this.timeout(10*1000);

  const generateHarmonics = (harmonicsIn, nSamples, sampleRate, tSample) => {
    harmonicsIn.forEach(harmonic=>{
      let {frequency, scale, phase} = harmonic;
      Object.defineProperty(harmonic, 'samples', { // non-enumerable
        value: Signal.sineWave({frequency, nSamples, phase, scale, sampleRate, tStart:-tSample,
      })});
      harmonic.samplesPerCycle = sampleRate/frequency;
    });
    let samples = harmonicsIn.reduce((a,harmonic)=>{
      let { samples } = harmonic;
      return a == null
        ? samples
        : samples.map((v,i) => v + a[i]);
    }, null);
    return samples;
  }

  it("TESTTESTdefault ctor()", ()=>{
    let verbose = 0;
    let sampleRate = 22050; // default
    let fMin = FMIN;
    let fMax = FMAX;
    let minAmplitude = POLLY_AMPLITUDE * .005;  // noise rejection
    let maxAmplitude = POLLY_AMPLITUDE;         // speaking voice
    let minSamples = WINDOW_25MS + TAU_MAX;
    let tSample = minSamples/2;
    let analyzer = new Analyzer();

    should(analyzer).properties({ 
      sampleRate, fMin, fMax, minSamples, tSample, minAmplitude, maxAmplitude,
    });
  });
  it("phaseAmplitude() sin 140Hz", ()=>{
    let verbose = 0;
    let scale = 10000;
    let sampleRate = 22050;
    let frequency = 110.49; // not a factor of sampleRate
    let nCycles = 2.3; // not a multiple of cycles
    let samplesPerCycle = sampleRate/frequency;
    let nSamples = Math.round(samplesPerCycle*nCycles);
    let tSample = Math.round(nSamples/2);
    let analyzer = new Analyzer({tSample});
    let tStart = -tSample;
    let precision = 4;
    let n = 90; // test n samples from [0, 2*Math.PI]
    let data = new Array(n).fill(0).map((v,i)=>{
      let phase = i*2*Math.PI / n;
      let samples = Signal.sineWave({ frequency, nSamples, phase, scale, sampleRate, tStart });
      let pa = analyzer.phaseAmplitude({samples, frequency, verbose: i===2 && verbose });
      let phaseError = Math.abs(phase - pa.phase);
      if (Math.PI<phaseError) { phaseError = Math.abs(phaseError - 2*Math.PI); }
      let amplitudeError = Math.abs(scale - pa.amplitude)/scale;
      if (verbose && i === 56) {
        let xInterval = 4;
        let chart = new Chart({xInterval,lines:9});
        let paCycles = pa.nCycles;
        title = `1:signal xInterval:${xInterval} i:${i} phase:${phase.toFixed(3)} paCycles:${paCycles}`;
        chart.plot({title, data:[samples], yAxis:tSample });
      }
      return { i, phase, phaseError, amplitudeError, pa }
    });
    let chart = new Chart({xInterval:1,lines:9});

    try {
      let phaseErrors = data.map(v=>v.phaseError);
      title = `x:phase[0, 2*Math.PI] 1:phaseError`;
      verbose && chart.plot({title, data:[phaseErrors]});
      var statsPhase = Signal.stats(phaseErrors);
      should(statsPhase.max).below(4e-4);

      let amplitudeErrors = data.map(v=>v.amplitudeError);
      title = `x:phase[0, 2*Math.PI] 1:amplitudeError`;
      verbose && chart.plot({title, data:[amplitudeErrors]});
      var statsAmplitude = Signal.stats(amplitudeErrors);
      should(statsAmplitude.max).below(4e-4);
    } catch(e) {
      console.warn(`ERROR`, {statsPhase, statsAmplitude});
      throw e;
    }
  });
  it("TESTTESTharmonics() detects f0,f1,...", ()=>{
    let verbose = 1;
    let sampleRate = 22050;
    let samplePeriod = 1/sampleRate;
    let width = 95;
    let xInterval = 9;
    let nSamples = xInterval*width;
    let f0 = 200;
    let scale0 = 10000;
    let nHarmonics = 3;
    let phases = new Array(nHarmonics).fill(0).map(v=>2*Math.PI*Math.random()-Math.PI);
    verbose && (phases = [-1.2329875150848355, 2.955960589184895, -0.9914889937065183]);
    let scales = new Array(nHarmonics).fill(0).map((v,i)=>scale0*(i===0?1:Math.random()));
    verbose && (scales = [ 10000, 188.03937174292963, 6544.039197271653 ]);
    let tSample = nSamples/2;

    let harmonicsIn = [
      { frequency: f0, phase: phases[0], scale: scales[0], },
      { frequency: 2*f0, phase: phases[1], scale: scales[1], },
      { frequency: 3*f0, phase: phases[2], scale: scales[2], },
    ];
    let samples = Synthesizer.sampleSineWaves({
      sineWaves:harmonicsIn, nSamples, sampleRate, tStart:-tSample});
    let title = `1:samples (nSamples:${nSamples})`;
    let chart = new Chart({lines:9, width, title, xInterval, yAxis:tSample});
    verbose && chart.plot({data:samples});

    let analyzer = new Analyzer({tSample});

    let minAmplitude = scale0 * 0.003;
    let harmonicsOut = analyzer.harmonics(samples, {nHarmonics, minAmplitude, verbose});
    should(harmonicsOut.length).equal(3);
    harmonicsIn.forEach((hIn,i)=>{
      let { frequency, phase, scale } = hIn;
      let hOut = harmonicsOut[i];
      try {
        if (scale) {
          let dFreq = Math.abs(frequency - hOut.frequency);
          let dPhase = Math.abs(phase - hOut.phase);
          let dAmplitude = Math.abs(scale - hOut.amplitude);
          verbose && console.log(`harmonicsOut[${i}]`, {dFreq, dPhase, dAmplitude, hOut});
          should(dFreq).equal(0); // source pitch digitization optimization (!)
          should(dPhase).below(7e-1); 
          should(dAmplitude/scale).below(2);
        } else {
          should(hOut).equal(undefined);
        }
      } catch(e) {
        console.error(`ERROR`, {phases, scales, phase, scale, hIn, hOut}, e.message);
        throw e;
      }
    });
  });
  it('harmonics() no samples', async()=>{
    let verbose = 0;
    let ferr = path.join(__dirname, 'data/yin-pitch-err2.json');
    let error = JSON.parse(await fs.promises.readFile(ferr));
    let { samples } = error;
    let analyzer = new Analyzer();
    let chart = new Chart({lines: 7});
    verbose && chart.plot({data:samples});
    let analyzerRes = analyzer.harmonics(samples);
    should.deepEqual(analyzerRes, []); // no signal
  });
  it("analyzeBlock() detects f0,f1,...", ()=>{
    console.warn(`TODO ${__filename}`); return;
    let verbose = 0;
    let sampleRate = 22050;
    let samplePeriod = 1/sampleRate;
    let nSamples = MIN_SAMPLES;
    let f0 = 140;
    let scale0 = 10000;
    let phase = -Math.random()*Math.PI;
    verbose && (phase = -0.7520936039773847);
    let phase2 = phase+0.2*Math.PI;
    let phase3 = phase+0.1*Math.PI;
    let tSample = nSamples/2;
    tSample = 0; // TODO: remove

    let harmonicsIn = [
      { frequency: f0, phase: phase, scale: scale0 * 1, },
      { frequency: 2*f0, phase: phase2, scale: scale0 * 0.5, },
      { frequency: 3*f0, phase: phase3, scale: scale0 * 0.3, },
    ];
    let samples = Synthesizer.sampleSineWaves({
      sineWaves:harmonicsIn, nSamples, sampleRate, tStart:-tSample});

    let analyzer = new Analyzer({tSample});
    let chart = new Chart({lines:7});
    verbose && chart.plot({title:`samples`, data:samples, xInterval:5, yAxis:tSample});
    verbose && chart.plot({title:`h1`, data:samples, xInterval:5, yAxis:tSample});

    let nHarmonics = harmonicsIn.length;
    let minAmplitude = scale0 * 0.003;
    let harmonicsOut = analyzer.harmonics(samples, {nHarmonics, minAmplitude, verbose});
    should(harmonicsOut.length).equal(3);
    harmonicsIn.forEach((hIn,i)=>{
      let { frequency, phase, scale } = hIn;
      let hOut = harmonicsOut[i];
      try {
        if (scale) {
          let dFreq = Math.abs(frequency - hOut.frequency);
          let dPhase = Math.abs(phase - hOut.phase);
          let dAmplitude = Math.abs(scale - hOut.amplitude);
          verbose && console.log(`harmonicsOut[${i}]`, {dFreq, dPhase, dAmplitude, hOut});

          // Since MDCT coefficients are digitized, there will be frequency
          // diigitization. The pitchPrecision parameter allows us to take
          // advantage of that
          should(dFreq).equal(0); 

          should(dPhase).below(2e-1); 
          should(dAmplitude/scale).below(1e-1);
        } else {
          should(hOut).equal(undefined);
        }
      } catch(e) {
        console.error(`ERROR`, {phase, hIn, hOut}, e.message);
        throw e;
      }
    });
  });

})
