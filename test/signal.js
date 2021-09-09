
(typeof describe === 'function') && describe("signal", function() {
  const should = require("should");
  const fs = require('fs');
  const path = require('path');
  const { WaveFile } = require('wavefile');
  let {
    Signal,
  } = require('../index');
  this.timeout(10*1000);

  const EVAM_ME_SUTTAM = path.join(__dirname, 'data/evam-me-suttam.wav');
  const AN9_20_4_3 = path.join(__dirname, 'data/an9.20_4.3.wav');

  it("default ctor", ()=>{
    console.warn('----------EXPECTED ERROR (BEGIN)-----------------');
    try {
      var eCaught;
      new Signal();
    } catch(e) { eCaught = e };
    console.warn('----------EXPECTED ERROR (END)-----------------');
    should(eCaught.message).equal('E_SIGNAL_ARRAY');
  });
  it("custom ctor", ()=>{
    let data = [1, 2, 3, 5, 4];
    let sig = new Signal(data);
    should.deepEqual(sig.stats(), Signal.stats(data));
  });
  it("rmsErr(that)", ()=>{
    let a = [1,2,3,4,5];
    let b = [2,3,4,5,6];
    let sig = new Signal(a);
    should.deepEqual(sig.rmsErr(b), Signal.rmsErr(a,b));
  });
  it("stats() => stats", async()=>{
    let dataOdd = [1, 2, 3, 5, 4];
    should.deepEqual(Signal.stats(dataOdd), {
      count: 5,
      avg: 3,
      iMax: 3,
      iMin: 0,
      avg32: 3,
      median: 3,
      sum: 15,
      max: 5,
      min: 1,
      stdDev: Math.sqrt((4+1+1+4)/5),
    });
    let dataEven = [1, 2, 3, 5, 4, 60];
    should.deepEqual(Signal.stats(dataEven), {
      count: 6,
      avg: 12.5,
      avg32: 12.5,
      iMax: 5,
      iMin: 0,
      median: 3.5,
      sum: 75,
      max: 60,
      min: 1,
      stdDev: 21.2818388929779, /* population standard deviation */
    });
  });
  it("rmsErr(a,b) => root mean square error", ()=>{
    let a = [1,2,3,4,5];
    let b = [2,3,4,5,6];
    let c = [5,4,3,2,1];
    should(Signal.rmsErr(a,a)).equal(0);
    should(Signal.rmsErr(b,b)).equal(0);
    should(Signal.rmsErr(a,b)).equal(1);
    should(Signal.rmsErr(a,c)).equal(Math.sqrt((16+4+0+4+16)/5));
  });
  it("split() => non-zero groups", async()=>{
    let verbose = 0;
    let data = [
      /*  0 */ 0,0,0,
      /*  3 */ 1,-3,3,1, 
      /*  7 */ 0,
      /*  8 */ 1,
      /*  9 */ 0,0,
      /* 11 */ 1,2,1,
      /* 15 */ 0,0,0,0,
    ];
    let sig = new Signal(data);
    should.deepEqual(sig.split({verbose}), [
      { start: 3, length: 4 },
      { start: 8, length: 1 },
      { start: 11, length: 3 },
    ]);
    should.deepEqual(sig.split({threshold:2, verbose}), [
      { start: 4, length: 2 },
      { start: 12, length: 1 },
    ]);
    should.deepEqual(sig.split({dampen:1, verbose}), [
      { start: 3, length: 6 },
      { start: 11, length: 3 },
    ]);
    should.deepEqual(sig.split({dampen:2, verbose}), [
      { start: 3, length: 11 },
    ]);
  });
  it("toIterator() handles ArrayBuffer", ()=>{
    let data = new Int8Array([-1,0,1]);
    should.deepEqual([...data], [-1,0,1]);
    should.deepEqual([...new Uint8Array(data.buffer)], [255,0,1]);
    should.deepEqual([...Signal.toIterator(data.buffer)], [255,0,1]);
  });
  it("WAV split EVAM_ME_SUTTAM audio", async()=>{
    let verbose = 0;
    let buf = await fs.promises.readFile(EVAM_ME_SUTTAM);
    let wf = new WaveFile(buf);
    let s16 = wf.getSamples(false, Int16Array);
    let msStart = Date.now();
    let sig = new Signal(s16);
    let threshold = 2;  // generated speech is very quiet
    let dampen = 36;    // ~1ms includes unvoiced consonants (e.g., sutaṁ)
    let splits = sig.split({threshold, dampen});
    1 && console.log(`splits[${splits.length}]`, JSON.stringify(splits.slice(0,10)));
    0 && console.log('zeros', s16.slice(0, splits[0].start).join(','));
    should.deepEqual(splits[0], {start: 1293, length: 12855});  // evaṁ
    should.deepEqual(splits[1], {start: 18096, length: 9220});  // me
    should.deepEqual(splits[2], {start: 31361, length: 20251});  // suttaṁ

    // Splitting on the audio signal is more accurate than
    // splitting on any MDCT coefficient. Generated speech will
    // have almost zero signal between spoken words.
    // MDCT coefficients are grouped by blocks of coefficients, 
    // where each block is one/half of a frame. During decoding,
    // MDCT blocks are expanded into full-size frames that are
    // overlapped and summed to retrieve the original signal.
    let frameSize = 192;
    let blockSize = frameSize/2;
    let splitBlocks = sig.split({threshold, dampen, blockSize});
    should.deepEqual(splitBlocks[0], {start: 13, length: 135});  // evaṁ
    should.deepEqual(splitBlocks[1], {start: 188, length: 97});  // me
    should.deepEqual(splitBlocks[2], {start: 326, length: 212});  // suttaṁ
    should(splitBlocks.length).equal(3);
  });
  it("WAV files", async()=>{
    let verbose = 1;
    let buf = await fs.promises.readFile(AN9_20_4_3);
    let wf = new WaveFile(buf);
    let s16 = wf.getSamples(false, Int16Array);
    let msStart = Date.now();
    let sig = new Signal(s16);
    let stats = sig.stats();
    verbose && console.log(`AN9_20_4_3 stats in ${Date.now()-msStart}ms`);
    should(s16.length).equal(2626031);
    should.deepEqual(stats, {
      count: 2626031,
      min: -15311,
      max: 15371,
      iMin: 943090,
      iMax: 1764940,
      sum: 2340943,
      avg: 0.8914376867599811,
      avg32: 0.8914377093315125,
      median: -1,
      stdDev: 1803.544548440329,
    });
    should(s16[stats.iMin]).equal(stats.min);
    should(s16[stats.iMax]).equal(stats.max);
  });
  it("toInt16Array() => Int16Array", async()=>{
    // from Array
    let listArray = Signal.toInt16Array([-32768, 0, 32767]);
    should(listArray.constructor.name).equal('Int16Array');
    should.deepEqual(listArray, new Int16Array([-32768, 0, 32767]));
    
    // from ArrayBuffer
    let abArray = Signal.toInt16Array(listArray.buffer);
    should(abArray.constructor.name).equal('Int16Array');
    should.deepEqual(abArray, new Int16Array([-32768, 0, 32767]));
    
    // from Int16Array
    should(Signal.toInt16Array(listArray)).equal(listArray);

    // from NodeJS Buffer
    let buf = await fs.promises.readFile(AN9_20_4_3);
    let wf = new WaveFile(buf);
    let samples = wf.getSamples(false, Int16Array);
    should(samples.constructor.name).equal('Int16Array');
    should(samples.length).equal(2626031);
  });
  it("stats(AN9_20_4_3) => iterators are slower than loops", async()=>{
    let buf = await fs.promises.readFile(AN9_20_4_3);
    let wf = new WaveFile(buf);
    let samples = wf.getSamples(false, Int16Array);
    let msStart;
    let verbose = 1;
    let statsExpected = (data)=>{
      let itData = Signal.toIterator(data);
      let min;
      let max;
      let sum;
      for (var count = 0; ; count++) {
        let {value,done} = itData.next();
        if (done) { break; }
        if (count === 0) {
          sum = min = max = value;
        } else {
          (value < min) && (min = value);
          (max < value) && (max = value);
          sum += value;
        }
      }
      let avg = sum/count;
      let sqDev = 0;
      for (let i=0; i<count; i++) {
        let dev = data[i]-avg;
        sqDev += dev*dev;
      }
      let stdDev = Math.sqrt(sqDev/count);
      verbose && console.log(`stdDev`, stdDev); // 1803.544548440329
      return { min, max, count, sum, avg, }
    } // statsExpected

    let stats1 = statsExpected(samples);

    msStart = Date.now();
    let stats2 = Signal.stats(samples);
    let elapsed = Date.now() - msStart;
    verbose && console.log(`elapsed loop`, elapsed, JSON.stringify(stats2));
    should(stats2).properties({
      stdDev: 1803.544548440329, // differs slightly from statsExpected
    });

    should(stats2).properties(stats1);
  });
  it("WAV split AN9_20_4_3 audio", async()=>{
    let verbose = 1;
    let buf = await fs.promises.readFile(AN9_20_4_3);
    let wf = new WaveFile(buf);
    let s16 = wf.getSamples(false, Int16Array);
    let msStart = Date.now();
    let sig = new Signal(s16);
    let threshold = 2;  // generated speech is very quiet
    let dampen = 36;    // ~1.6ms distinguishes unvoiced consonants from words
    let splits = sig.split({threshold, dampen});
    1 && console.log(`splits[${splits.length}]`, JSON.stringify(splits.slice(0,10)));
    0 && console.log('zeros', s16.slice(0, splits[0].start).join(','));
    let pli = "Caturāsīti suvaṇṇapātisahassāni adāsi rūpiyapūrāni, caturāsīti rūpiyapātisahassāni adāsi suvaṇṇapūrāni, caturāsīti kaṁsapātisahassāni adāsi hiraññapūrāni, caturāsīti hatthisahassāni adāsi sovaṇṇālaṅkārāni sovaṇṇadhajāni hemajālappaṭicchannāni, caturāsīti rathasahassāni adāsi sīhacammaparivārāni byagghacammaparivārāni dīpicammaparivārāni paṇḍukambalaparivārāni sovaṇṇālaṅkārāni sovaṇṇadhajāni hemajālappaṭicchannāni, caturāsīti dhenusahassāni adāsi dukūlasandhanāni kaṁsūpadhāraṇāni, caturāsīti kaññāsahassāni adāsi āmuttamaṇikuṇḍalāyo, caturāsīti pallaṅkasahassāni adāsi gonakatthatāni paṭikatthatāni paṭalikatthatāni kadalimigapavarapaccattharaṇāni sauttaracchadāni ubhatolohitakūpadhānāni, caturāsīti vatthakoṭisahassāni adāsi khomasukhumānaṁ koseyyasukhumānaṁ kambalasukhumānaṁ kappāsikasukhumānaṁ, ko pana vādo annassa pānassa khajjassa bhojjassa leyyassa peyyassa, najjo maññe vissandanti.".split(' ');
    should(splits.length).equal(pli.length);
  });

})
