(typeof describe === 'function') && describe("resonator", function() {
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
    let length = 10;
    let sampleRate = 22050;
    let scale = 16384;
    let frameSize = 192;
    let frequency = 200;
    let phase = 0;
    let r = 0.98;
    should(rb).properties({ length, sampleRate, scale, frameSize, r, frequency, phase});

    let { resonators } = rb;
    should(resonators.length).equal(length);
    for (let i = 0; i < length; i++) {
      should(resonators[i] instanceof Resonator);
      should(resonators[i]).properties({ sampleRate, r, scale, });
    }
  });
  it("TESTTESTresonate()" , ()=>{
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
      { frequency: f0, amplitude: amplitude, phase: 0.1*Math.PI, },
      { frequency: 2*f0, amplitude: 0.8*amplitude, phase: -0.2*Math.PI, },
      { frequency: 3*f0, amplitude: 0.4*amplitude, phase: 0.3*Math.PI, },
    ];
    let samples = [
      rb.resonate(harmonics),
      rb.resonate(harmonics),
      rb.resonate([]),  // no input energy
    ];
    let chart = new Chart();
    verbose && chart.plot({dataset:samples.flat(), lineLength: frameSize});
    let stats0 = Signal.stats(samples[0]);
    let stats1 = Signal.stats(samples[1]);
    let stats2a = Signal.stats(samples[2].slice(0, frameSize/2));
    let stats2b = Signal.stats(samples[2].slice(frameSize/2));
    should(stats0).properties({ count: frameSize, });
    should(stats1).properties({ count: frameSize, });

    // signal builds initially
    should(stats0.stdDev).above(1).below(stats1.stdDev);

    // signal decays without input
    should(stats2a.stdDev).above(1).below(stats1.stdDev);
    should(stats2b.stdDev).above(1).below(stats2a.stdDev);
  });

})
