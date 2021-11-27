(typeof describe === 'function') && describe("resonator-bank", function() {
  const should = require("should");
  const assert = require("assert");
  let {
    Chart,
    Resonator,
    ResonatorBank,
    Signal,
    YinPitch,
  } = require('../index');

  it("TESTTESTdefault ctor()", ()=>{
    let rb = new ResonatorBank();
    let halfLifeSamples = 8;
    let length = 10;
    let sampleRate = 22050;
    let scale = 16384;
    let frameSize = 192;
    let frequency = 200;
    let phase = 0;
    let r = 0.98;
    should(rb).properties({ 
      halfLifeSamples, length, sampleRate, scale, frameSize, r, frequency, phase});

    let { resonators } = rb;
    should(resonators.length).equal(length);
    for (let i = 0; i < length; i++) {
      let ri = resonators[i];
      should(ri instanceof Resonator);
      should(ri).properties({ sampleRate, scale, });
      should(Math.abs(halfLifeSamples-ri.halfLifeSamples)).below(1e-15);
    }
  });
  it("TESTTESTcustom ctor()", ()=>{
    let length = 20;
    let sampleRate = 44100;
    let halfLifeSamples = 9;
    let scale = 10000;
    let frameSize = 96;
    let frequency = 100;
    let phase = 1;
    let tween = true;
    let rb = new ResonatorBank({
      halfLifeSamples, length, sampleRate, scale, frameSize, frequency, phase, tween,
    });
    should(rb).properties({ 
      halfLifeSamples, length, sampleRate, scale, frameSize, frequency, phase, tween,
    });

    let { resonators } = rb;
    should(resonators.length).equal(length);
    for (let i = 0; i < length; i++) {
      let ri = resonators[i];
      should(ri instanceof Resonator);
      should(ri).properties({ sampleRate, scale, tween});
      should(Math.abs(halfLifeSamples-ri.halfLifeSamples)).below(4e-15);
    }
  });
  it("TESTTESTsample()" , ()=>{
    let verbose = 1;
    let length = 3;
    let frameSize = 90;
    let rb = new ResonatorBank({length, frameSize});
    should(rb).properties({
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
      rb.sample(harmonics),
      rb.sample(harmonics),
      rb.sample([]),  // no input energy
    ];
    let resonateRaw = [
      rb.resonate(harmonics),
      rb.resonate(harmonics),
      rb.resonate([]),  // no input energy
    ];
    let samples = samplesRaw.flat();
    let resonate = resonateRaw.flat();
    let chart = new Chart();
    let title = `1:sample() 2:resonate()`;
    verbose && chart.plot({title, dataset:[samples, resonate], lineLength: frameSize});
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
  it("resonate()" , ()=>{
    let verbose = 0;
    let length = 3;
    let frameSize = 90;
    let rb = new ResonatorBank({length, frameSize});
    should(rb).properties({
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
      rb.resonate(harmonics),
      rb.resonate(harmonics),
      rb.resonate([]),  // no input energy
    ];
    let samples = samplesRaw.flat();
    let chart = new Chart();
    verbose && chart.plot({dataset:samples, lineLength: frameSize});
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
  it("oscillate()" , ()=>{
    let verbose = 0;
    let length = 3;
    let frameSize = 90;
    let rb = new ResonatorBank({length, frameSize});
    should(rb).properties({
      length, frameSize,
    });
    let f0 = 800;
    let amplitude = 10000;
    let harmonics = [
      { order: 1, frequency: 2*f0, amplitude: amplitude, phase: -0.2*Math.PI, },
      { order: 0, frequency: f0, amplitude: 0.8*amplitude, phase: 0.1*Math.PI, },
      { order: 2, frequency: 3*f0, amplitude: 0.4*amplitude, phase: 0.3*Math.PI, },
    ];
    let samplesRaw = [
      rb.oscillate(harmonics),
      rb.oscillate(harmonics),
      rb.oscillate([]),  // no input energy
    ];
    let samples = samplesRaw.flat();
    let samplesExpected = harmonics.reduce((a,h)=>{
      let { frequency, amplitude, phase } = h;
      let nSamples = 2*frameSize;
      let sine = Signal.sineWave({frequency, scale:amplitude, phase, nSamples});
      for (let i=0; i < nSamples; i++) {
        a[i] += sine[i];
      }
      return a;
    }, new Array(samplesRaw.length*frameSize).fill(0));
    should.deepEqual(samples, samplesExpected);

    let chart = new Chart({title:`oscillate samples 1:actual 2:expected`});
    verbose && chart.plot({dataset:[samples, samplesExpected], lineLength:frameSize});
  });

})
