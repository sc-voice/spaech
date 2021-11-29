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
    let halfLifeSamples = Infinity;
    let length = 10;
    let sampleRate = 22050;
    let scale = 16384;
    let frameSize = 192;
    let frequency = 200;
    let phase = 0;
    let r = 1;
    should(rb.r).equal(r);
    should(rb.halfLifeSamples).equal(halfLifeSamples);
    should(rb).properties({ 
      halfLifeSamples, length, sampleRate, scale, frameSize, r, frequency, phase});

    let { resonators } = rb;
    should(resonators.length).equal(length);
    for (let i = 0; i < length; i++) {
      let ri = resonators[i];
      should(ri instanceof Resonator);
      should(ri).properties({ sampleRate, scale, r});
    }
  });
  it("TESTTESTcustom ctor()", ()=>{
    let length = 20;
    let sampleRate = 44100;
    let halfLifeSamples = Resonator.halfLifeSamples(0.91);
    let scale = 10000;
    let frameSize = 96;
    let frequency = 100;
    let phase = 1;
    let rb = new ResonatorBank({
      halfLifeSamples, length, sampleRate, scale, frameSize, frequency, phase, 
    });
    should(rb).properties({ 
      halfLifeSamples, length, sampleRate, scale, frameSize, frequency, phase, 
    });

    let { resonators } = rb;
    should(resonators.length).equal(length);
    for (let i = 0; i < length; i++) {
      let ri = resonators[i];
      should(ri instanceof Resonator);
      should(ri).properties({ sampleRate, scale});
      should(Math.abs(halfLifeSamples-ri.halfLifeSamples)).below(4e-15);
    }
  });
  it("sample()" , ()=>{
    return; // TODO: TESTTEST
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

})
