import async from 'async';
import winston from 'winston';
import zerorpc from "zerorpc";
import jsonQuery from 'json-query';
import MongoDb from 'mongoose/node_modules/mongodb';
import config from '../../../../../lildata.hack-click-plugin/config';
import parentIdHelper from '../../../../../lildata.hack-click-plugin/lib/parent-id-helper';
import EpicInterconnectHelper from '../../../lib/epic-interconnect-helper';
import EpicParseSoapHelper from '../../../lib/epic-parse-soap-helper';

const logger = winston.loggers.get('epic-interconnect');
const MongoClient = MongoDb.MongoClient;
const patientCollection =  config.interconnectCollections.patient;
const spinForever = true;
const waitTime = 5000;
const epicZmqServer = "tcp://127.0.0.1:4343";
const url = `mongodb://${config.mongoServer}:27017/dump`;

let mongoDb;
let collection;

// Use connect method to connect to the Server
const connectToMongo = callback => {
  MongoClient.connect(url, (err, db) => {    
    if (err) {
      return logger.error('Failed to connect mongo');
    }
    mongoDb = db;
    logger.info(`Connected correctly to ${config.mongoServer}`);
    callback();
  });
};

/**
  Find all patient records that has a processstate of 'enrolled'.
  This processtate indicates that we have not tried to match patient record in CRMS.

  .find({'ENROLLPATIENTREQUESTREQUEST.PROCESSSTATE':'Enrolled'},   
**/
const getPatientDump = (err, cb) => {
  collection = mongoDb.collection(patientCollection);
  collection.find(
    {$or: [ { epicInterconnectChecked: {$exists:false}}, {epicInterconnectChecked: 0} ]},
    (err, resultCursor) => {
      const processItem = (err, item) => {
        if (err) {
          logger.error(`/apps/epic/lib/patient.js|getPatientDump()|${err.message}`);
        }
        //End of iterator, no more to process
        if (item === null || typeof item === 'undefined') {
          //Are we spinning forever?
          if (!spinForever) {
            mongoDb.close();
            if (cb){
              return cb();
            }
            return;
          } else {
            //inifinite, pause 5 seconds
            return setTimeout(() => {
              logger.info(`Waited ${waitTime} sec. Restarting getPatientDump()`);
              getPatientDump(null, cb);
            }, waitTime);
          }
        }
        //Process item
        respondToEPIC(item, err => {
          //Just in case EPIC can't handle volume
          setTimeout(() => {
            resultCursor.nextObject(processItem);
          }, 1000);
        });
      };
      //Recursive fetch
      resultCursor.nextObject(processItem);
    }
  );
};

/**
  @override
  Lookup patient record in CRMS, whereever that may be.
  For now, use the sql-proxy-cluster service.
**/
const patientLookup = (json, cb) => {
  //Do your thing:
  const options = { 
    action: 'EnrollPatientRequestRequest',
    data: json,
    promise(err, res) {      
      if (err) {
        return cb(err);
      }
      if (res.message) {        
        //log into mongo
        collection.update(
          {_id: json._id},
          { $addToSet: { log: { dateProcessed: Date.now(), action: 'epic-send', status: res.message } } },
          {w:1},
          err => {        
            /** Now send it**/  
            delete res.message;
            cb(null, res);    
          }
        );        
      } else {
        //Just move on
        cb(null, res); 
      }
    }
  };
  const epicInterconnectHelper = new EpicInterconnectHelper(options);
  epicInterconnectHelper.run();
};

/**
  Send EnrollPatientRequestRequest to Interconnect to update status.
**/
const send = (request, cb1) => {
  //Tack on id to the request
  request.id = request.plannedStudyExtension;

  //The message is ready to be sent
  const client = new zerorpc.Client({heartbeatInterval:60000,timeout:60}); //default 5000ms
  client.on('error', err => {
    logger.error(
      `Zerorpc.Client Error occured for ${id}${err && err.message?err.message:''}`
    );
  });
  client.connect(epicZmqServer);
  client.invoke("epicInterconnectProxy", request, (error, res, more) => {
      client.close();
      if (error){
        cb1(error);
      } else {
        cb1(null, res);
      }
  });
};

logEverything = logEverything.bind(respondToEPIC);

// do NOT use arrow, we need bind to own 'this'
function logEverything(err, results) {
  const json = this.args[0];
  const callback = this.args[1];

  const lastCallback = (e, res) => {
    let message;
    
    if (err) {
      //message = err.message ? err.message : 'Patient not sent: ' + res.candidateExtension; 
      message = `Patient sent failed: id=${res.candidateExtension} study-id=${res.plannedStudyExtension}\n${err && err.message ? err.message : ''}`;        
      logger.error(message);
    } else {
      message = `Patient sent attempted: id=${res.candidateExtension} study-id=${res.plannedStudyExtension} message-id=${results && results.messageId ? results.messageId : '!!ERROR!!'}`;
      logger.info(message);
    }

    const now = Date.now();

    collection.update({_id: res._id}, { $set: 
      { plannedStudyExtension: res.plannedStudyExtension,
        candidateExtension: res.candidateExtension,
        epicInterconnectChecked: 1, 
        epicInterconnectSent: (err ? 0 : 1),
        error: (err ? 1 : 0), 
        dateProcessed: now, 
        status: message 
      }, 
      $addToSet: { log: { dateProcessed: now, action: 'epic-send', status: message } } }, {w:1}, err => {
      callback();      
    });
  };

  EpicParseSoapHelper.parse(json, lastCallback);
}

/**
  @function
  respondToEPIC  
**/
// do NOT use arrow, we need bind to own 'this'
function respondToEPIC(json, callback) {
  this.args = Array.prototype.slice.call(arguments);

  if (json['outgoing']) {
    //Strip the prefix from studyId
    const plainId = parentIdHelper.parse(json['outgoing']['plannedStudyExtension']);
    json['outgoing']['plannedStudyExtension'] = plainId;

    //Fix the date so EPIC can understand
    json['outgoing']['dob'] = new Date(json['outgoing']['dob']).toISOString().replace(/-/g,'').slice(0,8);
    /**
      A change was made from our end, just send it.
    **/
    logger.info(
      `Attempting to send patient ${json['outgoing']['candidateExtension']} for study ${json['outgoing']['plannedStudyExtension']}`
    );
    return send(json['outgoing'], (err, res) => {
      const now = Date.now();
      const message = err ? err.message : res;

      logger.info(message);
      
      collection.update({_id: json._id}, { $set: 
        { plannedStudyExtension: json.plannedStudyExtension,
          candidateExtension: json.candidateExtension,
          epicInterconnectChecked: 1, 
          epicInterconnectSent: (err ? 0 : 1),
          error: (err ? 1 : 0), 
          dateProcessed: now, 
          status: message 
        }, 
        $addToSet: { log: { dateProcessed: now, action: 'epic-send', status: message } } }, {w:1}, err => {        
        /** Get next item**/  
        callback();        
      });
    });
  }

  async.waterfall([
    next => {
      //Start your engines
      next(null, json);
    },
    EpicParseSoapHelper.parse,
    patientLookup,    
    send
  ], logEverything);

}

export default function start() {
  connectToMongo(getPatientDump);
}
