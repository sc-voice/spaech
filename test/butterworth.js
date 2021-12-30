(typeof describe === 'function') && describe("butterworth", function() {
  const should = require("should");
  let {
    Butterworth,
    Chart,
    Signal,
  } = require('../index');
  this.timeout(10*1000);

  const PINK_OCTAVE_DB = -10 * Math.log10(2); // -3.010299956639812 dB

  it("TESTTESTdefault ctor", ()=>{
    let bf = new Butterworth();
  });
  it("TESTTESTorderOfPassStop()", ()=>{
    { // -6dB gain per octave
      let dBPass = PINK_OCTAVE_DB;
      let omegaPass = 100+100*Math.random(); // angular frequency
      let dBStop = dBPass + 2*PINK_OCTAVE_DB; 
      let omegaStop = 2 * omegaPass; // angular frequency
      let n = Butterworth.orderOfPassStop({dBPass, omegaPass, dBStop, omegaStop});
      should(n).equal(0.9999999999999998); // Simplest Butterworth filter is -6dB
    }

    { // -3dB gain per octave can't be done by a single Butterworth filter
      let dBPass = PINK_OCTAVE_DB;
      let omegaPass = 100+100*Math.random();
      let dBStop = dBPass + PINK_OCTAVE_DB;
      let omegaStop = 2 * omegaPass;
      let n = Butterworth.orderOfPassStop({dBPass, omegaPass, dBStop, omegaStop});
      should(n).equal(0.5); // Filter order must be integer
    }
  });


})
