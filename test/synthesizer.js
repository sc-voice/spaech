(typeof describe === 'function') && describe("synthesizer", function() {
  const should = require("should");
  const assert = require("assert");
  let {
    Chart,
    Resonator,
    Synthesizer,
    Signal,
    YinPitch,
  } = require('../index');


  it("sampleSineWaves() sums sine waves", ()=>{
    let verbose = 0;
    let f0 = 220.5;
    let sineWaves = [{
      frequency: f0,
      phase: Math.PI/2,
      scale: 3,
    },{
      frequency: f0*3,
      phase: -Math.PI/2,
      scale: 1,
    }];
    let tStart = -25;
    let nSamples = 95;
    let samples = Synthesizer.sampleSineWaves({sineWaves, nSamples, tStart});
    let sines = sineWaves.map(sw=>{
      let {frequency, phase, scale} = sw;
      return Signal.sineWave({frequency, phase, scale, nSamples, tStart});
    });;
    let expected = sines[0].map((v,i)=>v + sines[1][i]);
    let title = `1:samples 2:expected 3:sines[0] 4:sines[1] (nSamples:${nSamples})`;
    let chart = new Chart({title});
    verbose && chart.plot({data:[samples, expected, ...sines]});
    should.deepEqual(samples, expected);
    should(samples[0]).below(1e-15);
  });
  it("default ctor()", ()=>{
    let synth = new Synthesizer();
    let halfLifeSamples = Infinity;
    let length = 10;
    let sampleRate = 22050;
    let scale = 16384;
    let frameSize = 192;
    let frequency = 200;
    let phase = 0;
    let r = 1;
    should(synth.r).equal(r);
    should(synth.halfLifeSamples).equal(halfLifeSamples);
    should(synth).properties({ 
      halfLifeSamples, length, sampleRate, scale, frameSize, r, frequency, phase});

    let { resonators } = synth;
    should(resonators.length).equal(length);
    for (let i = 0; i < length; i++) {
      let ri = resonators[i];
      should(ri instanceof Resonator);
      should(ri).properties({ sampleRate, scale, r});
    }
  });
  it("custom ctor()", ()=>{
    let length = 20;
    let sampleRate = 44100;
    let halfLifeSamples = Resonator.halfLifeSamples(0.91);
    let scale = 10000;
    let frameSize = 96;
    let frequency = 100;
    let phase = 1;
    let synth = new Synthesizer({
      halfLifeSamples, length, sampleRate, scale, frameSize, frequency, phase, 
    });
    should(synth).properties({ 
      halfLifeSamples, length, sampleRate, scale, frameSize, frequency, phase, 
    });

    let { resonators } = synth;
    should(resonators.length).equal(length);
    for (let i = 0; i < length; i++) {
      let ri = resonators[i];
      should(ri instanceof Resonator);
      should(ri).properties({ sampleRate, scale});
      should(Math.abs(halfLifeSamples-ri.halfLifeSamples)).below(4e-15);
    }
  });
  it("TESTTESTsample()" , ()=>{
    console.log(`TODO ${__filename}`); return;
    let verbose = 1;
    let length = 3;
    let frameSize = 90;
    let synth = new Synthesizer({length, frameSize});
    should(synth).properties({
      length, frameSize,
    });
    let f0 = 800;
    let amplitude = 10000;
    let harmonics = [
      { order: 0, frequency: f0, amplitude: amplitude, phase: 0.1*Math.PI, },
      { order: 1, frequency: 2*f0, amplitude: 0.8*amplitude, phase: -0.2*Math.PI, },
      { order: 2, frequency: 3*f0, amplitude: 0.4*amplitude, phase: 0.3*Math.PI, },
    ];
    let samplesRaw = [
      synth.sample(harmonics),
      synth.sample(harmonics),
      synth.sample([]),  // no input energy
    ];
    let samples = samplesRaw.flat();
    let chart = new Chart();
    let title = `1:sample()`;
    verbose && chart.plot({title, dataset:[samples], lineLength: frameSize});
    let stats0 = Signal.stats(samplesRaw[0]);
    let stats1 = Signal.stats(samplesRaw[1]);
    let stats2a = Signal.stats(samplesRaw[2].slice(0, frameSize/2));
    let stats2b = Signal.stats(samplesRaw[2].slice(frameSize/2));
    should(stats0).properties({ count: frameSize, });
    should(stats1).properties({ count: frameSize, });

    // signal builds initially
    should(stats0.stdDev).above(1).below(stats1.stdDev);

    // signal decays without input
    should(stats2a.stdDev).above(1).below(stats1.stdDev);
    should(stats2b.stdDev).above(1).below(stats2a.stdDev);
  });
  it("sample() generates f0,f1,...", ()=>{
    let verbose = 0;
    let sampleRate = 22050;
    let samplePeriod = 1/sampleRate;
    let width = 95;
    let xInterval = 3;
    let nSamples = xInterval*width;
    let f0 = 140;
    let scale0 = 10000;
    let phase = -Math.random()*Math.PI;
    verbose && (phase = 0.08593535665576535);
    let phase2 = phase+0.2*Math.PI;
    let phase3 = phase+0.1*Math.PI;
    let tSample = nSamples/2;
    0 && (tSample = 0); // TODO: remove

    let harmonicsIn = [
      { frequency: f0, phase: phase, scale: scale0 * 1, order: 0},
      { frequency: 2*f0, phase: phase2, scale: scale0 * 0.5, order: 1},
      { frequency: 3*f0, phase: phase3, scale: scale0 * 0.3, order: 2},
    ];
    let samples = Synthesizer.sampleSineWaves({
      sineWaves:harmonicsIn, nSamples, sampleRate, tStart:-tSample});
    let synth = new Synthesizer();
    let samplesSynth = synth.sample(harmonicsIn);

    let title = `1:samples 2:samplesSynth (nSamples:${nSamples})`;
    let chart = new Chart({lines:9, width, title, xInterval});
    verbose && chart.plot({data:[samples, samplesSynth]});

  });

})
