import sql from 'mssql';
import async from 'async';
import _ from 'lodash';
import fs from 'fs';
import rootConfig from '../../../config';
import zerorpc from "zerorpc";
import config from '../config';
import rootConfig from '../../../../../lildata.hack-click-plugin/config';;

const client = new zerorpc.Client({heartbeatInterval :10000});
client.connect(`tcp://${config.zmq.host}:${config.zmq.port}`);

const connectionConfig = rootConfig.sqlCredentials["crms"];
//use pool
_.extend(connectionConfig, rootConfig.sqlConfig);
//logging
const log = fs.createWriteStream(`${rootConfig.dumpFolder}/epic-patients-send-${Date.now()}.log`, {encoding:'utf8'});
//test stdout to csv
const out = fs.createWriteStream(`${rootConfig.dumpFolder}/epic-patients-send-${Date.now()}.tsv`, {encoding:'utf8'});

export default finalCallback => () => {
  const time = process.hrtime();
  const cargo = async.cargo((tasks, callback) => {    
    async.each(tasks, (t, cb) => {
      client.invoke("epicInterconnectProxy", t, (error, res, more) => {
        if (res){
          res.id = t.id;
          res.mrn = t.candidateExtension;
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
      console.log(`Elapsed -> ${process.hrtime(time)}`);
      setTimeout(callback, 2000);
    });
  }, 20);

  const q = fs.readFileSync('./scripts/patients.sql',{encoding:'utf8'});  
  const connection = new sql.Connection(connectionConfig, err => {
    if (err){
      throw err;
    }
    console.log('Connected to SQL-> %s', connectionConfig.database);

    const request = new sql.Request(connection);
    request.query(q, (err, rows) => {
      console.log(rows.length);
      let h = 0;
      rows.forEach(data => {
        if (!h) { out.write(`${_.keys(data).join('\t')}\tdobParsed\n`); h = 1; }
        //convert dob to EPIC friendly date
        if (data['dob']){
          data['dobParsed'] = new Date(data['dob']).toISOString().replace(/-/g,'').slice(0,8);
        }
        out.write(`${_.values(data).join('\t')}\n`);
      });        
    });
  });
};
