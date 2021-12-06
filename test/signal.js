(typeof describe === 'function') && describe("signal", function() {
  const should = require("should");
  const fs = require('fs');
  const path = require('path');
  const { WaveFile } = require('wavefile');
  let {
    Chart,
    Signal,
  } = require('../index');
  this.timeout(10*1000);

  const EVAM_ME_SUTTAM = path.join(__dirname, 'data/evam-me-suttam.wav');
  const EVAM_ME_SUTTAM_COPY = path.join(__dirname, 'data/evam-me-suttam-copy.wav');
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
    let a = new Int16Array([100, -100, 100, -100, 100]);
    let b = new Int16Array([101, -100,  99, -102, 100]);
    let sig = new Signal(a);
    should(Signal.rmsErr(a,a)).equal(0);
    should(Signal.rmsErr(a,b)).equal(1.09544511501033210);
    should.deepEqual(sig.rmsErr(b), Signal.rmsErr(a,b));
  });
  it("sineWave()", ()=>{
    let verbose = 0;
    let chart = new Chart();
    let frequency = 411;
    let nSamples = 5;
    let phase = Math.PI/2;
    let sampleRate = 22050;
    let scale = 10;
    let s1 = Signal.sineWave({frequency, nSamples, phase, scale, sampleRate, });

    // Default sampleRate is 22050 (a common MP3 rate)
    let s2 = Signal.sineWave({frequency, nSamples, scale, phase});
    let k = 2*Math.PI*frequency/sampleRate;
    let sine = [...new Int8Array(nSamples)].map((v,i)=>scale*Math.sin(i*k));
    let sinePhase = [...new Int8Array(nSamples)].map((v,i)=>scale*Math.sin(i*k+phase));
    should.deepEqual(s1, sinePhase);
    should.deepEqual(s1, s2); 

    // default phase is zero
    let s3 = Signal.sineWave({frequency, nSamples, scale}); 
    should.deepEqual(s3, sine);

    // default scale is 1
    let s4 = Signal.sineWave({frequency, nSamples:100}); 
    let title = `sineWave(${JSON.stringify({frequency})})`;
    verbose && chart.plot({title, data:[s4]});
    let stats4 = Signal.stats(s4);
    should(Math.abs(stats4.min + 1)).below(0.05);

    // sustain < 1 provides decay
    let sustain = 0.99;
    let s5 = Signal.sineWave({frequency, nSamples:100, sustain}); 
    title = `sineWave(${JSON.stringify({frequency, sustain})})`;
    verbose && chart.plot({title, data:[s5]});
    let stats5 = Signal.stats(s5);
    should(Math.abs(stats5.min + 0.66)).below(0.05);

    // returns TypedArray
    scale = 16384;
    let type = Int16Array;
    let s6 = Signal.sineWave({frequency, nSamples, scale, type});
    should(s6 instanceof type);
    should.deepEqual([...s6], sine.map(v=>Math.round(scale*v/10)));
  });
  it("cosineWave()", ()=>{
    let verbose = 0;
    let chart = new Chart();
    let frequency = 411;
    let nSamples = 90;
    let phase = Math.random()*Math.PI/2;
    let sampleRate = 22050;
    let scale = 10;
    let s1 = Signal.cosineWave({frequency, nSamples, phase, scale, sampleRate, });
    let s2 = Signal.sineWave({frequency, nSamples, phase:phase+Math.PI/2, scale, sampleRate, });
    verbose && chart.plot({data:[s1,s2]});

    let precision = 11; // this is surprisingly different
    for (let i=0; i < nSamples; i++) {
      should(s1[i].toFixed(precision)).equal(s2[i].toFixed(precision));
    }
  });
  it("sineWave() tStart", ()=>{
    let verbose = 0;
    let frequency = 411;
    let nSamples = 180;
    let phase = Math.PI/2;
    let sampleRate = 22050;
    let scale = 10;
    let offset = Math.round(Math.random()*80);
    let tStart = -offset;
    let s1 = Signal.sineWave({frequency, nSamples, phase, scale, sampleRate, });
    let s2 = Signal.sineWave({frequency, nSamples, phase, scale, sampleRate, tStart}).slice(offset);
    let title = `sineWave() *:s1===s2 1:s1 offset:${offset}`;
    let chart = new Chart({lines:7});
    let s2Expected = s1.slice(0, s1.length-offset);
    verbose && chart.plot({title, data:[s1,s2,s2Expected]});
    should.deepEqual(s2,s2Expected);
  });
  it("stats() => stats", async()=>{
    let dataOdd = [1, 2, 3, 5, 4];
    let variance = ((4+1+1+4)/5);
    should.deepEqual(Signal.stats(dataOdd), {
      count: 5,
      avg: 3,
      iMax: 3,
      iMin: 0,
      median: 3,
      sum: 15,
      max: 5,
      min: 1,
      stdDev: Math.sqrt(variance),
      variance,
    });
    let dataEven = [1, 2, 3, 5, 4, 60];
    should.deepEqual(Signal.stats(dataEven), {
      count: 6,
      avg: 12.5,
      iMax: 5,
      iMin: 0,
      median: 3.5,
      sum: 75,
      max: 60,
      min: 1,
      stdDev: 21.2818388929779, /* population standard deviation */
      variance: 452.9166666666667, 
    });
    let data = [2, 4, 4, 4, 5, 5, 7, 9];
    should.deepEqual(Signal.stats(data), {
      count: 8,
      avg: 5,
      iMax: 7,
      iMin: 0,
      median: 4.5,
      sum: 40,
      max: 9,
      min: 2,
      stdDev: 2, /* population standard deviation */
      variance: 4,
    });
  });
  it("stats() harmonics", ()=>{
    let verbose = 0;
    let f0 = 200;
    let frequencies = [f0, 2*f0, 4*f0]; // harmonics
    let scales = [5*Math.random(),3,2];
    let phases = [Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI];
    let dc = 2; // dc is not part of power
    let nSamples = Math.round(Math.random()*100+800);
    verbose && (nSamples = 857);
    let xInterval = Math.ceil(nSamples/95);
    let sines = frequencies.map((frequency,i)=>
      Signal.sineWave({ frequency, scale:scales[i], phase:phases[i], nSamples})
      .map(v=>v+dc));
    let stats = sines.map(sine=>Signal.stats(sine));
    let chart = new Chart({xInterval});
    let sinePower = scales.map(scale=>scale * scale / 2); 
    let expErr = 2.5e-1;
    try {
      for (let i = 0; i < stats.length; i++) {
        should(Math.abs(stats[i].variance - sinePower[i])).below(expErr);
      }
    } catch (e) {
      console.warn(`ERROR sines`, {nSamples, scales});
      throw e;
    }
    let sumSines = new Array(nSamples).fill(0)
      .map((v,i)=>sines.reduce(((a,sine,j)=>a+sines[j][i]),0));

    let statsSum = Signal.stats(sumSines);
    verbose && console.log({stats, statsSum});
    verbose && chart.plot({data:[...sines, sumSines]});
    try { 
      // Apparently, the sum of harmonic variances is the variance of the sum (!)
      let sumVariances = stats.reduce(((a,stats)=> a+stats.variance), 0);
      should(Math.abs(sumVariances - statsSum.variance)).below(3*expErr);
    } catch (e) {
      console.warn(`ERROR sumSines`, {nSamples, scales, phases});
      throw e;
    }
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
    should.deepEqual(sig.split({verbose, threshold:0}), [
      { start: 0, length: data.length },
    ]);
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
  it("toWav()", async()=>{
    let buf = await fs.promises.readFile(EVAM_ME_SUTTAM);
    let sig = Signal.fromWav(buf);
    let wav = sig.toWav();
    // WaveFile and ffmpeg generate different WAV files, so we
    // compare with the ffmpeg copy of the WaveFile WAV buffer
    let bufCopy = await fs.promises.readFile(EVAM_ME_SUTTAM_COPY);
    should.deepEqual([...wav], [...bufCopy]);
  });
  it("WAV split EVAM_ME_SUTTAM audio", async()=>{
    let verbose = 0;
    let buf = await fs.promises.readFile(EVAM_ME_SUTTAM);
    let sig = await Signal.fromWav(buf);
    let msStart = Date.now();
    let { data } = sig;
    let threshold = 2;  // generated speech is very quiet
    let dampen = 36;    // ~1ms includes unvoiced consonants (e.g., sutaṁ)
    let splits = sig.split({threshold, dampen});
    1 && console.log(`splits[${splits.length}]`, JSON.stringify(splits.slice(0,10)));
    0 && console.log('zeros', data.slice(0, splits[0].start).join(','));
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
    let verbose = 0;
    let buf = await fs.promises.readFile(AN9_20_4_3);
    let sig = await Signal.fromWav(buf);
    let { data:s16 } = sig;
    let msStart = Date.now();
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
      median: -1,
      stdDev: 1803.544548440329,
      variance: 3252772.93820883,
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
    let verbose = 0;
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
    let verbose = 0;
    let buf = await fs.promises.readFile(AN9_20_4_3);
    let sig = Signal.fromWav(buf);
    let { data: s16 } = sig;
    let msStart = Date.now();
    let threshold = 2;  // generated speech is very quiet
    let dampen = 36;    // ~1.6ms distinguishes unvoiced consonants from words
    let splits = sig.split({threshold, dampen});
    1 && console.log(`splits[${splits.length}]`, JSON.stringify(splits.slice(0,10)));
    0 && console.log('zeros', s16.slice(0, splits[0].start).join(','));
    let pli = "Caturāsīti suvaṇṇapātisahassāni adāsi rūpiyapūrāni, caturāsīti rūpiyapātisahassāni adāsi suvaṇṇapūrāni, caturāsīti kaṁsapātisahassāni adāsi hiraññapūrāni, caturāsīti hatthisahassāni adāsi sovaṇṇālaṅkārāni sovaṇṇadhajāni hemajālappaṭicchannāni, caturāsīti rathasahassāni adāsi sīhacammaparivārāni byagghacammaparivārāni dīpicammaparivārāni paṇḍukambalaparivārāni sovaṇṇālaṅkārāni sovaṇṇadhajāni hemajālappaṭicchannāni, caturāsīti dhenusahassāni adāsi dukūlasandhanāni kaṁsūpadhāraṇāni, caturāsīti kaññāsahassāni adāsi āmuttamaṇikuṇḍalāyo, caturāsīti pallaṅkasahassāni adāsi gonakatthatāni paṭikatthatāni paṭalikatthatāni kadalimigapavarapaccattharaṇāni sauttaracchadāni ubhatolohitakūpadhānāni, caturāsīti vatthakoṭisahassāni adāsi khomasukhumānaṁ koseyyasukhumānaṁ kambalasukhumānaṁ kappāsikasukhumānaṁ, ko pana vādo annassa pānassa khajjassa bhojjassa leyyassa peyyassa, najjo maññe vissandanti.".split(' ');
    should(splits.length).equal(pli.length);
  });

})
