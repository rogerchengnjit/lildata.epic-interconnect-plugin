import rootConfig from '../../config';
import util from '../../lib/common/util';
import lib from './lib';

util.setupFolders();

const studies = lib.studies;
const runStudies = studies('./data/epic-sent-record-latest.json', () => {console.log('DONE')});
runStudies();

/*
var patients = lib.patients;
var runPatients = patients(function(){console.log('DONE');process.exit();});
runPatients();
*/