import MongoDb from 'mongoose/node_modules/mongodb';
import fs from 'fs';
import _ from 'underscore';
import winston from 'winston';
import util from '../../../../../lildata.hack-click-plugin/lib/common/util';
import config from '../../../../../lildata.hack-click-plugin/config';;
import parentIdHelper from '../../../../../lildata.hack-click-plugin/lib/parent-id-helper';
import async from 'async';
import flat from 'flat';
import json2csv from 'json2csv';
import MJ from "mongo-fast-join";

const mongoJoin = new MJ();
const MongoClient = MongoDb.MongoClient;
const flatten = flat.flatten;
const logger = winston.loggers.get('epic-interconnect');
const destDbName = 'syndication';
const url = `mongodb://${config.mongoServer}:27017/${destDbName}`;

let mongoDb; //mongo
let streamJSON = false;

util.setupFolders();

// override
config.mongoServer = '127.0.0.1';

const exit = () => {
  setTimeout(process.exit, 400);
};

// Use connect method to connect to the Server
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

/**
  If using mongo-join, we need to add "epicSentId" to _interfacelog_customattributesmanagers
**/
const updateWithSentId = () => {
  mongoDb.collection('_interfacelog_customattributesmanagers')
    .find({epicInterconnectSent:1, epicSentId: { $exists: false }}, {status:1})
    .toArray((err, results) => {      
      async.each(results, (d, next) => {
        const s = d.status.indexOf('message-id=');
        const sentId = d.status.slice(s+11);
        
        mongoDb.collection('_interfacelog_customattributesmanagers')
          .update({_id: d._id }, { $set: { epicSentId: sentId } }, {w:1}, err => {
            next();
          });
        }, err => {
          console.log('DONE');
        });
    });
};

const getEpicInterconnectLogSlim = () => {
  const time= process.hrtime();
  async.parallel({
    epicCheck(next) {
      mongoDb.collection('_interfacelog_customattributesmanagers')
        .find({epicInterconnectSent:1 }, { _id: 0, sourceObjectID: 1, dateProcessed:1, log: 1 })
        .toArray((err, results) => {
          next(null, results);
        });
    }
  }, (err, finalResults) => {    
    //Map
    const mapped = _.map(finalResults.epicCheck, d => {      
      const sortedLog = _.sortBy(d.log, d => -d.dateProcessed);
      const found = _.find(sortedLog, d => d.action == 'epic-check');
      const epicCheck = JSON.parse(found.status);

      const r = {};
      r['id'] = parentIdHelper.parse(d.sourceObjectID);
      r['id'] = parentIdHelper.parse(epicCheck['crms'][0].id);

      const dateProcessed = new Date(d.dateProcessed).toISOString();
      r.date = dateProcessed.slice(0,10);
      r.time = dateProcessed.slice(11,19);      
      r.crms = epicCheck['crms'][0];
      r.rnumber = epicCheck['rnumber'][0];
      r.rnumber['focus'] = r.rnumber['name'];
      delete r.rnumber['name'];
      r.irb = epicCheck['irb'][0];
      r.dateProcessed = d.dateProcessed;
      return r;
    });

    //Shuffle by clinical trial id
    const groupByClinicalId = _.groupBy(mapped, 'id');

    //Reduce by last sent date descending
    const reduced = _.reduce(groupByClinicalId, (memo, v, k) => {
      const sorted = _.sortBy(v, g => -g.dateProcessed);      
      sorted[0].messageCount = sorted.length;      
      //flatten
      memo.push(flatten(sorted[0]));
      return memo;
    }, []);

    //Final sort
    const finalSort = _.sortBy(reduced, d => +d.dateProcessed);
    
    finalSort.forEach(d => {
      delete d.dateProcessed;      
    });
    
    fs.writeFileSync(
      `${config.dumpFolder}/epic-sent-record.json`,
      JSON.stringify(finalSort,null,'  '),
      {encoding:'utf8'}
    );
    
    json2csv({data: finalSort, fields: Object.keys(finalSort[0]) }, (err, csv) => {
      fs.writeFileSync(`${config.dumpFolder}/epic-sent-record.csv`, csv, {encoding:'utf8'});
      exit();    
    });

    logger.info(`DONE => ${process.hrtime(time)}`);    
    console.log('Sent => %d', reduced.length);
  });
};

const latestSent = finalResults => {
  const filtered = _.filter(finalResults.epicCheck, d => typeof d['epicInterconnectResponse'] !== 'undefined');
  const mapped = _.map(filtered, d => d.epicInterconnectResponse);
  const grouped = _.groupBy(mapped, d => d['id']);
  const sorted = _.reduce(grouped, (m, v, k) => {
    const st = _.sortBy(v, d => -(new Date(d.dateCreated).getTime()));
    const latest = st[0];
    m.push(latest);
    return m;
  },[]);

  const done = () => {
    console.log('Latest sent => %d', sorted.length);
    process.exit();
  };

  const ofs = fs.createWriteStream(`${config.dumpFolder}/epic-sent-record-latest.json`, {encoding:'utf8'});
  ofs.on('finish', done);
  sorted.forEach(d => {
    ofs.write(`${JSON.stringify(d)}\n`);
  });
  ofs.end();  
};

const cancerRelatedStudies = finalResults => {
  //map
  const filtered = _.filter(finalResults.epicCheck, d => {
    const status = JSON.parse(d.epicCheck.status);
    return status.crms.length > 0 && status.crms[0].isOncologyStudy == 1;
  });
  //flatten
  const flattened = _.map(filtered, d => flatten(d));
  //shuffle
  const grouped = _.groupBy(flattened, d => d['epicInterconnectResponse.id']);
  //sort
  const sorted = _.reduce(grouped, (m, v, k) => {
    const st = _.sortBy(v, d => -d.dateProcessed);
    const latest = st[0];
    m.push({
      id: k,
      text: latest['epicInterconnectResponse.context.text'],
      pi: latest['epicInterconnectResponse.context.studyCharacteristics.0.value.code'],
      lastSent: new Date(latest.dateProcessed),
      status: latest['epicCheck.status']        
    });
    return m;
  }, []);

  json2csv({data: sorted, fields: Object.keys(sorted[0]) }, (err, csv) => {
    fs.writeFileSync(
      `${config.dumpFolder}/epic-sent-record-cancer-related.csv`,
      csv,
      {encoding:'utf8'}
    );    
    exit();
  });
};

//Same as mongo-join ~ 1.7 sec
const getEpicInterconnectComplete = callback => {
  const time= process.hrtime();
  async.parallel({
    epicCheck(next) {
      mongoDb.collection('_interfacelog_customattributesmanagers')
        .find({epicInterconnectSent:1 }, { _id: 0, epicSentId:1, dateProcessed:1, log: { $elemMatch: { action: 'epic-check' } } })
        .toArray((err, results) => {
          next(null, results);
        });
    },
    sent(next) {
      mongoDb.collection('epicinterconnectresponses')
        .find({action: { $regex: 'retrieveprotocoldefresponse', $options: 'i' } } ,{id: 1, dateCreated:1,statusCode:1,"context.id": 1,"context.studyCharacteristics": 1,"context.title": 1,"context.text": 1, "context.classCode": 1, "context.moodCode": 1, "context.action": 1,request:1, response: 1 })
        .toArray((err, results) => {
          next(null, results);
        });
    }
  }, (err, finalResults) => {
    
    _.each(finalResults.epicCheck, d => {
      d.epicCheck = d.log[0];
      delete d.log;
      const found = _.find(finalResults.sent, g => g._id == d.epicSentId);
      if (found) {
        d.epicInterconnectResponse = found;
      }
    });

    const done = () => {
      logger.info(`DONE => ${process.hrtime(time)}`);    
      if (callback){
        callback(finalResults);
      } else {
        exit();
      }
    };

    if (streamJSON){
      const ofs = fs.createWriteStream(`${config.dumpFolder}/epic-sent-record.json`, {encoding:'utf8'});
      ofs.on('finish', done);
      finalResults.epicCheck.forEach(d => {
        ofs.write(`${JSON.stringify(d)}\n`);
      });
      ofs.end();
    } else {
      fs.writeFileSync(
        `${config.dumpFolder}/epic-sent-record.json`,
        JSON.stringify(finalResults.epicCheck,null, '  '),
        {encoding:'utf8'}
      );
      done();
    }            
  });
};

const epicSentRecord = () => {
  const time= process.hrtime();
  const q = mongoJoin
    .query(mongoDb.collection("_interfacelog_customattributesmanagers"),
      {epicInterconnectSent:1},
      { epicSentId:1, dateProcessed:1, log: { $elemMatch: { action: 'epic-check' } } },
      {}
    );

    q.join({
      joinCollection: mongoDb.collection("epicinterconnectresponses"),
      leftKeys: ["epicSentId"],
      rightKeys: ["_id"],
      newKey: "epicInterconnectResponse"
    })
    
  q.exec((err, items) => {
      
      logger.info(`DONE => ${process.hrtime(time)}`);
      
      const stream = fs.createWriteStream(`${config.dumpFolder}/epic-sent-record.json.json`);
      stream.on('finish', () => {
        logger.info('All done');
        logger.info(`DONE => ${process.hrtime(time)}`);
      });
      items.forEach(d => {
        stream.write(`${JSON.stringify(d,null,'  ')}\n`);
      });      
      stream.end();
    });
};

if (process.argv.length > 2){
  requested = process.argv[2];
  if (requested == 'complete'){
    if (process.argv.length == 3){
      connectToMongo(getEpicInterconnectComplete);
    }
    if (process.argv.length == 4){
      const custom = process.argv[3];
      if (custom == 'cancer'){
        connectToMongo(getEpicInterconnectComplete, cancerRelatedStudies);
      }
      if (custom == 'stream'){
        streamJSON = true;
        connectToMongo(getEpicInterconnectComplete);
      }
      if (custom == 'latest'){
        streamJSON = true;
        connectToMongo(getEpicInterconnectComplete, latestSent);
      }
    }    
  } 
  if (requested == 'slim'){
    connectToMongo(getEpicInterconnectLogSlim);
  }   
}
