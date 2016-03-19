import async from 'async';
import fs from 'fs';
import _ from 'lodash';
import winston from 'winston';
import Handlebars from 'handlebars';
import socketIoClient from 'socket.io-client';
import parentIdHelper from '../../../lildata.hack-click-plugin/lib/parent-id-helper';
import SqlAdhocHelper from '../../../lildata.hack-click-plugin/lib/sql-adhoc-helper';
import config from '../../../lildata.hack-click-plugin/config';

const logger = winston.loggers.get('epic-interconnect');

//debug console socket service
const socket = socketIoClient(config.socketio);
socket.on('connect', () => {
  logger.info(`Debug Console socket service connected => ${config.socketio}`);
});
socket.on('disconnect', () => {
  logger.error(`Debug Console socket service disconnected => ${config.socketio}`)
});

export default class EPICInterconnect {
  constructor(options) {
    this.options = options;
  }

  run() {
    const func = this[`source${this.options.action}`];
    if (!func){
      return this.options.promise({error: 'Source function not found!'});
    }
    func.call(this);
  }

  sourceRetrieveProtocolDefResponse() {    
    const plainId = parentIdHelper.parse(this.options.id);
    const self = this;

    async.parallel({crms(next) {
        const opt = { sqlDbName: 'crms', promise: next }; 
        opt.request = `select s._webrUnique_ID id, pe.userId pi from dbo.__ClinicalTrial s inner join dbo.__ClinicalTrial_CustomAttributesManager cm on cm.oid = s.customAttributes inner join dbo._Resource r on r.oid = s.oid inner join dbo._Person pe on pe.oid = cm.pi left join dbo.__PortfolioDepartments pd on pd.oid = cm.studyPortfolioDepartment left join dbo.__PortfolioDepartments_CustomAttributesManager pdm on pdm.oid = pd.customAttributes left join dbo._Person pe1 on pe1.oid = pdm.assignedCRMC where s._uid = '${plainId}'`;
        new SqlAdhocHelper(opt);
      },
      irb(next) {
        const opt = { sqlDbName: 'irb', promise: next }; 
        opt.request = `select _webrUnique_ID irb from dbo.__IRBSubmission where _uid = '${plainId}'`;
        new SqlAdhocHelper(opt);
      },
      rnumberRC(next) {
        const opt = { sqlDbName: 'rnumber', promise: next };
        opt.request = `select rp._webrUnique_ID id, pe.userId userId from dbo.[__Research Project] rp inner join dbo.[__Research Project_CustomAttributesManager] rpc on rp.customAttributes = rpc.oid inner join dbo.__StudyDetails sd on sd.oid = rpc.studyDetails inner join dbo.__StudyDetails_CustomAttributesManager sdc on sdc.oid = sd.customAttributes inner join dbo.MainspanSets mp on mp.setOid = sdc.researchCoordinators inner join dbo.[__Research Coordinator] rc on rc.oid = mp.elementOid inner join dbo.[__Research Coordinator_CustomAttributesManager] rcc on rc.customAttributes = rcc.oid inner join dbo._Person pe on pe.oid = rcc.coordinator where pe.accountDisabled = 0 and rp._uid = '${plainId}'`;
        new SqlAdhocHelper(opt);
      },
      rnumber(next) {
        const opt = { sqlDbName: 'rnumber', promise: next }; 
        opt.request = `select rp._webrUnique_ID id, isnull(sdc.NCTNumber,'') nct, rr.name title, sdc.shortDescription text, coalesce(cp1.name,cp.name) dept, coalesce(ccat1._webrunique_id,ccat._webrunique_id,'') deptType, sfcm.name type from dbo.[__Research Project] rp inner join dbo._Resource rr on rr.oid = rp.oid inner join dbo.[__Research Project_CustomAttributesManager] rpc on rp.customAttributes = rpc.oid inner join dbo.__StudyDetails sd on sd.oid = rpc.studyDetails inner join dbo.__StudyDetails_CustomAttributesManager sdc on sdc.oid = sd.customAttributes inner join dbo._Project pj on pj.oid = rp.oid inner join dbo._Company cp on cp.oid = pj.company left join dbo._companycategory ccat on cp.companycategory = ccat.oid left join dbo._Company cp1 on cp1.oid = cp.parent left join dbo._companycategory ccat1 on cp1.companycategory = ccat1.oid left join dbo.[__Study Focus] sf on sdc.studyFoces = sf.oid left join dbo.[__Study Focus_CustomAttributesManager] sfcm on sfcm.oid = sf.customAttributes where rp._uid = '${plainId}'`;
        new SqlAdhocHelper(opt);
      }
    }, (err, results) => {
      const r = {id: '', title: '', text: '', pi: '', coord: '', nct: '', irb: '', dept: '', type: '', coords: []};
      if (results.crms.length > 0) {
        _.extend(r, results.crms[0]);
      }
      if (results.irb.length > 0) {
        _.extend(r, results.irb[0]);
      }
      if (results.rnumber.length > 0) {
        _.extend(r, results.rnumber[0]);
      }
      if (results.rnumberRC && results.rnumberRC.length > 0) {
        r.coords = _.map(results.rnumberRC, d => d.userId.toUpperCase());
      }
      r.id = plainId;      
      const res = self.RetrieveProtocolDefResponse(r);
      self.options.promise(null, res);
    });
  }

  RetrieveProtocolDefResponse(study) {
    let { pi, nct, irb, dept, type, id, title, text, coords } = study;
    title = title.replace(/\]/i,')').replace(/\[/i,'(');
    let sc = [
        {
          code: {code: "PI"},
          value: { code: pi.toUpperCase(), codeSystem: "KID"}
        },
        {
          code: {code: "NCT"},
          value: { value: nct}
        },
        {
          code: {code: "IRB"},
          value: { value: irb}
        },
        {
          code: {code: "DEPT"},
          value: { value: dept}
        },
        {
          code: {code: "TYPE"},
          value: { value: type}
        }
      ];

    _.each(coords, k => {
      sc.push({ 
        code: {code: "COORD"},
        value: { code: k.toUpperCase(), codeSystem: "KID"} });
    });

    return {
      action: "RetrieveProtocolDefResponse",
      classCode: "CLNTRL",
      moodCode: "DEF",
      id,
      title,
      text,
      studyCharacteristics: sc
      };
  }

  compileScript(tpl) {
    logger.info('Using %s.tpl', tpl);
    const target = `${config.workingFolder}/lib/templates/${tpl}.tpl`;
    //Compile patient template
    const addPatientRaw = fs.readFileSync(target, {encoding:'utf8'});
    const addPatientTemplate = Handlebars.compile(addPatientRaw);
    const compiledScript = addPatientTemplate(this.options.data);
    return compiledScript;
  }

  socketSendScript(dcConf) {
    const self = this;
    const r = self.options.data;
    const compiledScript = dcConf.script; 

    if (socket.connected) {
      //Invoke the websocket service
      socket.emit('execute-script', dcConf, (err, data) => {
        const pat = JSON.stringify(r);
        let msg = `Attempting patient => ${pat}\n`;
        msg += `Patient response => ${data}\n`;
        msg += `Script => \n${compiledScript}`;

        /**
          @comment
          Heads up! Look for debug console error messages
          As a pratice, we need to ALWAYS comment domain errors like "? 'Error => Something bad happened\n'
          If it is a compiler error, it will naturally proceed an error message with a "Error" keyword
        **/
        const errorOccurred = data.search(/Error/gi) != -1; 
        
        if (!errorOccurred){
          logger.info(msg);
          //return with the compiled script/results for logging into mongo
          r.message = msg;
          self.options.promise(null, r);
        } else {
          //Will log in patient.js
          self.options.promise({ message: data }); 
        }
      });
    }
    else {
      let msg = `error: Socket closed.  Patient => ${JSON.stringify(r)}\n`;
      msg += `Failed to execute => <<${compiledScript}>>`
      logger.error(msg);
      self.options.promise({ message: msg});    
    }
  }

  getPatient(next) {
    const request = 
    `select  pcm.medicalRecordNumber mrn,  pcm.dateOfBirth dob  from dbo.__Participant_CustomAttributesManager pcm  where  pcm.medicalRecordNumber = '${this.options.data.candidateExtension}'  and  pcm.dateOfBirth = ${this.options.data.dobParsed}`;
    const opt = { sqlDbName: 'crms', promise: next }; 
    opt.request = request;
    new SqlAdhocHelper(opt);
  }

  getPatientWithStudy(next) {
    const self = this;
    const request = 
    `  select    ct._webrUnique_ID,    pj.class + + '[OID[' + CONVERT(varchar(max),pj.oid,2) + ']]' projectStatusOid,    c.ID processState,    r.dateModified,    pcm.medicalRecordNumber mrn,    pcm.dateOfBirth dob,    p.firstName,    p.lastName,    posi.address1,    posi.address2,    posi.city,    st.shortName state,    posi.postalCode  from   dbo.__Participant pa  inner join  dbo.__Participant_CustomAttributesManager pcm  on pa.customAttributes = pcm.oid  inner join dbo.__ParticipantRecord_CustomAttributesManager parc  on  parc.participant = pa.oid  inner join dbo.__ParticipantRecord par  on par.customAttributes = parc.oid  inner join dbo._Resource r  on r.oid = par.oid  inner join dbo._Project pj on pj.oid = par.oid  left join dbo._ProjectStatus ps on ps.oid = pj.status  left join dbo._Classification c on c.oid = ps.oid  inner join dbo.__ClinicalTrial ct  on ct.oid = parc.clinicalTrial  inner join dbo._Person p  on p.oid = pcm.person  left join dbo._Party pty  on pty.oid = p.oid  left join dbo._PartyContactInformation pci  on pci.oid = pty.contactInformation  left join dbo.[_Postal Contact Information] posi  on posi.oid = pci.addressHome  left join dbo._State st  on st.oid = posi.stateProvince  where  ct._uid = '${this.options.data.plannedStudyExtension}'  and   pcm.medicalRecordNumber = '${this.options.data.candidateExtension}'  order by r.dateModified desc`; 
    const opt = { sqlDbName: 'crms', promise(err, res) {
      const args =  Array.prototype.slice.call(arguments);
      next.apply(self, args);
    } }; 
    opt.request = request;
    new SqlAdhocHelper(opt);
  }

  onGetPatientWithStudyCallback(err, res) {
    const self = this;
    const r = this.options.data;

    /*
      Heads up!
      X => If the r.processState == 'Screen Failure', 
      X => AND
      X => first record found most recent (dateModified desc) is not screen failure
      X => THEN
      X => link/add the study, don't update status!
      ------------------------------------------------------------------------------
      2015-11-18

      current                     | incoming | action
      Anything but Screen Failure | whatever | UPDATE
      Screen Failure              | whatever | APPEND
    */
    if (!err && res && res.length > 0 && typeof res[0].processState === 'string' && res[0].processState.search(/Screen\sFailure/i) == -1) {  
      r.projectStatusOid = res[0].projectStatusOid;
      //Compile
      const compiledScript = this.compileScript('update-patient');
      this.dcConf.script = compiledScript;
      //Send for execution
      this.socketSendScript(self.dcConf);
    } else {
      this.getPatient((err, res) => {

        /*
          @comment
          Update!
          If the patient exists, link the study.
          If the patient does not exists, create patient, then link the study.
        */
        const compiledScript = self.compileScript((!err && res && res.length > 0) ? 'link-patient' : 'add-patient' );
        self.dcConf.script = compiledScript;
        //Send for execution
        self.socketSendScript(self.dcConf);
      });
    }
  }

  sourceEnrollPatientRequestRequest() {
    // const self = this;
    this.options.data.action = "EnrollPatientRequestRequest";

    /**
      Invoke hack-click-debug-console websocket service
      websocket server: localhost:7891
    **/
    this.dcConf = { name: 'crms', env: 'STAGING' };
    if (process.env.NODE_ENV && process.env.NODE_ENV == 'production'){
      this.dcConf.env = 'PRODUCTION';
    }
    this.getPatientWithStudy(this.onGetPatientWithStudyCallback);
  }

  sourceEnrollPatientRequestRequestOriginal() {
    const self = this;
    this.options.data.action = "EnrollPatientRequestRequest";

    const next = (err, res) => {
      /**
        Invoke hack-click-debug-console websocket service
        websocket server: localhost:7891
      **/
      const dcConf = { name: 'crms', env: 'STAGING' };
      /** UNCOMMMENT in PRODUCTION **/
      if (process.env.NODE_ENV && process.env.NODE_ENV == 'production'){
        dcConf.env = 'PRODUCTION';
      }
      
      const r = self.options.data;

      if (!err && res && res.length > 0) {
        r.projectStatusOid = res[0].projectStatusOid;
        //Compile
        const compiledScript = self.compileScript('update-patient');
        dcConf.script = compiledScript;
        //Send for execution
        self.socketSendScript(dcConf);
      } else {
        
        //Compile
        /**
          @comment
          Hey READ THIS!
          For testing, it is impossible to have real patient records in both Click and EPIC, so we'll create new Person/Participant records.
          In Production, it is assumed that the participant must already exist in both environment, so we need to only ASSOCIATE the participant to a new ParticipantRecord.
          -- If in production, we cannot find the participant, we'll skip and log the error.
        
          @comment
          Update!
          If the patient exists, link the study.
          If the patient does not exists, create patient, then link the study.
        **/
        self.getPatient(null, (err, res) => {
          const compiledScript = self.compileScript((!err && res && res.length > 0) ? 'link-patient' : 'add-patient' );
          dcConf.script = compiledScript;
          //Send for execution
          self.socketSendScript(dcConf);
        });
      }
    };
    //Now get the results where Person/Participant/ParticipantRecord/ClinicalTrial ALL exist
    this.getPatientWithStudy(null, next);
  }
}
