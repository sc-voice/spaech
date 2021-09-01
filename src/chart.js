(function(exports) {
  const { logger } = require('log-instance');
  const assert = require('assert');

  class Chart {
    constructor(args={}) {
      let {
        data=[],
        lines=13,
        precision=2,
        xTicks=10,
        title='Chart',
      } = args;

      this.data = data;
      this.lines = lines;
      this.precision = precision;
      this.xTicks = xTicks;
      this.title = title;
    }

    stats(data=[]) {
      if (!Array.isArray(data[0])) { data = [data]; }
      let width = data.reduce((a,d)=> Math.max(a, d.length), 0);
      let data0 = data[0][0];
      let stats = data.reduce((ad,ds)=>{
        return ds.reduce((a,d,i) => {
          assert(!isNaN(d), `Expected number: ${d} ds[${i}]`);
          a.min = Math.min(d, a.min);
          a.max = Math.max(d, a.max);
          return a;
        }, ad);
      },{min:data0, max:data0, width});
      stats.range = stats.max - stats.min;
      //console.log(`stats`, stats);
      return stats;
    }

    plot(args={}) {
      let {
        data=this.data,
        lines=this.lines,
        precision=this.precision,
        xTicks=this.xTicks,
        xInterval=1,
        title=this.title,
      } = args;
      if (!Array.isArray(data[0])) { data = [data]; }
      data = data.map(ds=>ds.filter((v,i) => i%xInterval === 0));
      let { min, max, range, width } = this.stats(data);
      assert(!isNaN(min), `expected min for data${data}`);
      assert(!isNaN(max), `expected max for data`);
      assert(!isNaN(width), `expected width for data`);
      let output = [...new Array(lines)].map(e=>new Int8Array(width));
      let lineLast = lines - 1;
      let line = (x)=> Math.round((max-x)*lineLast/range);
      let yOfLine = (line)=> (line*min + (lineLast - line)*max)/lineLast; 
      let iy0 = line(0);
      let labelSize = 1+Math.max(
        min.toFixed(precision).length, 
        max.toFixed(precision).length);
      data.forEach((ds,id)=>{
        ds.forEach((d,ix)=>{
          let iy = line(d);
          let oiy = output[iy];
          oiy[ix] = oiy[ix] ? 9 : (id+1) ;
          //console.log(`output`, {iy, d});
        });
      });
      let iy4 = Math.round(lines/4);
      title && console.log(title, JSON.stringify({
        min: min.toFixed(Math.max(5, precision)),
        max: max.toFixed(Math.max(5, precision)), 
        xInterval,
      }));
      output.forEach((ds,iy)=>{
        let line = [...ds].map((v,ix)=>{
            switch(v) {
              case 0: return iy === iy0 
                ? (ix % xTicks ? '-' : '+')
                : (iy-iy0) % iy4 ? ' ' : (ix % xTicks ? '.' : ':');
              case 9: return '*';
              default: return v;
            }
          });
        let label = yOfLine(iy).toFixed(precision);
        while (label.length < labelSize) { label = ' '+label}
        console.log(label, line.join(''));
      });
    }

  }

  module.exports = exports.Chart = Chart;
})(typeof exports === "object" ? exports : (exports = {}));
