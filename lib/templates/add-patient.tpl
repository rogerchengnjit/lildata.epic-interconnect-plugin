? '==================================================================================\n'
? '  Add Patient=> Person/Participant/ParticipantRecord/Party/PartyContactInformation/"Postal Contact Information" will be created (NOTE: For DEVELOPMENT/STAGING environment only)\n'
? '==================================================================================\n'
/* 
  1. Create person entity if doesn't exist
*/
var person;
var personQ = ApplicationEntity.getResultSet('Person').query("ID='{{candidateExtension}}'");

if (personQ.count() == 0) {

  person = wom.createTransientEntity('Person');
  ? 'person => ' + person + '\n'

  /*
    1a. update ID of person to be the MRN
  */
  person.ID = '{{candidateExtension}}'
  ? 'Updated person.ID => {{candidateExtension}}\n'

  /*
    1b. Register and initialize Person
  */
  person.registerEntity();
  ? 'Registered person => ' + person + '\n'

  /*
    1c. update firstName of person
  */
  person.firstName = '{{nameGiven}}'
  ? 'Updated person.firstName => {{nameGiven}}\n'

  /*
    1d. update lastName of person
  */
  person.lastName = '{{nameFamily}}'
  ? 'Updated person.lastName => {{nameFamily}}\n'

}
else {
  person = personQ.elements.item(1);
  ? 'Person {{candidateExtension}} already exist\n'
}

/* 
  2. Create participant
*/
var participant;
var participantQ = ApplicationEntity.getResultSet('_Participant').query("customAttributes.medicalRecordNumber='{{candidateExtension}}'");

if (participantQ.count() == 0) {

  participant = wom.createTransientEntity('_Participant');
  ? 'participant => ' + participant + '\n'

  /*
    2a. update ID of participant to be the MRN
  */
  var newParticipantId = '{{candidateExtension}}-' + new Date().getTime();
  participant.ID = newParticipantId
  ? 'Updated participant.ID => ' + newParticipantId + '\n'

  /*
    2b. Register and initialize participant
  */
  participant.registerEntity();
  ? 'Registered participant => ' + participant + '\n'

  /* 
    3. Create participant customattributesmanagers
  */
  var participantAttributes = wom.createEntity('_Participant_CustomAttributesManager');
  ? 'participantAttributes => ' + participantAttributes + '\n'

  /*
    3a. Update MRN attribute
  */
  participantAttributes.medicalRecordNumber = '{{candidateExtension}}'
  ? 'Updated participantAttributes.medicalRecordNumber => {{candidateExtension}}\n'

  /*
    3b. Update dob attribute
  */
  participantAttributes.dateOfBirth = new Date({{dobParsed}})
  ? 'Updated participantAttributes.dateOfBirth => {{dobParsed}}\n'

  /* 
    4. attach attributes to participant
  */
  participant.customAttributes =  participantAttributes;
  ? 'Attached ' + participantAttributes + ' to participant.customAttributes\n'   

  /*
    4a. Initialize participant
  */
  participant.initialize();
  ? 'Initialized participant => ' + participant + '\n'   

  /* 
    5. attach person to partipant attributes
  */
  participant.customAttributes.person = person
  ? 'Attached ' + person + ' to participant.customAttributes.person\n'

}
else {
  participant = participantQ.elements.item(1);
  ? 'Participant {{candidateExtension}} already exist\n'
}

/* 6. 
  create participantrecord
*/
var participantrecord = wom.createTransientEntity('_ParticipantRecord');
? 'participantrecord => ' + participantrecord + '\n'

/*
  6a. update ID of participantrecord to be the MRN + timestamp
*/
var newParticipantRecordId = '{{candidateExtension}}-' + new Date().getTime();
participantrecord.ID = newParticipantRecordId;
? 'Updated participantrecord.ID => ' + newParticipantRecordId + '\n'

/*
  6a-1. update name of participantrecord to be "lastName, firstName"
*/
var fullName = '{{nameFamily}}' + ', ' + '{{nameGiven}}';
participantrecord.name = fullName;
? 'Updated participantrecord.name => ' + fullName + '\n'

/*
  6b. Register and initialize participantrecord
*/
participantrecord.registerEntity();
? 'Registered participantrecord => ' + participantrecord + '\n'

/* 
  7. Create participantrecord customattributesmanagers
*/
var participantrecordAttributes = wom.createEntity('_ParticipantRecord_CustomAttributesManager');
? 'participantrecordAttributes => ' + participantrecordAttributes + '\n'

/* 
  8. attach attributes to participantrecord
*/
participantrecord.customAttributes =  participantrecordAttributes;  
? 'Attached ' + participantrecordAttributes + ' to participantrecord.customAttributes\n'   

/*
  Initialize participantrecord
*/
participantrecord.initialize();
? 'Initialized participantrecord => ' + participantrecord + '\n'   

/*
  Add company and createdBy
*/
var companyQ = ApplicationEntity.getResultSet('Company').query("name = 'NYU School Of Medicine'");
if (companyQ.count() > 0){
  var company = companyQ.elements.item(1);
  participantrecord.company = company  
  ? 'Attached company => ' + company + '\n'
}

var createdByQ = ApplicationEntity.getResultSet('Person').query("lastName = 'Administrator'");
if (createdByQ.count() > 0) {
  var createdBy = createdByQ.elements.item(1);
  participantrecord.createdBy = createdBy;
  ? 'Attached createdBy => ' + createdBy + '\n';
}

/*
  Add status
*/
var statusRef = ApplicationEntity.getResultset('ProjectStatus').query("ID = '{{processState}}'");
if (statusRef.count() == 0) {
  
  ? 'Error => Failed to update processState => {{processState}} for patient: {{nameGiven}} {{nameFamily}}, MRN: {{candidateExtension}}, study: {{plannedStudyExtension}} \n'
  ? 'Error => processState => {{processState}} does not exist\n'

  //Default to Screening
  /**
  statusRef = ApplicationEntity.getResultset('ProjectStatus').query("ID = 'Screening'"); 
  if (statusRef.count() > 0) {
    var projectStatus = statusRef.elements.item(1);
    participantrecord.status = projectStatus;
    ? 'Attached processState => ' + projectStatus.ID + '\n'
  }
  else {
    //Should not be here!!!
    ? 'Error => Failed to update processState => {{processState}} for patient: {{nameGiven}} {{nameFamily}}, MRN: {{candidateExtension}}, study: {{plannedStudyExtension}} \n'
    
    ? 'Error => processState => {{processState}} does not exist\n'
  }
  **/
}
else {
  var projectStatus = statusRef.elements.item(1);
  participantrecord.status = projectStatus;
  ? 'Attached processState => ' + projectStatus.ID + '\n'  
}

/*
  8a. attach participant to participantrecord
*/
participantrecord.customAttributes.participant = participant;
? 'Attached ' + participant + ' to participantrecord.customAttributes.participant\n'

/* 
  9. get the clinical trial
*/
var clinicaltrialset;

if ('{{plannedStudyExtension}}'.search(/-/) != -1) {
  clinicaltrialset = ApplicationEntity.getResultSet('_ClinicalTrial').query("ID like '%{{plannedStudyExtension}}' ");
}
else {
  clinicaltrialset = ApplicationEntity.getResultSet('_ClinicalTrial').query("ID = 'c{{plannedStudyExtension}}' ");
}

? 'clinicaltrialset => ' + clinicaltrialset + ' count => ' + clinicaltrialset.count() + '\n'

/* 
  10. attach the clinical trial to participantrecord attributes
*/
if (clinicaltrialset.count() > 0){
  var clinicalTrial = clinicaltrialset.elements.item(1);
  participantrecord.customAttributes.clinicalTrial = clinicalTrial;
  ? 'Attached ' + clinicalTrial.ID + ' to participantrecord.customAttributes.clinicalTrial\n'

  participantrecord.parentProject = clinicalTrial;
  participantrecord.onCreate(null);
  ? '_ParticipantRecord.onCreate(null) called for ' + participantrecord + '\n'

  if (!participantrecord.resourceContainer) {
    participantrecord.createWorkspace(clinicalTrial.resourceContainer, null);
    ? 'ResourceContainer created => ' + participantrecord.resourceContainer + '\n'
  }
}
else {
  ? 'Error => study {{plannedStudyExtension}} does not exist\n'
}

/* 
  (DEPRECATE) 11. create party entity
  var party = wom.createEntity('Party');
  ? 'party => ' + party + '\n'
  We don't need to create Party, it is created when Person is created and has the same oid
  Internally, they merge as a single entity
*/

/* 
  12. create party contact information entity
*/
var partycontactinfo = wom.createEntity('PartyContactInformation');
? 'partycontactinfo => ' + partycontactinfo + '\n' 

/* 
  13. Before => Attach contact information to party
      After => Attach contact information to person (!)
*/
person.contactInformation = partycontactinfo;
? 'Attached ' + partycontactinfo + ' to person.contactInformation\n'   

/* 
  14. create "_Postal Contact Information" 
*/
var postalContactInfo = wom.createEntity('Postal Contact Information');
? 'postalContactInfo => ' + postalContactInfo + '\n'

/*
  14a. update address1 attribute of "_Postal Contact Information"
*/
postalContactInfo.address1 = '{{streetAddressLine}}'
? 'Updated postalContactInfo.address1 => {{streetAddressLine}}\n'

/*
  14b. update city attribute of "_Postal Contact Information"
*/
postalContactInfo.city = '{{city}}'
? 'Updated postalContactInfo.city => {{city}}\n'

/**
  14c. update stateProvince attribute of "_Postal Contact Information"
  NOTE: .query("shortName = 'New York'") results in "'shortName' is not a key attribute in entity type 'State'"
**/
var stateRef = ApplicationEntity.getResultSet('State').elements; 
for(var i=0; i < stateRef.count(); i++) {
  var shortName = stateRef.item(1+i).shortName;
  if (shortName ==  '{{state}}'){
    postalContactInfo.stateProvince = stateRef.item(1+i);
  }
}

/*
  14d. update postalCode attribute of "_Postal Contact Information"
*/
postalContactInfo.postalCode = '{{postalCode}}'
? 'Updated postalContactInfo.postalCode => {{postalCode}}\n'

/* 
  15. attach postal contact info to contact information
*/
person.contactInformation.addressHome = postalContactInfo;
? 'Attached ' + postalContactInfo + ' to person.contactInformation.addressHome\n'   
