//setup logger
import '../../../lildata.hack-click-plugin/lib/winston-helper';

export default {
  epic: require('./epic'),
  epicBulk: require('./epic-bulk')
};