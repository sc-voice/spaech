(typeof describe === 'function') && describe("compander", function() {
  const should = require("should");
  const fs = require('fs');
  const path = require('path');
  const { WaveFile } = require('wavefile');
  let {
      Compander,
      LzwInt8,
  } = require('../index');

  this.timeout(10*1000);

  const EVAM_ME_SUTTAM = path.join(__dirname, 'data/evam-me-suttam.wav');
  const AN9_20_4_3 = path.join(__dirname, 'data/an9.20_4.3.wav');

  it("Compander()", ()=>{
    let scale;
    let com = new Compander();
    should(com).properties({scale});
    should(com).properties({
      scale,
      range: 2*4032,
    });
  });
  it("custom ctor()", ()=>{
    let scale = 3;
    let com = new Compander({ scale, });
    should(com).properties({
      scale,
      range: 2*4032,
    });

    com = new Compander( { algorithm: "a-law" });
    should(com).properties({
      range: 2* 4032,
      algorithm: "a-law",
    });

    com = new Compander( { algorithm: "a-int8" });
    should(com).properties({
      range: 2* 3904,
      algorithm: "a-int8",
    });

  });
  it("valueToALawCode(value) => A-Law code", ()=>{
    let com = new Compander();

    should(com.valueToALawCode(0)).equal(0);
    should(com.valueToALawCode(1)).equal(0);
    should(com.valueToALawCode(3967)).equal(0x7e);
    should(com.valueToALawCode(3968)).equal(0x7f);

    // https://www.ti.com/lit/an/spra163a/spra163a.pdf
    should(com.valueToALawCode(-2460)).equal(0xF3);
    should(com.valueToALawCode(-1505)).equal(0xE7);
    should(com.valueToALawCode(-650)).equal(0xD4);
    should(com.valueToALawCode(-338)).equal(0xC5);
    should(com.valueToALawCode(-90)).equal(0xA6);
    should(com.valueToALawCode(-1)).equal(0x80);
    should(com.valueToALawCode(40)).equal(0x14);
    should(com.valueToALawCode(102)).equal(0x29);
    should(com.valueToALawCode(169)).equal(0x35);
    should(com.valueToALawCode(420)).equal(0x4a);
    should(com.valueToALawCode(499)).equal(0x4f);
    should(com.valueToALawCode(980)).equal(0x5e);
  });
  it("aLawCodeToValue(code) => 16-bit value", ()=>{
    let com = new Compander();

    should(com.aLawCodeToValue(0)).equal(1);
    should(com.aLawCodeToValue(0x7e)).equal(3904);

    // https://www.ti.com/lit/an/spra163a/spra163a.pdf
    should(com.aLawCodeToValue(0xF3)).equal(-2496);
    should(com.aLawCodeToValue(0xe7)).equal(-1504);
    should(com.aLawCodeToValue(0xd4)).equal(-656);
    should(com.aLawCodeToValue(0xc5)).equal(-344);
    should(com.aLawCodeToValue(0xa6)).equal(-90);
    should(com.aLawCodeToValue(0x80)).equal(-1);
    should(com.aLawCodeToValue(0x14)).equal(41);
    should(com.aLawCodeToValue(0x29)).equal(102);
    should(com.aLawCodeToValue(0x35)).equal(172);
    should(com.aLawCodeToValue(0x4a)).equal(424);
    should(com.aLawCodeToValue(0x4f)).equal(504);
    should(com.aLawCodeToValue(0x5e)).equal(976);

  });
  it("valueToAInt8Code(value) => a-int8 code", ()=>{
    let com = new Compander();

    should(com.valueToAInt8Code(-0.49)).equal(0);
    should(com.valueToAInt8Code(0)).equal(0);
    should(com.valueToAInt8Code(0.49)).equal(0);
    should(com.valueToAInt8Code(0.51)).equal(1);
    should(com.valueToAInt8Code(1)).equal(1);
    should(com.valueToAInt8Code(1.9)).equal(1);
    should(com.valueToAInt8Code(2)).equal(2);
    should(com.valueToAInt8Code(3.9)).equal(2);

    should(com.valueToAInt8Code(40)).equal(0x14+1);
    should(com.valueToAInt8Code(102)).equal(0x29+1);
    should(com.valueToAInt8Code(169)).equal(0x35+1);
    should(com.valueToAInt8Code(420)).equal(0x4a+1);
    should(com.valueToAInt8Code(499)).equal(0x4f+1);
    should(com.valueToAInt8Code(980)).equal(0x5e+1);
    should(com.valueToAInt8Code(3776)).equal(0x7e);
    should(com.valueToAInt8Code(4032)).equal(0x7f);

    should(com.valueToAInt8Code(-1)).equal(-1);
    should(com.valueToAInt8Code(-40)).equal(-(0x14+1));
    should(com.valueToAInt8Code(-102)).equal(-(0x29+1));
    should(com.valueToAInt8Code(-169)).equal(-(0x35+1));
    should(com.valueToAInt8Code(-420)).equal(-(0x4a+1));
    should(com.valueToAInt8Code(-980)).equal(-(0x5e+1));
    should(com.valueToAInt8Code(-3839)).equal(-0x7e);
    should(com.valueToAInt8Code(-4032)).equal(-0x80);
  });
  it("aInt8CodeToValue(code) => 16-bit value", ()=>{
    let com = new Compander();

    should(com.aInt8CodeToValue(-1)).equal(-1);
    should(com.aInt8CodeToValue(0)).equal(0);
    should(com.aInt8CodeToValue(1)).equal(1);

    should(com.aInt8CodeToValue(0x15)).equal(41);
    should(com.aInt8CodeToValue(0x7e)).equal(3776);
    should(com.aInt8CodeToValue(0x7f)).equal(3904);

    should(com.aInt8CodeToValue(-0x7f)).equal(-3904);
    should(com.aInt8CodeToValue(-0x80)).equal(-4032);
  });
  it("WAV ALaw companded", async()=>{
    let scale = 19091/8192;
    let com = new Compander({scale});
    let fnam = path.join(__dirname, 'data/evam-me-suttam.wav');
    let buf = await fs.promises.readFile(fnam);
    let wf = new WaveFile(buf);
    let { samples } =  wf.data;
    let iStart = 0;
    let iEnd = samples.length;
    let alawPrev = com.valueToALawCode(0);
    let daMax = 0;
    let daTot = 0;
    let alawBuf = new Int8Array(samples.length);
    for (let i=0; i<iEnd; i+=2) {
        let d = wf.data.samples.readInt16LE(i);
        let alaw = com.valueToALawCode(d);
        alawBuf[i/2] = alaw;
        let da = Math.abs(alaw - alawPrev);
        if (daMax < da) { daMax = da }
        daTot += da;
        alawPrev = alaw;

        let dc = com.aLawCodeToValue(alaw);
        wf.data.samples.writeInt16LE(dc,i);
        let dnew = wf.data.samples.readInt16LE(i);
        //console.log({i, d, alaw, dc, dnew});
    }
    //console.log(`dbg delta companded`, { daMax, daAvg: daTot/(iEnd/2)});
    let falaw = path.join(__dirname, 'data/evam-me-suttam-alaw.wav');
    await fs.promises.writeFile(falaw, wf.toBuffer());
  });
  it("WAV ALaw lzw", async()=>{
    let scale = 19091/8192;
    let com = new Compander({scale});
    let fnam = path.join(__dirname, 'data/evam-me-suttam.wav');
    let buf = await fs.promises.readFile(fnam);
    let wf = new WaveFile(buf);
    let { samples } =  wf.data;
    let iEnd = samples.length;
    let alawBuf = new Int8Array(samples.length);
    for (let i=0; i<iEnd; i+=2) {
        let d = wf.data.samples.readInt16LE(i);
        let alaw = com.valueToALawCode(d);
        alawBuf[i/2] = alaw;
    }

    let lzw1 = new LzwInt8();
    let data = alawBuf;
    let compressed = lzw1.compress(data);
    let expanded = lzw1.expand(compressed, {verbose:0});
    let n = Math.max(expanded.length, data.length);
      
    let i = 0;
    while (data[i] === expanded[i] && i < data.length) { i++; }
    if (i < data.length) {
      console.log(`data${i}`, JSON.stringify([...data.slice(-10)]));
      console.log(`expa${i}`, JSON.stringify(expanded.slice(-10)));
    }
    should(i).equal(data.length);
    should(compressed.length).equal(25534);

    let falaw_lzw = path.join(__dirname, 'data/evam-me-suttam-alaw.lzw');
    await fs.promises.writeFile(falaw_lzw, new Int16Array(compressed));
  });
  it("WAV ALaw trained lzw", async()=>{
    let scale = 19091/8192;
    let com = new Compander({scale});
    let fnam = path.join(__dirname, 'data/evam-me-suttam.wav');
    let buf = await fs.promises.readFile(fnam);
    let wf = new WaveFile(buf);
    let { samples } =  wf.data;
    let iEnd = samples.length;
    let alawBuf = new Int8Array(samples.length);
    for (let i=0; i<iEnd; i+=2) {
        let d = wf.data.samples.readInt16LE(i);
        let alaw = com.valueToALawCode(d);
        alawBuf[i/2] = alaw;
    }

    let lzw1 = new LzwInt8();
    let data = alawBuf;
    let minUses = 0; // 0 and 2 generate BIGGER files (!?!)
    let lzw2 = lzw1.train(data, {minUses});
    console.log(`trained glossary:${lzw2.glossary.length}`);
    should(lzw2.glossary.length).equal([136250,81428,11194][minUses]);
    let compressed = lzw2.compress(data);
    let expanded = lzw2.expand(compressed, {verbose:0});
    let n = Math.max(expanded.length, data.length);
      
    let i = 0;
    while (data[i] === expanded[i] && i < data.length) { i++; }
    if (i < data.length) {
      console.log(`data${i}`, JSON.stringify([...data.slice(-10)]));
      console.log(`expa${i}`, JSON.stringify(expanded.slice(-10)));
    }
    should(i).equal(data.length);
    should(compressed.length).equal([18814,21813,23509][minUses]);

    let falaw_lzw = path.join(__dirname, 'data/evam-me-suttam-alaw.lzw-trained');
    await fs.promises.writeFile(falaw_lzw, new Int16Array(compressed));
  });
  it("encode(data) A-Law removes LSB", async()=>{
    let scale = 1;
    let com = new Compander({scale});
    let data = [1,2,3,4,5,6];
    let encoded = com.encode(data);
    let expected = new Uint8Array([0, 1, 1, 2, 2, 3]);
    should(encoded).instanceOf(ArrayBuffer);
    should.deepEqual(new Uint8Array(encoded), expected);
  });
  it("encode/decode() clip data to [-4096, 4096] ", async()=>{
    let scale = 1;
    let com = new Compander({scale});
    let data = [-10000, -4032, 4032, 10000];
    let encoded = com.encode(data);
    let decoded = com.decode(encoded);
    should.deepEqual(decoded, new Int16Array([
      -4032, -4032, 4032, 4032, // clipped
    ]));
  });
  it("encode/decode() scaling affects low amplitude precision", async()=>{
    let scale = 10;
    let com = new Compander({scale});
    let data = [-10000, -1000,-100, -10, -1, 0, 1, 10, 100, 1000, 10000];
    let encoded = com.encode(data);
    let decoded = com.decode(encoded);
    should.deepEqual(decoded, new Int16Array([ // loss of precision
      -10080, -1020, -110, -10, -10, 10, 10, 10, 110, 1020, 10080
    ]));
  });
  it("encode(data) A-Int8 removes LSB", async()=>{
    let scale = 1;
    let algorithm = "a-int8";
    let com = new Compander({scale, algorithm});
    let data = [-6,-5,-4,-3,-2,-1, 0, 1,2,3,4,5,6];
    let encoded = com.encode(data);
    let expected = new Int8Array([
      -4, -3, -3, -2, -2, -1, 0, 1, 2, 2, 3, 3, 4,
    ]);
    should(encoded).instanceOf(ArrayBuffer);
    should.deepEqual(new Int8Array(encoded), expected);
  });
  it("encode/decode() A-Int8 clips data to [-4096, 3904] ", async()=>{
    let scale = 1;
    let algorithm = "a-int8";
    let com = new Compander({scale, algorithm});
    let data = [
      -10000, -4032, -3904, 3904, 4032, 10000
    ];
    let encoded = com.encode(data);
    let decoded = com.decode(encoded);
    should.deepEqual([...decoded], [
      -4032, -4032, -3904, 3904, 3904, 3904, // clipped
    ]);
  });
  it("encode/decode() A-Int8 scaling affects low amplitude precision", async()=>{
    let scale = 10;
    let algorithm = "a-int8";
    let com = new Compander({scale, algorithm});
    let data = [ -10000, -1000,-100, -10, -1, 0, 1, 10, 100, 1000, 10000, ];
    let encoded = com.encode(data);
    let decoded = com.decode(encoded);
    should.deepEqual([...decoded], [ // loss of precision and sign
      -10080, -1020, -110, -10, 0, 0, 0, 10, 110, 1020, 10080
    ]);
  });
  it("WAV a-int8 companded", async()=>{
    let algorithm = 'a-int8';
    let range = 30682; // 19091
    let scale = range/Compander.ALGORITHM_RANGE(algorithm);
    let com = new Compander({scale, algorithm});
    let fnam = 'an9.20_4.3';
    let fpath = path.join(__dirname, `data/${fnam}.wav`);
    let buf = await fs.promises.readFile(fpath);
    let wf = new WaveFile(buf);
    let { samples } =  wf.data;
    let iStart = 0;
    let iEnd = samples.length;
    let codePrev = com.valueToCode(0);
    let dCodeMax = 0;
    let dCodeTot = 0;
    let sampleMax = samples.readInt16LE(0);
    let sampleMin = samples.readInt16LE(0);
    let sqrDiffs = 0;
    for (let i=0; i<iEnd; i+=2) {
      let d = wf.data.samples.readInt16LE(i);
      sampleMax = Math.max(sampleMax, d);
      sampleMin = Math.min(sampleMin, d);
      let code = com.valueToCode(d);
      let dCode = Math.abs(code - codePrev);
      if (dCodeMax < dCode) { dCodeMax = dCode }
      dCodeTot += dCode;
      codePrev = code;

      let dc = com.codeToValue(code);
      let diff = d - dc;
      sqrDiffs += diff * diff;
      wf.data.samples.writeInt16LE(dc,i);
    }
    let nSamples = iEnd/2;
    let rmsErr = Math.sqrt(sqrDiffs/nSamples);
    let dCodeAvg = dCodeTot / nSamples;
    console.log(`A-Int8 companded`, { 
      algorithm, fnam, dCodeMax, dCodeAvg, sampleMax, sampleMin, rmsErr });
    should(dCodeMax).below(228);
    should(dCodeAvg).above(11).below(16);
    should(rmsErr).above(24).below(25);
    let fcode = path.join(__dirname, `data/${fnam}-aint8.wav`);
    await fs.promises.writeFile(fcode, wf.toBuffer());
  });
})
