(function(exports) {
  const { logger } = require('log-instance');
  const assert = require('assert');
  const OVERLAP = 9;

  class Chart {
    constructor(args={}) {
      let {
        data=[],
        lines=15,
        precision=2,
        yTicks=4,
        xTicks=10,
        xTicks2=50,
        title='Chart',
        lineLength=100,
        xInterval=1,
      } = args;

      assert(data instanceof Array, `[E_CHART_DATA] expected array of numbers for data`);

      Object.assign(this, { 
        data,
        lines,
        precision,
        xTicks,
        yTicks,
        title, lineLength, xInterval,
      });
    }

    stats(data=[]) {
      if (!Array.isArray(data[0]) && !ArrayBuffer.isView(data[0])) {
        data = [data];
      }
      let width = data.reduce((a,d)=> Math.max(a, d.length), 0);
      let data0 = data[0][0];
      let stats = data.reduce((ad,ds,i)=>{
        return ds.reduce((a,d,j) => {
          assert(!isNaN(d), `Expected number for ds[${j}]:${d}`);
          a.min = Math.min(d, a.min);
          a.max = Math.max(d, a.max);
          return a;
        }, ad);
      },{min:data0, max:data0, width});
      stats.range = stats.max - stats.min;
      //console.log(`stats`, stats);
      return stats;
    }

    plotRow({output,min,max,range}) {
      let { lines, precision, yTicks, xTicks, xTicks2 } = this;
      let labelSize = 1+Math.max(
        min.toFixed(precision).length, 
        max.toFixed(precision).length);
      let lineLast = lines-1;
      let line = (x)=> Math.round(range ? (max-x)*lineLast/range : lines/2);
      let yOfLine = (line)=> (line*min + (lineLast - line)*max)/lineLast; 
      let iy0 = line(0);
      output.forEach((ds,iy)=>{
        let line = [...ds].map((v,ix)=>{
            let ix1 = ix+1;
            let xTick = ix1 % xTicks2 ? ':' : '|';
            let yTick = ix1 % xTicks 
              ? (ix1 % 5 ? '.' : ',')
              : ':';
            switch(v) {
              case 0: return iy === iy0 
                ? (ix1 % xTicks ? (ix1 % 5 ? '-' : '+') : xTick)
                : ((iy-iy0) % yTicks ? ' ' : yTick);
              case OVERLAP: return '*';
              default: return v;
            }
          });
        let label = yOfLine(iy).toFixed(precision);
        while (label.length < labelSize) { label = ' '+label}
        console.log(label, line.join(''));
      });
    }

    plot(args={}) {
      let {
        data=this.data,
        lines=this.lines,
        xTicks=this.xTicks,
        xInterval=this.xInterval,
        title=this.title,
        transpose=false,
      } = args;
      let {precision, lineLength} = this;
      if (!Array.isArray(data[0]) && !ArrayBuffer.isView(data[0])) {
        data = [data];
      }
      data = data.map(ds=>ds.filter((v,i) => i%xInterval === 0));
      let stats = this.stats(data);
      let { min, max, range, width } = stats;
      assert(!isNaN(min), `expected min for data${data}`);
      assert(!isNaN(max), `expected max for data`);
      assert(!isNaN(width), `expected width for data`);
      let output = [...new Array(lines)].map(e=>new Int8Array(width));
      let line = (x)=> Math.round(range ? (max - x)*(lines - 1)/range : lines/2);
      data.forEach((ds,id)=>{
        ds.forEach((d,ix)=>{
          let iy = line(d);
          let oiy = output[iy];
          oiy[ix] = oiy[ix] ? OVERLAP : (id+1) ;
        });
      });
      for (let i=0; i < width; i+=lineLength) {
        i && console.log();
        let outRow = output.map(ds=>ds.slice(i, i+lineLength));
        this.plotRow({output:outRow, min, max, range});
      }
      if (title) {
        console.log(title);
      }

      return stats;
    }

  }

  module.exports = exports.Chart = Chart;
})(typeof exports === "object" ? exports : (exports = {}));
