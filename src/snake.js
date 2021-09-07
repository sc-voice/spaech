(function(exports) {
  const isNode=new Function("try {return this===global;}catch(e){return false;}");
  const { logger } = require('log-instance');
  const tf = require(isNode() ? '@tensorflow/tfjs-node' : '@tensorflow/tfjs');

  // Dense class is not explicitly exported, so we acquire it indirectly
  const dummyDense = tf.layers.dense({inputShape: [1], units: 1, useBias: true});
  const Dense = dummyDense.constructor;

  /**
   * Copy of internal method
   * Reference: https://github.com/tensorflow/tfjs/blob/master/tfjs-layers/src/activations.ts#L25-L30
   */
  class Activation extends tf.serialization.Serializable {
    apply(tensor, axis) { throw logger.error('E_ACT_ABSTRACT', "abstract method"); }
    getConfig() { return {}; }
  }

  /**
   * Snake
   * Reference: https://arxiv.org/abs/2006.08195
   */
  class SnakeActivation extends Activation {
    constructor(args={}) {
      super(args);

      let { alpha=1 } = args;
      this.alpha = tf.scalar(alpha);
    }

    /** @nocollapse */
    static get className() { return 'snakeActivation';}

    /**
     * Calculate the snake activation function.
     *
     * @param x: Input.
     * @param alpha: Scaling factor 
     * @return Output of the Snake activation.
     */
    apply(x, alpha = this.alpha) {
      return tf.tidy(()=>{
        let periodic = tf.div(tf.square(tf.sin(tf.mul(alpha,x))), alpha);
        return tf.add(x, periodic);
      });
    }
  }

  class Snake extends Dense {
    static className = 'Snake';
    constructor(args) {
      super(args);
      let { alpha=1 } = args || {};
      this.activation = new SnakeActivation({alpha});
      this.alpha = alpha;
    }

    static get isNode() { return isNode(); }
    static get Activation() { return SnakeActivation; }

    getConfig() {
      let { alpha } = this;
      return Object.assign({ alpha }, super.getConfig());
    }

    call(input, kwargs) {
      let { bias, kernel, activation } = this;
      return tf.tidy(()=>{
        this.invokeCallHook(input, kwargs);
        input = Array.isArray(input) ? input[0] : input;
        let output = tf.dot(input, kernel.read());
        if (bias) {
          if (output.rank >= 3) {
            throw logger.error('E_SNAKE_CALL', 
              `reshapeBias() not implemented for rank:${output.rank}`);
          }
          output = tf.add(output, bias.read());
        }
        if (activation != null) {
          output = activation.apply(output);
        }

        return output;
      });
    }

  }

  tf.serialization.registerClass(SnakeActivation);
  tf.serialization.registerClass(Snake);

  module.exports = exports.Snake = Snake;
})(typeof exports === "object" ? exports : (exports = {}));
