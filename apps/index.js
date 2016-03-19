//setup logger
import '../lib/winston-helper';

export default {
  epic: require('../epic'),
  epicBulk: require('./epic-bulk')
};