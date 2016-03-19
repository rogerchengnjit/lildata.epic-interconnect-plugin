import jsonQuery from 'json-query';
import fs from 'fs';
import parser from 'xml2js';

/**
  @class
  Custom filter to grab SOAP body and content inside body.
  Used with json-query
  @example
  var body = jsonQuery('{}:validEnvelope', {data: json, locals: exports.query}).value;
**/
export const query = {

  validEnvelope(data) {
    //console.log(data)
    if (typeof data === 'object'){
      const env = this.locals.element(data,'envelope');
      if (env) {
        const b = this.locals.element(env,'body');
        return b;
      }      
    }
    return null;
  },
  element(data, name) {    
    if (typeof data === 'object') {
      const regex = new RegExp(`${name}$`,'i'), keys = Object.keys(data);
      for(let i in keys) {
        const k = keys[i];
        if (regex.test(k)){
          return data[k];
        }
      }
    }
    return null;
  }
}

/**
  @return @object
  @example
  result looks like this:
  {
    "_id": "abcd-1234-efgh-5678"
    "candidateExtension": "9983718",
    "candidateRoot": "9.8.3.8.1.0.1.2.3",
    "streetAddressLine": "650 Park Ave South",
    "city": "NEW YORK",
    "state": "NY",
    "postalCode": "10016",
    "dob": "19580719",
    "dobParsed": -361483200000,
    "plannedStudyExtension": "09-0498",
    "plannedStudyRoot": "1.1.8.7.7",
    "nameGiven": "CoSign",
    "nameFamily": "Dolphin",
    "processState": "Accrued"
  }  

**/
exports.parse = (json, cb) => {

  //Is this a valid soap envelope?
  const body = jsonQuery('{}:validEnvelope', {data: json, locals: exports.query}).value;

  if (!body){
    return cb({message: 'Not a valid soap message.'});
  }
  //Is this an AlertProtocolState or EnrollPatientRequestRequest?
  const action = jsonQuery(['{}:element(?)', 'alertprotocolstate'], {data: body, locals: exports.query}).value
    || 
    jsonQuery(['{}:element(?)', 'enrollpatientrequestrequest'], {data: body, locals: exports.query}).value;
  
  if (!action){
    return cb({message: 'Not a valid patient message.'});
  }
  //Prepopulate: may be missing elements!
  const res = { _id: json._id, streetAddressLine: '',  city: '', state: '', postalCode: '' };
  //Get the processstate    
  const processState = jsonQuery(['{}:element(?)', 'processstate'], {data: action, locals: exports.query}).value;
  //Get the patient
  const patient = jsonQuery(['{}:element(?)', 'patient'], {data: action, locals: exports.query}).value;
  //Get the study
  const studyEl = jsonQuery(['{}:element(?)', 'study'], {data: action, locals: exports.query}).value;
  const studyInstantiation = jsonQuery(['{}:element(?)', 'INSTANTIATION'], {data: studyEl, locals: exports.query}).value;
  const study = jsonQuery(['{}:element(?)', 'PLANNEDSTUDY'], {data: studyInstantiation, locals: exports.query}).value;
  const studyId = jsonQuery(['{}:element(?)', 'ID'], {data: study, locals: exports.query}).value;
  //Get the candidateid element, should not be an array, fixed by EPIC
  const candidateId = jsonQuery(['{}:element(?)', 'CANDIDATEID'], {data: patient, locals: exports.query}).value;
  //Get the patient name element
  const name = jsonQuery(['{}:element(?)', 'NAME'], {data: patient, locals: exports.query}).value;
  const nameGiven = jsonQuery(['{}:element(?)', 'GIVEN'], {data: name, locals: exports.query}).value;
  const nameFamily = jsonQuery(['{}:element(?)', 'FAMILY'], {data: name, locals: exports.query}).value;
  //Get the address element
  const address = jsonQuery(['{}:element(?)', 'ADDRESS'], {data: patient, locals: exports.query}).value;
  //Get DOB
  const dob = jsonQuery(['{}:element(?)', 'dob'], {data: patient, locals: exports.query}).value;

  res.candidateExtension = candidateId['@'].EXTENSION;
  res.candidateRoot = candidateId['@'].ROOT;
  
  /**
    Address
    Sometimes they leave out address parts:
    
    "EP1:ADDRESS" : {
      "STREETADDRESSLINE" : "20 # 306 Apt. 7",
      "CITY" : "La Habana",
      "POSTALCODE" : "99999"
    }

  **/
  function getAddressElement(address, name) {
    return address[name] && address[name]['_'] ? address[name]['_'] : address[name];
  }

  if (address) {
    res.streetAddressLine = getAddressElement(address, 'STREETADDRESSLINE');
    res.city = getAddressElement(address, 'CITY');
    res.state = getAddressElement(address, 'STATE');
    res.postalCode = getAddressElement(address, 'POSTALCODE');
  }
  
  res.dob = dob['@'].VALUE;
  res.dobParsed = new Date(`${res.dob.substring(0,4)}/${res.dob.substring(4,6)}/${res.dob.substring(6,8)}`).getTime();
  res.plannedStudyExtension = studyId['@'].EXTENSION;
  res.plannedStudyRoot = studyId['@'].ROOT;
  res.nameGiven = nameGiven['_'] || nameGiven;
  res.nameFamily = nameFamily['_'] || nameFamily;
  res.processState = processState;

  cb(null, res);
}

/**
  Tests below:
**/

//First, a dummy callback
function cb(err, res) {
  if (err) {
    return console.log(err.message);
  }
  console.log(`SUCCESS=> ${JSON.stringify(res,null,'  ')}`);
}

function noBinding(err, json) {
  if (err) {
    throw err;
  }
  //Here is the test
  exports.parse(json, cb);
}

function test(fileName, callbackTest) {  
  //TEST
  const soapMessage = fs.readFileSync(fileName,{encoding:'utf8'});
  //EXACT options from express-mongo-dump interface
  function removeIllegalKeyChars(name) {
      return name.replace(/\./g, '_');
  }
  const parseOptions = {path: '/dump', attrkey:'@',explicitArray:false,strict:false,tagNameProcessors:[removeIllegalKeyChars],attrNameProcessors:[removeIllegalKeyChars]};
  parser.parseString(soapMessage, parseOptions, callbackTest);
}

//2014
//test('./EnrollPatientRequest2014.xml', noBinding);
//2012
//test('./EnrollPatientRequest.xml', noBinding);
//2012
//test('./AlertProtocolState.xml', noBinding);

/** 
----------------------------------------------------------
  binding test f(x) -> f(y) -> f(z)
  f(z) needs to see x on final callback
---------------------------------------------------------- 
**/

/**
  bind "this" as respondToEPIC to logEverything
**/
logEverything = logEverything.bind(respondToEPIC);

function logEverything(err, results) {
  const json = this.args[0];
  const callback = this.args[1];
  const lastCallback = (err, res) => {
    let message;
    if (err) {
      message = err.message ? err.message : `Patient not sent: ${res.candidateExtension}`; 
      console.error(message);
    }
    else {
      message = `Patient sent succeeded: id=${res.candidateExtension} study-id=${res.plannedStudyExtension} message-id=${results && results.messageId ? results.messageId : '!!ERROR!!'}`;
      console.info(message);
    }
    const now = Date.now();

    const retval = { plannedStudyExtension: res.plannedStudyExtension,
      candidateExtension: res.candidateExtension,
      epicInterconnectChecked: 1, 
      epicInterconnectSent: (err ? 0 : 1),
      error: (err ? 1 : 0), 
      dateProcessed: now, 
      status: message 
    };

    callback(null, retval);
  };
  exports.parse(json, lastCallback);
}

function respondToEPIC(json, callback) {
  //Set arguments as own properties as respondToEPIC
  this.args = Array.prototype.slice.call(arguments);
  logEverything(null, {messageId:'foo-bar-123'});
}

function withBinding(err, json) {
  if (err) {
    throw err;
  }
  //Here is the test
  respondToEPIC(json, cb);
}

//2014
//test('./EnrollPatientRequest2014.xml', withBinding);
//2012
//test('./EnrollPatientRequest.xml', withBinding);
//2012
//test('./AlertProtocolState.xml', withBinding);
