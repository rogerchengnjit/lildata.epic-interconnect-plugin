? '==================================================================================\n'
? '  Associate Patient to a Study (NOTE: For PRODUCTION environment\n'
? '==================================================================================\n'
/*
  5. Get the participant
*/
var participantRef = ApplicationEntity.getResultSet('_Participant').query("customAttributes.medicalRecordNumber = '{{candidateExtension}}'")
if (participantRef.count() > 0){
  var participant = participantRef.elements.item(1);

  /* 6. 
  create participantrecord
  */
  var participantrecord = wom.createTransientEntity('_ParticipantRecord');
  ? 'participantrecord => ' + participantrecord + '\n'

  /*
    6a. update ID of participant to be the MRN + timestamp
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
    ? 'Error => failed to associate study {{plannedStudyExtension}} to patient {{candidateExtension}}\n' 
    ? 'Error => study {{plannedStudyExtension}} not found.\n'
  }

}
else {
  ? 'Error => failed to associate study {{plannedStudyExtension}} to patient {{candidateExtension}}\n' 
  ? 'Error => patient with MRN {{candidateExtension}} not found.\n'
}

