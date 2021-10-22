(typeof describe === 'function') && describe("resonator", function() {
  const should = require("should");
  let {
    Chart,
    Resonator,
    Signal,
    YinPitch,
  } = require('../index');
  const SINE200 = [
    0,
    0.05980415394503417,
    0.11939422454024434,
    0.17855689479863665,
    0.2370803777154975,
    0.2947551744109042,
  ];

  it("default ctor", ()=>{
    let resonator = new Resonator();
    should(resonator).properties({
      sampleRate: 22050,
      frequency: 200,
      r: 0.995,
      t: 0,
      x1: 0,
      x2: 0,
      y1: 0,
      y2: 0,
      scale: 1,
    });
  });
  it("filter()", ()=>{
    let frequency = 210;
    let tStart = 0;
    let phase = 0;
    let nSamples = 5;
    let scale = 1;
    let y0 = Signal.sineWave({frequency, scale, phase, nSamples, tStart} );
    should.deepEqual(y0, SINE200.slice(0,5));
    let y1 = Signal.sineWave({frequency, scale, phase, nSamples, tStart:1} );
    should.deepEqual(y1, SINE200.slice(1,6));
  });
  it("filter()", async()=>{
    let r = 0.995;
    let frequency = 210;
    let hr = new Resonator({r,frequency});
    let nSamples = 1000;
    let scale = 1;
    let x = Signal.sineWave({frequency, scale, phase:0.25*2*Math.PI, nSamples, });
    let y = [...hr.filter(x)];
    let chart = new Chart();
    let title = `resonator 1:input 2:output`;
    chart.plot({title, data:[x,y], xInterval:4});

    let yp = new YinPitch();
    let { pitch } = yp.pitch(x);
    console.log({pitch});
  });
  it("resonate() decays without input", ()=>{
    let verbose = 0;
    let r1 = new Resonator();
    let nSamples = 400;

    // resonate can be single-stepped with some degree of precision
    let s1 = r1.resonate({nSamples});
    let s2 = r1.resonate({nSamples, scale:0});
    let chart = new Chart();
    verbose && chart.plot({data:[s1,s2], xInterval:5});
    let stats1b = Signal.stats(s1.slice(nSamples/2));
    let stats2a = Signal.stats(s2.slice(0,nSamples/2));
    let stats2b = Signal.stats(s2.slice(nSamples/2));
    verbose && console.log({stats1b,stats2a,stats2b});

    // resonate with no signal energy results in a decaying signal
    should(stats2a.stdDev).above(stats1b.stdDev*0.7);   
    should(stats2b.stdDev).below(stats2a.stdDev/2);
  });
  it("resonate() one or many", ()=>{
    let verbose = 0;
    let r1 = new Resonator();
    let r2 = new Resonator();
    let nSamples = 400;

    // resonate can be single-stepped with some degree of precision
    let s1 = r1.resonate({nSamples});
    let s2 = [...new Int8Array(nSamples)].map(()=>r2.resonate()[0]);
    let precision = 10;
    should(r1.y1.toFixed(precision), r2.y1.toFixed(precision));
    should(r1.y2.toFixed(precision), r2.y2.toFixed(precision));
    should(r1.x1.toFixed(precision), r2.x1.toFixed(precision));
    should(r1.x2.toFixed(precision), r2.x2.toFixed(precision));
    should.deepEqual(s1.map(v=>v.toFixed(precision)), s2.map(v=>v.toFixed(precision)));
    let chart = new Chart();
    verbose && chart.plot({data:[s1], xInterval:5});
    let stats = Signal.stats(s1);
    should(stats.iMax).equal(358);
    should(stats.max.toFixed(precision)).equal((0.8320586576302439).toFixed(precision));
  });
  it("resonate() changes frequency", ()=>{
    let verbose = 0;
    let r1 = new Resonator({r:0.99});
    let nSamples = 400;
    let xInterval = 4;
    let f1 = 220;
    let f2 = Number((1.2*f1).toFixed(1));
    let s1 = r1.resonate({nSamples, frequency:f1, scale:1});
    should(r1).properties({ frequency:f1, t:1*nSamples});
    let chart = new Chart();
    verbose && chart.plot({title: `resonate $ f1}...${f2} Hz`, data:[s1], xInterval});

    let s2 = r1.resonate({nSamples, frequency:f2});
    verbose && chart.plot({title: `resonate ${f2} Hz`, data:[s2], xInterval});
    should(r1).properties({ frequency:f2, scale:1, t:2*nSamples});

    let s3 = r1.resonate({nSamples, scale:0});
    verbose && chart.plot({title:`resonate scale:0`, data:[s3], xInterval});
    let stats = Signal.stats(s1);
    //should(stats).properties({iMax:358, max:0.8320586576302439});
    should(r1).properties({ frequency:f2, scale:0, t:3*nSamples});
  });
  it("resonate() tweens", ()=>{
    let verbose = 0;
    let scale = 1;
    // For pitch detection, the f2 and f1 must be close
    let f1 = 220;
    let f2 = Number((1.3*f1).toFixed(1));
    let scale1 = 1;
    let scale2 = 2;
    let r = 0.999;
    let r1 = new Resonator({r, frequency:f1});
    let r2 = new Resonator({r, frequency:f1});
    let r3 = new Resonator({r, frequency:f1, tween:true});
    let nSamples = 2000;
    let s1 = r1.resonate({nSamples, frequency:f2, tween:false, scale:scale1});
    let s2 = r2.resonate({nSamples, frequency:f2, tween:true, scale:scale2});
    let s3 = r3.resonate({nSamples, frequency:f2, scale:scale2}); // tween from instance
    let yp = new YinPitch();
    let xInterval = 5;
    let chart = new Chart();
    let title = `resonate(${f1}...${f2}Hz) 1:no-tween 2:tween`;
    verbose && chart.plot({title, data:[s1,s2], xInterval});
    should(r1).properties({ frequency:f2, scale:scale1, t:1*nSamples});
    should(r2).properties({ frequency:f2, scale:scale2, t:1*nSamples});
    should.deepEqual(s3, s2); // both are tweened

    // Tweening changes the resonator throughout the interval,
    // so the perceived pitch will be intermediate
    let {pitch:pitch1} = yp.pitch(s1);
    let {pitch:pitch2} = yp.pitch(s2);
    verbose && console.log({pitch1, pitch2});
    should(Math.round(pitch2)).above(f1).below(pitch1);
    should(Math.round(pitch1)).equal(f2);
  });

})
