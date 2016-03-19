import _ from 'lodash';
import fs from 'fs';
import Handlebars from 'handlebars';
import async from 'async';
import SqlAdhocHelper from '../../../../../lildata.hack-click-plugin/lib/sql-adhoc-helper';
import util from '../../../../../lildata.hack-click-plugin/lib/common/util';
import config from '../../../../../lildata.hack-click-plugin/config';
import winston from 'winston';

const logger = winston.loggers.get('epic-interconnect');
const waitTime = 5000;
//Native mongo
const MongoClient = require('mongoose/node_modules/mongodb').MongoClient;
const patientCollection =  config.interconnectCollections.patient;
// Connection URL
const url = `mongodb://${config.mongoServer}:27017/dump`;
//2015-09-11 open the gate for all departments
const tpl = `Declare @last_lsn binary(10), @begin_lsn binary(10);SET @last_lsn = sys.fn_cdc_get_max_lsn();SET @begin_lsn = sys.fn_cdc_get_min_lsn('dbo__Project');SELECT CONVERT(varchar(max), @last_lsn, 2) last_lsn, cl.ID processState, par._webrUnique_ID participantId, ct._uid plannedStudyExtension, pcm.medicalRecordNumber candidateExtension, pcm.dateOfBirth dob, p.firstName nameGiven, p.lastName nameFamily, posi.address1 streetAddressLine, posi.address2, posi.city, st.shortName state, posi.postalCode FROM cdc.fn_cdc_get_all_changes_dbo__Project({{{checkBeginLsn begin_lsn}}},@last_lsn,'all') c inner join dbo.__ParticipantRecord par on par.oid = c.oid inner join dbo.__ParticipantRecord_CustomAttributesManager parc on par.customAttributes = parc.oid inner join dbo.__Participant pa on parc.participant = pa.oid inner join dbo.__Participant_CustomAttributesManager pcm on pa.customAttributes = pcm.oid inner join dbo.__ClinicalTrial ct on ct.oid = parc.clinicalTrial inner join dbo.__ClinicalTrial_CustomAttributesManager ccm on ct.customAttributes = ccm.oid inner join dbo._Project pj on ct.oid = pj.oid left join dbo.[__Study Status] ss on ss.oid = ccm.studyStatus inner join dbo.[__Study Status_CustomAttributesManager] sscm on ss.customAttributes = sscm.oid inner join dbo._Company cp1 on cp1.oid = pj.company inner join dbo._Person pe on ccm.pi = pe.oid inner join dbo._Person_CustomAttributesManager pec on pec.oid = pe.customAttributes inner join dbo._Company cp on cp.oid = pec.department inner join dbo._Person p on p.oid = pcm.person left join dbo._Party pty on pty.oid = p.oid left join dbo._PartyContactInformation pci on pci.oid = pty.contactInformation left join dbo.[_Postal Contact Information] posi on posi.oid = pci.addressHome left join dbo._State st on st.oid = posi.stateProvince inner join dbo._Classification cl on cl.oid = c.status where c.__$operation in (4) and isnull(pcm.medicalRecordNumber, '') <> '' and sscm.Status in ('Active, Not Recruiting', 'Recruiting', 'Closed') `;
const cdcTable = 'dbo__Project_CT';

let collection;
let mongoDb;

util.setupFolders();

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
  1.  Get Last lsn got resource
**/
let last_lsn;

const getLastLsn = resource => {
  const p = `${config.cdcFolder}/${resource}`;
  if (fs.existsSync(p)) {
    last_lsn = fs.readFileSync(p, {encoding: 'utf8' }).replace(/"/g, '');    
  }
};

/**
  2.  Setup request from template
**/
const setRequest = (tpl, context) => {
  const template = Handlebars.compile(tpl);
  const body = template(context);
  return body;
};

/**
  3.  register helper for null begin_lsn
**/
Handlebars.registerHelper('checkBeginLsn', value => {
  //case when sys.fn_cdc_map_lsn_to_time(@stored_lsn) is null then @begin_lsn else @stored_lsn end
  /**
    Stored locally as last known last_lsn on disk, PRIOR to cdc cleanup
    When cdc cleanup occurs, sys.fn_cdc_map_lsn_to_time() for the stored lsn will fail
  **/
  const verifiedStoredLsn = `case when sys.fn_cdc_map_lsn_to_time(CONVERT(varbinary(max),'${value}',2)) is null then @begin_lsn else CONVERT(varbinary(max),'${value}',2) end`;
  return !!value ? verifiedStoredLsn : '@begin_lsn';
});

const test = _opt => {
  const opt = _.extend({
    sqlDbName: 'rnumber',
    promise: console.log
  }, _opt);
  new SqlAdhocHelper(opt);
};

const spin(err) = () => {
  if(err)
    logger.error(err.message);

  setTimeout(() => {
    logger.info(`Waited ${waitTime} sec. Restarting cdc()`);
    fetchCdc();
  }, waitTime);
};

/**
  Just insert into dump/... collection, patient.js will pick it up and process
**/
const insertToMongo = (docs, cb) => {
  logger.info(`Loading ${docs.length} cdc status changes to mongo`);

  collection = mongoDb.collection(patientCollection);
  const m = _.map(docs, d => {
    d.action = 'EnrollPatientRequestRequest';
    return {outgoing: d};
  });
  collection.insert(m, {w:1}, cb);
};

const onRequestCallback = (err, d) => {
  if (d && d.length > 0) {
    //Write the last_lsn if available, empty result means already fetched latest cdc
    fs.writeFileSync(`${config.cdcFolder}/${cdcTable}`, JSON.stringify(d[0].last_lsn), {
      encoding: 'utf8'
    });

    insertToMongo(d, spin);
  } else {
    spin();
  }
};

const fetchCdc = () => {
  /**
    Get Last lsn got resource
  **/
  getLastLsn(cdcTable);

  /**
    Set begin_lsn == last_lsn for the resource
  **/
  const req = setRequest(tpl, {begin_lsn: last_lsn});

  test({
    sqlDbName: 'crms',
    request: req,
    promise: onRequestCallback});
}

export default function start() {
  connectToMongo(fetchCdc);
}
