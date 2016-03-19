import MongoDb from 'mongoose/node_modules/mongodb';
import fs from 'fs';
import _ from 'underscore';
import config from '../../../../../lildata.hack-click-plugin/config';;
import winston from 'winston';

const MongoClient = MongoDb.MongoClient;
const logger = winston.loggers.get('epic-interconnect');
const destDbName = 'dump';
const streamJSON = false;
const url = `mongodb://${config.mongoServer}:27017/${destDbName}`;
const exit = () => {
  setTimeout(process.exit, 400);
};

let mongoDb; //mongo

// override
config.mongoServer = '127.0.0.1';

const connectToMongo = (callback, next) => {
  MongoClient.connect(url, (err, db) => {    
    if (err) {
      return logger.error('Failed to connect mongo');
    }
    mongoDb = db;
    logger.info(`Connected correctly to ${config.mongoServer}`);
    callback(next);
  });
};

const query = next => {
  mongoDb.collection('NYU_PROD_ENROLLPATIENT_REQUEST').find({plannedStudyExtension:'12-03283',"S:ENVELOPE.S:BODY.RPE:ENROLLPATIENTREQUESTREQUEST":{$exists:true}},{candidateExtension:1,
  "S:ENVELOPE.S:BODY.RPE:ENROLLPATIENTREQUESTREQUEST.RPE:PATIENT.RPE:NAME.GIVEN":1,
  "S:ENVELOPE.S:BODY.RPE:ENROLLPATIENTREQUESTREQUEST.RPE:PATIENT.RPE:NAME.FAMILY":1,
  "S:ENVELOPE.S:BODY.RPE:ENROLLPATIENTREQUESTREQUEST.RPE:PROCESSSTATE":1,
  dateProcessed:1}).sort({dateProcessed:1}).toArray((err, docs) => {
    const mapped = _.map(docs, d => { d.dateProcessed = new Date(d.dateProcessed); return { mrn: d.candidateExtension, 
      lastName: d['S:ENVELOPE']['S:BODY']['RPE:ENROLLPATIENTREQUESTREQUEST']['RPE:PATIENT']['RPE:NAME']['FAMILY'].toString(),
    firstName: d['S:ENVELOPE']['S:BODY']['RPE:ENROLLPATIENTREQUESTREQUEST']['RPE:PATIENT']['RPE:NAME']['GIVEN'].toString(), 
    status: d['S:ENVELOPE']['S:BODY']['RPE:ENROLLPATIENTREQUESTREQUEST']['RPE:PROCESSSTATE'],
    dateProcessed: d.dateProcessed }; });
    
    const r = _.reduce(mapped, (m, d) => {
      m += `${d.mrn},${d.lastName.replace(/,/g, ' ')},${d.firstName.replace(/,/g, ' ')},${d.status},${d.dateProcessed}\n`;
      return m;
    },'mrn,lastName,firstName,status,date\n');

    fs.writeFileSync('./out.csv', r, {encoding:'utf8'});
    next();
  });
};

const query2 = next => {
  mongoDb.collection('NYU_PROD_ENROLLPATIENT_REQUEST').find({plannedStudyExtension:'12-03283',"S:ENVELOPE.S:BODY.RPE:ALERTPROTOCOLSTATE":{$exists:true}},{candidateExtension:1,
  "S:ENVELOPE.S:BODY.RPE:ALERTPROTOCOLSTATE.RPE:PATIENT.RPE:NAME.GIVEN":1,
  "S:ENVELOPE.S:BODY.RPE:ALERTPROTOCOLSTATE.RPE:PATIENT.RPE:NAME.FAMILY":1,
  "S:ENVELOPE.S:BODY.RPE:ALERTPROTOCOLSTATE.RPE:PROCESSSTATE":1,
  dateProcessed:1}).sort({dateProcessed:1}).toArray((err, docs) => {
    const mapped = _.map(docs, d => { d.dateProcessed = new Date(d.dateProcessed); return { mrn: d.candidateExtension, 
      lastName: d['S:ENVELOPE']['S:BODY']['RPE:ALERTPROTOCOLSTATE']['RPE:PATIENT']['RPE:NAME']['FAMILY'].toString(),
    firstName: d['S:ENVELOPE']['S:BODY']['RPE:ALERTPROTOCOLSTATE']['RPE:PATIENT']['RPE:NAME']['GIVEN'].toString(), 
    status: d['S:ENVELOPE']['S:BODY']['RPE:ALERTPROTOCOLSTATE']['RPE:PROCESSSTATE'],
    dateProcessed: d.dateProcessed }; });
    
    const r = _.reduce(mapped, (m, d) => {
      m += `${d.mrn},${d.lastName.replace(/,/g, ' ')},${d.firstName.replace(/,/g, ' ')},${d.status},${d.dateProcessed}\n`;
      return m;
    },'mrn,lastName,firstName,status,date\n');

    fs.writeFileSync('./out2.csv', r, {encoding:'utf8'});
    next();
  });
};

connectToMongo(query2, () => {console.log('DONE');exit();});
