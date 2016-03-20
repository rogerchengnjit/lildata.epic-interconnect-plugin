// import mongoose from 'mongoose';
import sql from 'mssql';
import async from 'async';
import zerorpc from "zerorpc";
import util from '../../../../../lildata.hack-click-plugin/lib/common/util';
import SqlAdhocHelper from '../../../../../lildata.hack-click-plugin/lib/sql-adhoc-helper';
import parentIdHelper from '../../../../../lildata.hack-click-plugin/lib/parent-id-helper';
import config from '../../../../../lildata.hack-click-plugin/config';
import schemaHelper from '../../../../../lildata.hack-click-plugin/lib/schema-helper';
import winston from 'winston';
import EpicInterconnectHelper from './epic-interconnect-helper';

const logger = winston.loggers.get('epic-interconnect');
// const mongooseModels = schemaHelper.loadSchemas(config.schemasFolder);
const dbName = 'syndication';
const waitTime = 10000;
//syndication model
// const model = mongooseModels['_InterfaceLog_CustomAttributesManager'];
const epicZmqServer = "tcp://127.0.0.1:4343";

// TODO: doc is now elasticsearch document
export default class EpicInterconnectStudy {

  constructor(props) {
    this.props = props;
    util.setupFolders();
  }

/**
  connectToMongo(doc, next) {    
    const onConnectedCallback = () => {
      next(null, doc);
    };

    if (mongoose.connection.readyState != 1) {
      mongoose.connect(`mongodb://${config.mongoServer}/${dbName}`)
      const db = mongoose.connection;
      db.on('error',
        logger.error.bind(console, `mongodb connection error for ${config.mongoServer}/${dbName}`)
      );
      db.once('open', onConnectedCallback);
    } else {
      onConnectedCallback();
    }
  }
**/

  /**
   * Determine whether this is cancer related study or neurology department
  */
  needToSend(doc, callback) {
    const plainId = doc._uid;

    async.parallel({ 
      crms(cb) {
        //take out filters for neurology and oncology 2015-09-10 EPIC Phase 3
        const request = `select ct._uid, ct._webrUnique_ID id, ccm.isOncologyStudy, cp.name from dbo.__ClinicalTrial ct inner join dbo.__ClinicalTrial_CustomAttributesManager ccm on ct.customAttributes = ccm.oid inner join dbo._Project p on ct.oid = p.oid inner join dbo._ProjectStatus ps on ps.oid = p.status inner join dbo._Classification c on c.oid = ps.oid  left join dbo.[__Study Status] ss on ss.oid = ccm.studyStatus  inner join dbo.[__Study Status_CustomAttributesManager] sscm on ss.customAttributes = sscm.oid  inner join dbo._Company cp1 on cp1.oid = p.company inner join dbo._Person pe on ccm.pi = pe.oid inner join dbo._Person_CustomAttributesManager pec on pec.oid = pe.customAttributes inner join dbo._Company cp on cp.oid = pec.department left join  ( select ccm.oid, COUNT(1) count from dbo.__ClinicalTrial_CustomAttributesManager ccm left join dbo.MainspanSets m0 on m0.setOid = ccm.nyumcLocations left join dbo.__NYULocations loc0 on loc0.oid = m0.elementOid left join dbo.__NYULocations_CustomAttributesManager locm0 on locm0.oid = loc0.customAttributes where loc0.ID is not null group by ccm.oid ) nyumc on nyumc.oid = ccm.oid left join ( select ccm.oid, COUNT(1) count from dbo.__ClinicalTrial_CustomAttributesManager ccm left join dbo.MainspanSets m0 on m0.setOid = ccm.locationsBellevue left join dbo.__NYULocations loc0 on loc0.oid = m0.elementOid left join dbo.__NYULocations_CustomAttributesManager locm0 on locm0.oid = loc0.customAttributes where loc0.ID is not null group by ccm.oid ) bellevue on bellevue.oid = ccm.oid left join ( select ccm.oid, COUNT(1) count from dbo.__ClinicalTrial_CustomAttributesManager ccm left join dbo.MainspanSets m0 on m0.setOid = ccm.locationsVA left join dbo.__NYULocations loc0 on loc0.oid = m0.elementOid left join dbo.__NYULocations_CustomAttributesManager locm0 on locm0.oid = loc0.customAttributes where loc0.ID is not null group by ccm.oid ) va on va.oid = ccm.oid left join ( select ccm.oid, COUNT(1) count from dbo.__ClinicalTrial_CustomAttributesManager ccm left join dbo.MainspanSets m0 on m0.setOid = ccm.nyuSchoolCollegeLocation left join dbo.__NYULocations loc0 on loc0.oid = m0.elementOid left join dbo.__NYULocations_CustomAttributesManager locm0 on locm0.oid = loc0.customAttributes where loc0.ID is not null group by ccm.oid ) som on som.oid = ccm.oid left join ( select ccm.oid, COUNT(1) count from dbo.__ClinicalTrial_CustomAttributesManager ccm left join dbo.MainspanSets m0 on m0.setOid = ccm.locationsOffsiteFgp left join dbo.__NYULocations loc0 on loc0.oid = m0.elementOid left join dbo.__NYULocations_CustomAttributesManager locm0 on locm0.oid = loc0.customAttributes where loc0.ID is not null group by ccm.oid ) other on other.oid = ccm.oid where ct._uid = '${plainId}' and case when coalesce(nyumc.count,0) > 0 or ( coalesce(nyumc.count,0) = 0 and coalesce(bellevue.count,0) = 0 and coalesce(va.count,0) = 0 and coalesce(som.count,0) = 0 and coalesce(other.count,0) = 0 ) then 1 else 0 end = 1 and sscm.Status in ('Active, Not Recruiting', 'Recruiting', 'Closed') `; // +
        const options = { sqlDbName: 'crms', request, promise(err, d) { 
          if (err || !d){
            const a = err ? err.message : 'Yikes.  Empty response!';
            logger.error(`crms: ${plainId} -> ${a}`);
            cb(a);
          } else {
            cb(null, d);
          }        
        } };
        new SqlAdhocHelper(options);
      },
      rnumber(cb) {
        const request = `select rp._uid, rp._webrUnique_ID id, sfcm.name from dbo.[__Research Project] rp inner join dbo._Project p on p.oid = rp.oid inner join dbo._ProjectStatus ps on ps.oid = p.status inner join dbo._Classification c on c.oid = ps.oid inner join dbo.[__Research Project_CustomAttributesManager] rcm on rp.customAttributes = rcm.oid inner join dbo.__StudyDetails sd on rcm.studyDetails = sd.oid inner join dbo.__StudyDetails_CustomAttributesManager ccm on sd.customAttributes = ccm.oid left join dbo.[__Study Focus] sf on ccm.studyFoces = sf.oid left join dbo.[__Study Focus_CustomAttributesManager] sfcm on sfcm.oid = sf.customAttributes where sfcm.name is not null and sfcm.name not in ('Research on human data sets.','Research evaluating educational practices or educational tests.') and c.ID in ('Open', 'In Modification', 'Submitted') and rp._uid = '${plainId}'`;
        const options = { sqlDbName: 'rnumber', request, promise(err, d) { 
          if (err || !d){
            const a = err ? err.message : 'Yikes.  Empty response!';
            logger.error(`rnumber: ${plainId} -> ${a}`);
            cb(a);
          } else {
            cb(null, d);
          }        
        } };
        new SqlAdhocHelper(options);  
      },
      irb(cb) {
        const request = `select s._uid, s._webrUnique_ID id, c.ID status from dbo.__IRBSubmission s inner join dbo._Project p on p.oid = s.oid inner join dbo._ProjectStatus ps on ps.oid = p.status inner join dbo._Classification c on c.oid = ps.oid where c.ID in ('Approved','External IRB') and s._uid = '${plainId}'`;
        const options = { sqlDbName: 'irb', request, promise(err, d) { 
          if (err || !d){
            const a = err ? err.message : 'Yikes.  Empty response!';
            logger.error(`irb: ${plainId} -> ${a}`);
            cb(a);
          } else {
            cb(null, d);
          }        
        } };
        new SqlAdhocHelper(options);
      }
    }, (err, res) => {

      if (err) {
        logger.error(`id: ${plainId} -> ${err.message}`);
        //Next step will handle empty set
        return callback(null, undefined);
      }    
      logger.info(`id: ${plainId}-> ${JSON.stringify(res)}`);
      //Add epic post check to logging
      const m = JSON.stringify(res), now = Date.now();

      doc.update({ $set: { epicInterconnectChecked:1, dateProcessed: now, status: m }, 
        $addToSet: { log: { dateProcessed: now, action: 'epic-check', status: m } } }, {w:1}, err => {
        //no op
      });
      if (res.crms.length > 0 && res.rnumber.length > 0 && res.irb.length > 0) {
        //Succeessful?  Send the CRMS record
        callback(null, res);
      } else {
        callback(null, undefined);
      }
    });
  };

  /**
  * Regardless whether its eligible for EPIC interconnect or not, need to at least process it once and mark it:
  => epicInterconnectChecked:1
  */
  RetrieveProtocolDefResponse(doc, callback) => {
    async.waterfall([
      cb1 => doc,
      
      needToSend,
      
      (res, cb1) => {
        
        if (res && res.crms.length > 0) {
          const [crms] = res.crms;
          const { _uid } = crms; // sql clinical trials id or doc.sourceObjectID        
          //send request to EPIC Interconnect service
          logger.info(`Sending ${id} to EPIC Interconnect`);
          const opts = {id: _uid, action: 'RetrieveProtocolDefResponse', promise: cb1};
          const epicHelper = new EpicInterconnectHelper(opts);
          epicHelper.run();
        } else {
          const msg = `NOT sending ${_uid} to EPIC Interconnect`;
          logger.info(msg);
          cb1({message: msg});
        }
      },
      (request, cb1) => {
        //Wait 1 sec
        setTimeout(() => {
          cb1(null, request);
        }, 1000);
      },
      (request, cb1) => {
        //The message is ready to be sent
        const client = new zerorpc.Client({heartbeatInterval: 10000, timeout: 60}); //default 5000ms
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
      }
      ], (err, results) => {
        let message;
        const epicSentId = (results && results.messageId ? results.messageId : '!!ERROR!!');

        if (err) {
          message = err.message ? err.message : `EPIC not sent: ${doc.sourceObjectID}`; 
          logger.error(message);
        } else {
          message = `EPIC sent succeeded: id=${doc.sourceObjectID} message-id=${epicSentId}`;
        }

        const now = Date.now();

        doc.update(
          { $set: { epicInterconnectChecked:1, epicInterconnectSent: (err ? 0 : 1), dateProcessed: now, epicSentId, status: message }, 
            $addToSet: { log: { dateProcessed: now, action: 'epic-send', epicSentId, status: message } } },
          {w:1},
          err => {
            callback(null, {}); //object with no script attribute
          }
        );
      });  
  }
}
