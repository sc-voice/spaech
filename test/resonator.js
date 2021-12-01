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
  this.timeout(10*1000);

  it("default ctor", ()=>{
    let resonator = new Resonator();
    let halfLifeSamples = Infinity;
    let r = 1;
    should(resonator).properties({
      sampleRate: 22050,
      frequency: 0,
      r,
      halfLifeSamples,
      y1: 0,
      y2: 0,
      scale: 1,
    });
  });
  it("custom ctor", ()=>{
    let sampleRate = 22000;
    let halfLifeSamples = 48;
    let y1 = 3;
    let y2 = 4;
    let scale = 5;
    let frequency = 100;
    let r = Math.pow(0.5, 1/halfLifeSamples);

    let resonator = new Resonator({frequency, sampleRate, halfLifeSamples, y1, y2, scale});
    should(resonator).properties({ frequency, sampleRate, y1, y2, scale, r });
    let precision = 13;
    should(resonator.halfLifeSamples.toFixed(precision)).equal(halfLifeSamples.toFixed(precision));

    let resonator2 = new Resonator({frequency, sampleRate, r, y1, y2, scale});
    halfLifeSamples = Math.log(0.5) / Math.log(r);
    should(resonator2).properties({ 
      frequency, sampleRate, halfLifeSamples, y1, y2, scale, r });
  });
  it("halfLife", ()=>{
    let precision = 12;
    should(Resonator.halfLifeDecay(Infinity)).equal(1);
    should(Resonator.halfLifeSamples(1)).equal(Infinity);
    should(Resonator.halfLifeDecay(8)).equal(0.9170040432046712);
    should(Number(Resonator.halfLifeSamples(0.9170040432046712).toFixed(precision))).equal(8);
    should(Resonator.halfLifeDecay(1)).equal(0.5);
    should(Number(Resonator.halfLifeSamples(0.5).toFixed(precision))).equal(1);
  });
  it("sample() steady state", ()=>{
    let verbose = 0;
    let scale = 1000 * Math.random();
    let initialScale = scale; // nominal scale
    let nSamples = 95;
    let halfLifeSamples = Infinity; // steady state
    let frequency = 30*Math.random() + 800;
    let phase = Math.random()*Math.PI;
    let nominal = Signal.cosineWave({frequency, phase, scale, nSamples});
    let r1 = new Resonator({frequency, phase, scale, initialScale, halfLifeSamples});
    let s1 = r1.sample({nSamples});
    let precision = 10;
    let chart = new Chart();
    let title = `1:nominal 2:samples`;
    verbose && chart.plot({title,data:[nominal,s1], xInterval:1});
    let nm1 = nSamples - 1;
    let nm2 = nSamples - 2;
    let yErr = Math.abs(nominal[nm1] - s1[nm1]);
    verbose && console.log({r1, yErr, halfLifeSamples, nominalN:nominal[nm1], s1N: s1[nm1]});
    try {
      should(yErr).equal(0);
      should(r1.y1).equal(s1[nm1]);
      should(r1.y2).equal(s1[nm2]);
    } catch(e) {
      console.warn(`ERROR`, {frequency, scale, phase});
      throw e;
    }
  });
  it("sample() steady state decay", ()=>{
    let verbose = 0;
    let initialScale = 100;  // steady state
    let scale = 0; // nominal scale
    let nSamples = 95;
    let generations = 5;
    let halfLifeSamples = nSamples/generations; // decay
    let attenuation = Math.pow(0.5, generations);
    let frequency = 30*Math.random() + 800;
    let phase = Math.random()*Math.PI;
    let nominal = Signal.cosineWave({frequency, phase, scale, nSamples});
    let r1 = new Resonator({frequency, phase, scale, initialScale, halfLifeSamples});
    let s1 = r1.sample({nSamples});
    let precision = 10;
    let chart = new Chart();
    let title = `1:nominal 2:samples`;
    verbose && chart.plot({title,data:[nominal,s1], xInterval:1});
    let nm1 = nSamples - 1;
    let nm2 = nSamples - 2;
    let yErr = Math.abs(nominal[nm1] - s1[nm1]);
    verbose && console.log({r1, yErr, halfLifeSamples, nominalN:nominal[nm1], s1N: s1[nm1]});
    try {
      should(yErr).below(attenuation*initialScale);
      should(r1.y1).equal(s1[nm1]);
      should(r1.y2).equal(s1[nm2]);
    } catch(e) {
      console.warn(`ERROR`, {frequency, scale, phase});
      throw e;
    }
  });
  it("TESTTESTsample() steady state attack", ()=>{
    let verbose = 0;
    let initialScale = 0;  // steady state
    let scale = 100; // nominal scale
    let nSamples = 95;
    let generations = 10;
    let halfLifeSamples = nSamples/generations; // decay
    let attenuation = Math.pow(0.5, generations);
    let frequency = 30*Math.random() + 800;
    verbose && (frequency = 825.6088414045286);
    let phase = Math.random()*Math.PI;
    //verbose && (phase = 0.04466396655415148);
    let nominal = Signal.cosineWave({frequency, phase, scale, nSamples});
    let r1 = new Resonator({frequency, phase, scale, initialScale, halfLifeSamples});
    let s1 = r1.sample({nSamples});
    let precision = 10;
    let chart = new Chart();
    let title = `1:nominal 2:samples`;
    verbose && chart.plot({title,data:[nominal,s1], xInterval:1});
    let nm1 = nSamples - 1;
    let nm2 = nSamples - 2;
    let yErr = Math.abs(nominal[nm1] - s1[nm1]);
    verbose && console.log({r1, yErr, halfLifeSamples, nominalN:nominal[nm1], s1N: s1[nm1]});
    try {
      should(yErr).below(1.5*attenuation*scale);
      should(r1.y1).equal(s1[nm1]);
      should(r1.y2).equal(s1[nm2]);
    } catch(e) {
      console.warn(`ERROR`, {frequency, scale, phase, attenuation});
      throw e;
    }
  });
  it("sample() steady state frequency change", ()=>{
    let verbose = 0;
    let scale = 100; 
    let initialScale = scale; // steady state
    let nSamples = 95;
    let generations = 10;
    let halfLifeSamples = nSamples/generations; // decay
    let attenuation = Math.pow(0.5, generations);
    let frequency1 = 800;
    verbose && (frequency1 = 800);
    let dFreq = 0.4 * frequency1;
    let frequency2 = frequency1 + (Math.random() < 0.5 ? -dFreq : dFreq);
    let phase = Math.random()*Math.PI;
    let nominal = Signal.cosineWave({frequency:frequency2, phase, scale, nSamples});
    let precision = 10;

    let r1 = new Resonator({frequency:frequency1, phase, scale, initialScale, halfLifeSamples});
    let s1 = r1.sample({frequency:frequency2, nSamples, phase}); // frequency change
    let chart = new Chart();
    let title = `1:nominal 2:samples`;
    verbose && chart.plot({title,data:[nominal,s1], xInterval:1});
    let nm1 = nSamples - 1;
    let nm2 = nSamples - 2;
    let yErr = Math.abs(nominal[nm1] - s1[nm1]);
    verbose && console.log({
      r1, yErr, attenuation, halfLifeSamples, nominalN:nominal[nm1], s1N: s1[nm1]});
    try {
      should(yErr).below(attenuation*scale);
      should(r1.y1).equal(s1[nm1]);
      should(r1.y2).equal(s1[nm2]);
    } catch(e) {
      console.warn(`ERROR`, {frequency1, frequency2, scale, phase});
      throw e;
    }
  });
  it("sample() steady state phase change", ()=>{
    let verbose = 0;
    let scale = 100; 
    let initialScale = scale; // steady state
    let nSamples = 95;
    let generations = 10;
    let halfLifeSamples = nSamples/generations; // decay
    let attenuation = Math.pow(0.5, generations);
    let frequency = 800;
    let phase1 = Math.random()*Math.PI;
    verbose && (phase1 = 1.4440342097717895);
    let phase2 = phase1 + Math.random()*Math.PI;
    verbose && (phase2 = 3.928251675517886);
    let nominal = Signal.cosineWave({frequency, phase:phase2, scale, nSamples});
    let precision = 10;

    let r1 = new Resonator({frequency, phase:phase1, scale, initialScale, halfLifeSamples});
    let s1 = r1.sample({frequency, nSamples, phase:phase2}); // phase change
    let chart = new Chart();
    let title = `1:nominal 2:samples`;
    verbose && chart.plot({title,data:[nominal,s1], xInterval:1});
    let nm1 = nSamples - 1;
    let nm2 = nSamples - 2;
    let yErr = Math.abs(nominal[nm1] - s1[nm1]);
    verbose && console.log({
      r1, yErr, attenuation, halfLifeSamples, nominalN:nominal[nm1], s1N: s1[nm1]});
    try {
      should(yErr).below(attenuation*scale*2);
      should(r1.y1).equal(s1[nm1]);
      should(r1.y2).equal(s1[nm2]);
    } catch(e) {
      console.warn(`ERROR`, {frequency, scale, phase1, phase2});
      throw e;
    }
  });
  it("TESTTESTsample() steady state phase change", ()=>{
    return; // TODO
    let verbose = 1;
    let scale = 100; 
    let nSamples = 95;
    let generations = 10;
    let halfLifeSamples = nSamples/generations; // decay
    let attenuation = Math.pow(0.5, generations);
    let frequency = 30*Math.random() + 800;
    verbose && (frequency = 800);
    let phase1 = Math.random()*Math.PI;
    verbose && (phase1 = 0.19238118132340623);
    let phase2 = phase1 + Math.PI;
    let r1 = new Resonator({frequency, phase:phase1, scale, initialScale:scale, halfLifeSamples});
    let nominal = Signal.cosineWave({frequency, phase2, scale, nSamples});
    let s1 = r1.sample({nSamples, phase:phase2});
    let precision = 10;
    let chart = new Chart();
    let title = `1:nominal 2:samples`;
    verbose && chart.plot({title,data:[nominal,s1], xInterval:1});
    let nm1 = nSamples - 1;
    let nm2 = nSamples - 2;
    let yErr = Math.abs(nominal[nm1] - s1[nm1]);
    verbose && console.log({r1, yErr, halfLifeSamples, nominalN:nominal[nm1], s1N: s1[nm1]});
    try {
      should(yErr).below(attenuation*scale);
      should(r1.y1).equal(s1[nm1]);
      should(r1.y2).equal(s1[nm2]);
    } catch(e) {
      console.warn(`ERROR`, {frequency, scale, phase1, phase2});
      throw e;
    }
  });
  it("sample()", ()=>{
    let verbose = 1;
    let nSamples = 95;
    let halfLives = 8; 
    let attenuation = Math.pow(2, -halfLives); // 1/256
    let halfLifeSamples = nSamples/halfLives;
    let decay = Resonator.halfLifeDecay(halfLifeSamples);
    should(decay).equal(0.943300589031673);
    let frequency = 30*Math.random() + 150;
    verbose && (frequency = 899);
    let phase = Math.random()*Math.PI;
    let scale = 1000 * Math.random();
    verbose && (scale = 100);
    let cos = Signal.cosineWave({frequency, phase, scale, nSamples});
    let r1 = new Resonator({frequency, phase, scale, halfLifeSamples});

    let s1 = r1.sample({nSamples});
    let precision = 10;
    let chart = new Chart();
    let title = `1:steady-state 2:samples`;
    verbose && chart.plot({title,data:[cos,s1], xInterval:1});
    let nm1 = nSamples-1;
    let yErr = Math.abs((cos[nm1] - s1[nm1])/cos[nm1]);
    console.log({r1, yErr, attenuation, halfLifeSamples, cosN:cos[nm1], s1N: s1[nm1]});
    should(yErr).below(scale*attenuation);
    should(r1.y1).equal(s1[nm1]);

    //should(r1.y1.toFixed(precision)).equal(r2.y1.toFixed(precision));
    //should(r1.y2.toFixed(precision)).equal(r2.y2.toFixed(precision));
  });
  it("linear recurrence", ()=>{
    let verbose = 0;
    let fs = 22050;
    fs = 1*94;
    let N = 94;
    N = fs;
    let xInterval = Math.floor(fs/94);
    let fVoice = 800;
    fVoice = fs/2;
    let beta = 2*Math.PI*fVoice/fs;
    let phase = 2*Math.PI * Math.random();
    phase = 0; // TODO
    let amplitude = 100;
    let chart = new Chart({lines:29});
    let halfLife = N/4;
    let gamma = Math.pow(0.5, 1/halfLife);
    verbose && console.log({gamma})
    let a1 = -2 * gamma * Math.cos(beta);
    let a0 = gamma * gamma;
    let y0 = amplitude * Math.cos(phase);
    let y1 = amplitude * gamma * Math.cos(beta + phase);
    let yk0 = y0;
    let yk1 = y1;
    let samples = new Array(N).fill(0).map((v,i) => {
      if (i === 0) { return y0 };
      if (i === 1) { return y1 };
      let yk2 =  - a1 * yk1 - a0 * yk0;
      yk0 = yk1;
      yk1 = yk2;
      return yk2;
    });
    verbose && console.log({a1,a0,y1,y0, decay:Math.pow(gamma, N), halfLife});
    verbose && chart.plot({data:samples, xInterval});
  });
  it("cos identity", ()=>{
    let pi2 = Math.PI * 2;
    for (let i = 0; i < 100; i++) {
      let x = pi2*Math.random();
      let y = pi2*Math.random();
      let v1 = Math.cos(y)*Math.cos(x -y);
      let v2 = 0.5*(Math.cos(x)+Math.cos(x - 2*y));
      let v12 = v1 - v2;
      try {
        should(Math.abs(v12)).below(8e-16);
      } catch(e) {
        console.log({x,y,v1,v2,v12 });
        throw e;
      }
    }
  });

})
