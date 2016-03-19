import async from 'async';
import fs from 'fs';
import es from 'event-stream';
import zerorpc from "zerorpc";
import config from '../config';
import rootConfig from '../../../../../lildata.hack-click-plugin/config';;

const client = new zerorpc.Client({heartbeatInterval :10000});
client.connect(`tcp://${config.zmq.host}:${config.zmq.port}`);

const testMessage = {
  "last_lsn" : "0001E42A0000279B0001",
  "processState" : "Bogus State",
  "participantId" : "p12345",
  "plannedStudyExtension" : "ppp-1111",
  "candidateExtension" : "88888888",
  "dob" : -471898800000,
  "nameGiven" : "JOE",
  "nameFamily" : "SCHMOE",
  "streetAddressLine" : "ABC Place",
  "address2" : null,
  "city" : "New York",
  "state" : "New York",
  "postalCode" : "10000",
  "action" : "EnrollPatientRequestRequest"
};

const log = fs.createWriteStream(`${rootConfig.dumpFolder}/epic-studies-send-${Date.now()}.log`, {encoding:'utf8'});
export default (fileName, finalCallback) => () => { 
  const cargo = async.cargo((tasks, callback) => {    
    async.each(tasks, (t, cb) => {
      client.invoke("epicInterconnectProxy", t.context, (error, res, more) => {
        if (res){
          res.id = t.id;
          log.write(`${JSON.stringify(res)}\n`);
        }
        if (error){
          error.id = t.id;
          log.write(`${JSON.stringify(error)}\n`);
        }
        cb();
      });
    }, () => {
      console.log(`Processed ${tasks.length} ...`);
      setTimeout(callback, 2000);
    });      
  }, 20);

  const ifs = fs.createReadStream(fileName, {encoding:'utf8'});

  ifs.on('end', finalCallback);

  ifs
    .pipe(es.split())
    .pipe(es.parse())
    .pipe(es.map((data, cb) => {
      cargo.push(data, cb);
    }));
};
